import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export function createGroqProvider(env: AppEnv): AIProvider {
  const apiKey = env.GROQ_API_KEY?.trim() || "";
  if (!apiKey) {
    console.warn("Aviso: GROQ_API_KEY não foi informada no arquivo .env. Configure sua chave para chamadas reais ao Groq.");
  }
  return createOpenAICompatibleProvider({
    name: "groq",
    apiKey: apiKey || "missing_key",
    baseUrl: env.GROQ_BASE_URL,
    defaultModel: env.GROQ_CHAT_MODEL,
  });
}
