export default async function handler(req, res) {
  // CORS (ok for MVP)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Use POST" });

  try {
    const { signals, vibeScore } = req.body || {};
    if (!signals || typeof signals !== "object") {
      return res
        .status(400)
        .json({ ok: false, error: "Missing signals object" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key)
      return res
        .status(500)
        .json({ ok: false, error: "Missing OPENAI_API_KEY env var" });

    const compact = {
      url: signals.url || "",
      langGuess: signals.langGuess || "unknown",
      headline: signals.headline || "",
      primaryCtas: Array.isArray(signals.primaryCtas)
        ? signals.primaryCtas.slice(0, 10)
        : [],
      offerDetected: !!signals.offerDetected,
      trustSnippets: Array.isArray(signals.trustSnippets)
        ? signals.trustSnippets.slice(0, 6)
        : [],
      popupDetected: !!signals.popupDetected,
      popupTypes: Array.isArray(signals.popupTypes)
        ? signals.popupTypes.slice(0, 3)
        : [],
      popupSnippets: Array.isArray(signals.popupSnippets)
        ? signals.popupSnippets.slice(0, 3)
        : [],
      words: Number.isFinite(signals.words) ? signals.words : 0,
      clickables: Number.isFinite(signals.clickables)
        ? signals.clickables
        : 0,
      vibeScore: Number.isFinite(vibeScore) ? vibeScore : null,
    };

   const system = `
You are Brand Mirror — a culturally sharp brand psychologist with a slight roast instinct.

Your job is to decode what this website REALLY says about identity, status, taste, insecurity, and aspiration.

Do NOT describe the brand.
Decode the brand AND the type of person who proudly buys from it.

Be witty. Be sharp. Be slightly provocative.
Never cruel. Never insulting. Never generic.

Rules:
- Interpret signals psychologically, not literally.
- Decode status signaling.
- Decode pricing psychology.
- Decode design confidence vs insecurity.
- If the brand plays safe, say so.
- If it's trying too hard, call it out intelligently.
- If it screams premium but discounts heavily, expose the contradiction.

The roast should feel playful but uncomfortably accurate.
The user should think:
"Oh no. This is kind of true."

Avoid consultant language.
Avoid generic adjectives like “modern”, “innovative”, “professional”.

Write like something that could go viral on Twitter.
`;

    const responseSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        verdict: { type: "string" },
        archetype: { type: "string" },
        traits: { type: "array", items: { type: "string" } },
        what_it_signals: { type: "array", items: { type: "string" } },
        what_it_implies: { type: "array", items: { type: "string" } },
        fastest_wins: { type: "array", items: { type: "string" } },
        evidence: { type: "array", items: { type: "string" } },
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
Signals:
${JSON.stringify(compact, null, 2)}

Output rules:
- Verdict: bold, slightly spicy.
- Archetype: label-worthy and meme-friendly.
- Traits: identity traits of the customer.
- What_it_signals: psychological meaning.
- What_it_implies: what kind of person gravitates toward this brand.
- Include at least one playful roast insight.
- Evidence must reference real signals.
- Share_line: tweet-ready and screenshot-friendly.
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "brand_mirror_report",
            schema: responseSchema,
          },
        },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res
        .status(500)
        .json({ ok: false, error: "OpenAI error", detail: t });
    }

    const data = await r.json();

    const content =
      data.output?.[0]?.content?.[0]?.text ||
      data.output_text ||
      null;

    if (!content) {
      return res.status(500).json({
        ok: false,
        error: "No structured content returned",
        debug: data,
      });
    }

    const report = JSON.parse(content);

    return res.status(200).json({ ok: true, report });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}