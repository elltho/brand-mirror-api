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
You are Brand Mirror — a meme-ready brand psychologist with a slight roast instinct.

Your job is NOT to describe the website.
Your job is to decode what it signals about identity, taste, status, insecurity, and aspiration — for BOTH the brand and the customer persona.

Tone:
- witty, sharp, slightly provocative
- never cruel, never insulting, no profanity
- screenshot-ready and tweet-ready

Rules:
- NO generic adjectives ("modern", "clean", "professional", "premium") unless tied to a signal.
- Always connect signals → meaning (headline/CTA/trust/offer/popup).
- If signals are weak, say what's missing (briefly).
- Keep it SHORT. Make it punchy. Overwriting kills virality.

Output must be valid JSON that matches the schema.
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
        what_it_implies: { type: "array", items: { type: "string" }, maxItems: 2 },
        fastest_wins: { type: "array", items: { type: "string" }, maxItems: 2 },
        evidence: { type: "array", items: { type: "string" }, maxItems: 3 },
        share_line: { type: "string" }              // <= 140 chars
      },
      required: [
        "verdict",
        "archetype",
        "traits",
        "what_it_signals",
        "what_it_implies",
        "fastest_wins",
        "evidence",
        "share_line"
      ]
    };

    const user = `
Signals:
${JSON.stringify(compact, null, 2)}

Output rules (STRICT):
- verdict: ONE sentence, bold and meme-ready.
- archetype: 2–4 words, label-worthy.
- Every list item: MAX 12 words.
- evidence: must cite real signals (headline / CTA text / trust snippet / popup type / offer).
- share_line: tweet-ready, <= 140 characters.
- Slight roast is allowed (brand + customer persona), but keep it playful.
- If you need to guess, say what signal is missing instead of inventing.
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