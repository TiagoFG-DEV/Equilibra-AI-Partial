import type { AIProvider, ChatMessage, ChatOptions } from "./ai-provider.types";

type OpenAICompatibleConfig = {
  name: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
};

async function* readSseChunks(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      const data = line.slice("data: ".length).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const chunk = json.choices?.[0]?.delta?.content;
        if (chunk) yield chunk;
      } catch {
        /* ignore parse errors for keep-alive lines */
      }
    }
  }
}

export function createOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): AIProvider {
  return {
    name: cfg.name,

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model ?? cfg.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.4,
          max_tokens: options?.maxTokens,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${cfg.name} chat error: ${res.status} ${err}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${cfg.name}: resposta vazia`);
      return text;
    },

    async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model ?? cfg.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.4,
          max_tokens: options?.maxTokens,
          stream: true,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        throw new Error(`${cfg.name} stream error: ${res.status} ${err}`);
      }
      yield* readSseChunks(res.body);
    },

    async embeddings(texts: string[]): Promise<number[][]> {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: texts,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${cfg.name} embeddings error: ${res.status} ${err}`);
      }
      const data = (await res.json()) as {
        data?: Array<{ embedding: number[] }>;
      };
      const rows = data.data?.map((d) => d.embedding) ?? [];
      if (rows.length !== texts.length) {
        throw new Error(`${cfg.name}: embeddings incompletas`);
      }
      return rows;
    },
  };
}
