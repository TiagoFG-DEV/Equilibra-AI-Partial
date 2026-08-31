import { z } from "zod";

const nonEmptyString = z.string().min(1);

export const SkillSchema = z.object({
  id: z.string().min(1).optional(),
  version: z.string().default("1.0.0"),
  name: nonEmptyString,
  description: nonEmptyString,
  role: nonEmptyString,
  personality: z.record(z.string(), z.unknown()).optional(),
  tone: z
    .object({
      style: z.string().optional(),
      formality: z.enum(["low", "medium", "high"]).optional(),
      notes: z.string().optional(),
    })
    .optional(),
  identity: z
    .object({
      display_name: z.string().optional(),
      locale: z.string().optional(),
      avatar_hint: z.string().optional(),
    })
    .optional(),
  allowed_topics: z.array(nonEmptyString).default([]),
  blocked_topics: z.array(nonEmptyString).default([]),
  keywords: z.array(nonEmptyString).default([]),
  response_rules: z.array(nonEmptyString).default([]),
  response_style: z
    .object({
      max_paragraphs: z.number().int().positive().optional(),
      prefer_bullets: z.boolean().optional(),
      cite_sources_when_rag: z.boolean().optional(),
    })
    .optional(),
  knowledge_sources: z
    .array(
      z.object({
        type: z.enum(["url", "document", "api", "internal"]),
        ref: z.string(),
        description: z.string().optional(),
        allowed: z.boolean().default(true),
      }),
    )
    .default([]),
  search_rules: z
    .object({
      enabled: z.boolean().default(false),
      allowed_domains: z.array(z.string()).default([]),
      max_results: z.number().int().positive().optional(),
      require_domain_match: z.boolean().default(true),
    })
    .optional(),
  security_rules: z
    .object({
      block_pii_output: z.boolean().optional(),
      jailbreak_patterns: z.array(z.string()).optional(),
      max_user_message_length: z.number().int().positive().optional(),
    })
    .optional(),
  limits: z
    .object({
      max_tokens: z.number().int().positive().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  behavior: z
    .object({
      refuse_out_of_domain: z.boolean().default(true),
      allow_small_talk: z.boolean().default(false),
      depth: z.enum(["concise", "balanced", "deep"]).default("balanced"),
    })
    .optional(),
  tools: z
    .array(
      z.object({
        name: z.string(),
        enabled: z.boolean().default(false),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
  prompt: nonEmptyString,
  fallback_message: nonEmptyString,
  internal_instructions: z.string().optional(),
});

export type SkillDefinition = z.infer<typeof SkillSchema>;

export function parseSkillJson(data: unknown): SkillDefinition {
  return SkillSchema.parse(data);
}

export function safeParseSkillJson(data: unknown) {
  return SkillSchema.safeParse(data);
}
