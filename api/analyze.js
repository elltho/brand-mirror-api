export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });

  try {
    const { signals } = req.body || {};
    if (!signals || typeof signals !== "object") {
      return res.status(400).json({ ok: false, error: "Missing signals object" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY env var" });

    const compact = {
      url: signals.url || "",
      langGuess: signals.langGuess || "unknown",
      headline: signals.headline || "",
      h1: signals.h1 || "",
      primaryCtas: signals.primaryCtas || [],
      offerDetected: !!signals.offerDetected,
      trustSnippets: signals.trustSnippets || [],
      popupDetected: !!signals.popupDetected,
      popupTypes: signals.popupTypes || [],
      words: signals.words ?? 0,
      clickables: signals.clickables ?? 0
    };

    const system = `
You are "Brand Mirror", a growth-savvy brand strategist.
Be funny and sharp, never cruel. No profanity.
You MUST ground every claim in the provided signals.
Output MUST be valid JSON following the schema.
`;

    const schema = {
      name: "brand_mirror",
      schema: {
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
        required: ["verdict","archetype","traits","what_it_signals","what_it_implies","fastest_wins","evidence","share_line"]
      }
    };

    const user = `
Signals:
${JSON.stringify(compact, null, 2)}

Write in English. Make it feel "spot on" and screenshot-friendly.
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        text: { format: { type: "json_schema", json_schema: schema } }
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ ok: false, error: "OpenAI error", detail: t.slice(0, 800) });
    }

    const data = await r.json();
    const jsonText = data.output_text || null;
    if (!jsonText) return res.status(500).json({ ok: false, error: "No output_text" });

    const report = JSON.parse(jsonText);
    return res.status(200).json({ ok: true, report });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}