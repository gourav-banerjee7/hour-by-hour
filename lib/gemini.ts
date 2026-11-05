export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

/** Calls Gemini and returns the parsed JSON that matches `schema`. */
export async function geminiJson<T>(opts: { system: string; prompt: string; schema: unknown; maxTokens?: number }): Promise<T> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: opts.maxTokens ?? 2000, responseMimeType: "application/json", responseSchema: opts.schema },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return JSON.parse(text) as T;
}
