export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });

  try {
    const { signals, vibeScore, spice } = req.body || {};
    if (!signals || typeof signals !== "object") {
      return res.status(400).json({ ok: false, error: "Missing signals object" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY env var" });

    const compact = {
      url: signals.url || "",
      langGuess: signals.langGuess || "unknown",
      headline: signals.headline || "",
      primaryCtas: Array.isArray(signals.primaryCtas) ? signals.primaryCtas.slice(0, 10) : [],
      offerDetected: !!signals.offerDetected,
      trustSnippets: Array.isArray(signals.trustSnippets) ? signals.trustSnippets.slice(0, 6) : [],
      popupDetected: !!signals.popupDetected,
      popupTypes: Array.isArray(signals.popupTypes) ? signals.popupTypes.slice(0, 3) : [],
      popupSnippets: Array.isArray(signals.popupSnippets) ? signals.popupSnippets.slice(0, 3) : [],
      words: Number.isFinite(signals.words) ? signals.words : 0,
      clickables: Number.isFinite(signals.clickables) ? signals.clickables : 0,
      vibeScore: Number.isFinite(vibeScore) ? vibeScore : null,
      spice: spice || "spicy"
    };

const system = `
You are Brand Mirror — a top-performing growth marketer with taste.

You decode what a homepage signals in the first 10 seconds:
Identity × Psychology × Conversion.

You are not doing a UX checklist. You are translating signals into:
- who this brand wants to be
- who it actually comes across as
- what that does to conversion

Voice:
- sharp, witty, charming (a wink, not a slap)
- confident and specific
- never cruel, never profane
- zero consultant fluff

Humor style:
- observational, contrast-driven
- “oh no, that’s us” energy
- avoid personal attacks or moral judgment

Spice level: ${compact.spice}.
If spice is "mild": more polite.
If "spicy": sharper.
If "feral": extra punchy but still not cruel.

Writing rules:
- short sentences
- concrete nouns/verbs
- call out contradictions (ambition vs execution)
- ground every claim in the provided signals (headline, CTAs, trust snippets, offers, popups, clickables, word count)
- no corporate verbs: indicates, suggests, demonstrates, leverages, aligns

Scoring behavior:
- If identity is strong and coherent, praise it with a sharp line (still witty).
- If identity is weak or generic, call it out with charm.

Output must be punchy, screenshot-ready, and useful to a growth team.
`;

    // Hard caps to prevent “essay mode”
    const responseSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        verdict: { type: "string" },                 // 1 sentence
        archetype: { type: "string" },               // 2–4 words
        traits: { type: "array", items: { type: "string" }, maxItems: 4 },
        what_it_signals: { type: "array", items: { type: "string" }, maxItems: 3 },
        conversion_risk: { type: "array", items: { type: "string" }, maxItems: 2 },
        fastest_wins: { type: "array", items: { type: "string" }, maxItems: 2 },
        evidence: { type: "array", items: { type: "string" }, maxItems: 3 },
        share_line: { type: "string" }              // <= 140 chars
      },
      required: [
        "verdict",
        "archetype",
        "traits",
        "what_it_signals",
        "conversion_risk",
        "fastest_wins",
        "evidence",
        "share_line"
      ]
    };

const user = `
Homepage signals detected:
${JSON.stringify(compact, null, 2)}

Return JSON that matches the schema exactly.

Output rules (strict):
- verdict: 1 sentence, contrast-driven, slightly witty, not mean. (<= 18 words)
  Prefer the pattern: “X energy, Y execution.” or “You want X, but you ship Y.”
- archetype: 2–4 words, label-worthy, not generic. (No “Retailer/Brand/Company”)
- traits: 3–4 short traits (<= 12 words each)
- what_it_signals: 2–3 psychological signals about identity/status/risk (<= 12 words each)
- conversion_risk: 1–2 risks phrased like a growth marketer (<= 12 words each)
- fastest_wins: 1–2 strategic moves (not cosmetic), action-oriented (<= 12 words each)
- evidence: 2–3 bullets quoting/pointing to actual signals found (headline/CTA/trust/offer/popup counts etc.)
- share_line: tweet-ready, witty with charm (<140 chars). No hashtags.

Hard constraints:
- No generic praise (“clean/modern/professional”).
- No diagnosing intent without evidence (don’t say “insecure” unless signals justify it).
- If signals are missing, say what’s missing in conversion_risk or evidence.
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "brand_mirror_report",
            schema: responseSchema
          }
        }
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ ok: false, error: "OpenAI error", detail: t.slice(0, 1200) });
    }

    const data = await r.json();

    // Robust parsing across Responses variants
    const content = data.output?.[0]?.content?.[0]?.text || data.output_text || null;

    if (!content) {
      return res.status(500).json({
        ok: false,
        error: "No structured content returned",
        debug: data
      });
    }

    const report = JSON.parse(content);
    return res.status(200).json({ ok: true, report });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}