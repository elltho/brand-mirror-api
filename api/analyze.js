export default async function handler(req, res) {
  // CORS (ok for MVP)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });

  try {
    const { signals, vibeScore } = req.body || {};
    if (!signals || typeof signals !== "object") {
      return res.status(400).json({ ok: false, error: "Missing signals object" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY env var" });

    // Keep payload small and stable (cost + reliability)
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
      vibeScore: Number.isFinite(vibeScore) ? vibeScore : null
    };

    const system = [
      "You are Brand Mirror: a growth-savvy brand strategist.",
      "Be funny and sharp, never cruel. No profanity.",
      "Be specific. NO generic vibes.",
      "Every claim must be grounded in the provided signals. If uncertain, say what is missing.",
      "Write in English."
    ].join("\n");

    // IMPORTANT: This MUST be a JSON Schema whose ROOT type is object.
    const responseSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        verdict: { type: "string" },
        archetype: { type: "string" },
        traits: { type: "array", items: { type: "string" }, maxItems: 5 },
        what_it_signals: { type: "array", items: { type: "string" }, maxItems: 5 },
        what_it_implies: { type: "array", items: { type: "string" }, maxItems: 4 },
        fastest_wins: { type: "array", items: { type: "string" }, maxItems: 3 },
        evidence: { type: "array", items: { type: "string" }, maxItems: 6 },
        share_line: { type: "string" }
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
Signals (do not invent anything beyond this):
${JSON.stringify(compact, null, 2)}

Output rules:
- Make verdict a punchy 1-liner (funny but accurate).
- Archetype: 2–4 words (e.g., "Discount-Driven Optimizer").
- Traits: 3–5 short traits.
- Evidence: quote/point to items from signals (headline, CTA labels, trust snippets, popup types, etc.)
- Share_line: 1 sentence, screenshot-friendly.
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
    const jsonText = data.output_text;

    if (!jsonText) {
      return res.status(500).json({ ok: false, error: "No output_text from OpenAI" });
    }

    const report = JSON.parse(jsonText);
    return res.status(200).json({ ok: true, report });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}