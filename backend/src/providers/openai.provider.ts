import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export function createOpenAIProvider(env: AppEnv): AIProvider {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada");
  }
  return createOpenAICompatibleProvider({
    name: "openai",
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    defaultModel: env.OPENAI_CHAT_MODEL,
  });
}
