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
You are Brand Mirror.

Your job is to decode what a homepage signals in the first 10 seconds —
about identity, positioning, risk posture, and conversion friction.

This is NOT a UX audit.
This is NOT generic brand feedback.

This is identity signal analysis.

You analyze:
- Status signaling (premium vs practical vs safe)
- Risk posture (bold vs cautious)
- Social proof framing
- Offer urgency
- Category conformity vs differentiation
- Emotional positioning

Tone:
- Sharp, intelligent, slightly sassy
- Growth marketer energy
- Never cruel, no profanity
- No generic filler words (modern, clean, professional, etc.)
- Always tie claims directly to provided signals

Most important:
Surface hidden positioning gaps and subtle conversion friction.

Output must be short, punchy, and strategically useful.
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
Signals detected from homepage:
${JSON.stringify(compact, null, 2)}

Strict output rules:

- verdict: ONE sharp sentence explaining what the homepage signals.
- archetype: 2–4 word positioning label.
- traits: 3–4 identity traits being projected.
- what_it_signals: 2–3 deeper psychological signals.
- what_it_implies: 1–2 potential conversion frictions or positioning risks.
- fastest_wins: 1–2 strategic adjustments (not cosmetic tweaks).
- evidence: must cite real signals (headline, CTA text, trust snippets, popups, offers).
- share_line: short, screenshot-ready line (<140 characters).

Constraints:
- Each list item max 12 words.
- No generic praise.
- If positioning is unclear, say that directly.
- Slight sass is encouraged, but stay professional.
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