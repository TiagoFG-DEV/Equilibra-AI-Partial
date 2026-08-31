import type { SkillDefinition } from "./skill-schema";

export type DomainGateResult =
  | { allowed: true }
  | { allowed: false; reason: "blocked_topic" | "out_of_domain" | "message_too_long" | "injection_suspect" };

const DEFAULT_INJECTION_SNIPPETS = [
  "ignore previous",
  "ignore all previous",
  "disregard your",
  "you are now",
  "new instructions:",
  "system prompt",
  "reveal your prompt",
  "jailbreak",
  "dan mode",
];

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9áàâãéêíóôõúçüñ]+/i)
    .filter((t) => t.length > 1);
}

function matchesTopic(haystack: string, topic: string): boolean {
  const t = normalize(topic);
  if (!t) return false;
  if (haystack.includes(t)) return true;
  const parts = t.split(/\s+/).filter((p) => p.length > 2);
  return parts.length > 0 && parts.every((p) => haystack.includes(p));
}

/**
 * Validação determinística de domínio (MVP).
 * Evolução: classificador leve / embeddings de similaridade com allowed_topics.
 */
export function evaluateDomainGate(
  userMessage: string,
  skill: SkillDefinition,
): DomainGateResult {
  const maxLen = skill.security_rules?.max_user_message_length ?? 8000;
  if (userMessage.length > maxLen) {
    return { allowed: false, reason: "message_too_long" };
  }

  const haystack = normalize(userMessage);
  const tokens = new Set(tokenize(userMessage));

  for (const blocked of skill.blocked_topics) {
    if (matchesTopic(haystack, blocked)) {
      return { allowed: false, reason: "blocked_topic" };
    }
  }

  const jailbreak = [
    ...(skill.security_rules?.jailbreak_patterns ?? []),
    ...DEFAULT_INJECTION_SNIPPETS,
  ];
  for (const pattern of jailbreak) {
    if (haystack.includes(normalize(pattern))) {
      return { allowed: false, reason: "injection_suspect" };
    }
  }

  const topics = skill.allowed_topics;
  const kws = skill.keywords ?? [];

  if (topics.length === 0 && kws.length === 0) {
    return { allowed: true };
  }

  const topicHit =
    topics.some((topic) => matchesTopic(haystack, topic)) ||
    topics.some((topic) => {
      const tt = tokenize(topic);
      return tt.some((w) => tokens.has(w));
    });

  const keywordHit = kws.some((k) => matchesTopic(haystack, k) || tokens.has(normalize(k)));

  if (topicHit || keywordHit) {
    return { allowed: true };
  }

  // Delegamos a avaliação fina de "Fora de Domínio" para o próprio LLM (via System Prompt).
  // O portão determinístico só bloqueia o que é explicitamente proibido (blocked_topics) ou ataques (jailbreak).
  return { allowed: true };
}
