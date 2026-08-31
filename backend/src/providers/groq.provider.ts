import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export function createGroqProvider(env: AppEnv): AIProvider {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY não configurada");
  }
  return createOpenAICompatibleProvider({
    name: "groq",
    apiKey: env.GROQ_API_KEY,
    baseUrl: env.GROQ_BASE_URL,
    defaultModel: env.GROQ_CHAT_MODEL,
  });
}
