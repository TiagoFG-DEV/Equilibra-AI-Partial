import type { AIProvider } from "./ai-provider.types";

/**
 * Claude (Anthropic) usa o formato Messages API, diferente do OpenAI.
 * Integração nativa: implementar chamadas HTTP para https://api.anthropic.com/v1/messages
 * Alternativa comercial: expor um gateway compatível com OpenAI e reutilizar `openai-compatible.ts`.
 */
export function createClaudeProviderPlaceholder(): AIProvider {
  throw new Error(
    "Claude não está ligado no factory por padrão. Use um gateway OpenAI-compatível ou implemente Messages API aqui.",
  );
}
