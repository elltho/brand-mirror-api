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

You decode what a homepage signals in the first 10 seconds —
about identity, status, confidence, risk tolerance, and conversion friction.

You are not evaluating design.
You are diagnosing positioning psychology.

Tone:
- Sharp, perceptive, slightly provocative
- Witty but controlled
- Never cruel, never profane
- Confident and decisive
- No consultant fluff

Style:
- Highlight contradictions
- Expose identity tension
- Surface subtle insecurity signals
- Call out category conformity
- Translate signals into what they imply about ambition and confidence

If a brand wants to feel bold but behaves safely, say it.
If it signals premium but uses discount cues, say it.
If it blends into its category, say it clearly.

Make it feel like:
“You’re not wrong. You’re just not as bold as you think.”

Always tie conclusions to actual signals.
Keep it short. Keep it sharp. Keep it screenshot-worthy.
Prioritize clarity over cleverness. If a sharper phrasing exists, use it.
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

Output rules (strict):

- verdict: ONE punchy sentence exposing the core identity tension.
- archetype: 2–4 word positioning label (memorable, not generic).
- traits: 3–4 projected identity traits.
- what_it_signals: 2–3 psychological signals about confidence or status.
- what_it_implies: 1–2 positioning or conversion frictions.
- fastest_wins: 1–2 strategic shifts (not cosmetic tweaks).
- evidence: cite real signals (headline, CTA text, trust snippets, offers, popups).
- share_line: witty and tweet-ready (<140 characters).

Constraints:
- Each list item max 12 words.
- Avoid safe corporate language.
- If the brand plays it safe, call that out.
- Expose the positioning gap directly. Do not soften it with poetic language.
- Do not soften the take.
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