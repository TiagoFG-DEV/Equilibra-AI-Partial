import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export function createOpenAIProvider(env: AppEnv): AIProvider {
  const apiKey = env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) {
    console.warn("Aviso: OPENAI_API_KEY não foi informada no arquivo .env.");
  }
  return createOpenAICompatibleProvider({
    name: "openai",
    apiKey: apiKey || "missing_key",
    baseUrl: env.OPENAI_BASE_URL,
    defaultModel: env.OPENAI_CHAT_MODEL,
  });
}
