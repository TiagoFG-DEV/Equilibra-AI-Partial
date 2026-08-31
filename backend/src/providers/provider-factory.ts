import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createGeminiProvider } from "./gemini.provider";
import { createOpenAIProvider } from "./openai.provider";
import { createGroqProvider } from "./groq.provider";
import { createOllamaProvider } from "./ollama.provider";

export function createAIProvider(env: AppEnv): AIProvider {
  switch (env.ACTIVE_AI_PROVIDER) {
    case "openai":
      return createOpenAIProvider(env);
    case "groq":
      return createGroqProvider(env);
    case "ollama":
      return createOllamaProvider(env);
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
