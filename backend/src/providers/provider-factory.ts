import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createGeminiProvider } from "./gemini.provider";
import { createOpenAIProvider } from "./openai.provider";
import { createGroqProvider } from "./groq.provider";
import { createOllamaProvider } from "./ollama.provider";

import { createOpenAICompatibleProvider } from "./openai-compatible";

export function createAIProvider(env: AppEnv): AIProvider {
  switch (env.ACTIVE_AI_PROVIDER) {
    case "openai":
      return createOpenAIProvider(env);
    case "groq":
      return createGroqProvider(env);
    case "ollama":
      return createOllamaProvider(env);
    case "custom":
      return createOpenAICompatibleProvider({
        name: "custom",
        apiKey: env.CUSTOM_API_KEY || "none",
        baseUrl: env.CUSTOM_BASE_URL,
        defaultModel: env.CUSTOM_CHAT_MODEL,
      });
    case "gemini": {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY não configurada");
      }
      return createGeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        defaultModel: env.GEMINI_CHAT_MODEL,
      });
    }
    default: {
      const _exhaustive: never = env.ACTIVE_AI_PROVIDER;
      return _exhaustive;
    }
  }
}
