import type { AppEnv } from "../config/env";
import type { AIProvider } from "./ai-provider.types";
import { createOpenAICompatibleProvider } from "./openai-compatible";

/** Ollama expõe API compatível com OpenAI em /v1 */
export function createOllamaProvider(env: AppEnv): AIProvider {
  return createOpenAICompatibleProvider({
    name: "ollama",
    apiKey: "ollama",
    baseUrl: env.OLLAMA_BASE_URL,
    defaultModel: env.OLLAMA_CHAT_MODEL,
  });
}
