import type { AIProvider, ChatMessage, ChatOptions } from "./ai-provider.types";

type GeminiConfig = {
  apiKey: string;
  defaultModel: string;
};

function buildGeminiPayload(messages: ChatMessage[]) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const contents = rest.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  return {
    systemInstruction: systemText
      ? { parts: [{ text: systemText }] }
      : undefined,
    contents,
  };
}

/**
 * Provider Gemini via REST — chat; stream retorna o texto completo em um único yield.
 */
export function createGeminiProvider(cfg: GeminiConfig): AIProvider {
  const name = "gemini";

  return {
    name,

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
      const model = options?.model ?? cfg.defaultModel;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;
      const { systemInstruction, contents } = buildGeminiPayload(messages);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction,
          tools: [
            {
              googleSearch: {}
            }
          ],
          generationConfig: {
            temperature: options?.temperature ?? 0.4,
            maxOutputTokens: options?.maxTokens,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini chat error: ${res.status} ${err}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
      if (!text) throw new Error("Gemini: resposta vazia");
      return text;
    },

    async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
      const full = await this.chat(messages, options);
      yield full;
    },

    async embeddings(texts: string[]): Promise<number[][]> {
      const model = "text-embedding-004";
      const out: number[][] = [];
      for (const text of texts) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${cfg.apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text }] },
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gemini embeddings error: ${res.status} ${err}`);
        }
        const data = (await res.json()) as { embedding?: { values?: number[] } };
        const vec = data.embedding?.values;
        if (!vec) throw new Error("Gemini: embedding vazio");
        out.push(vec);
      }
      return out;
    },
  };
}
