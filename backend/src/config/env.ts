import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória (PostgreSQL)"),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter ao menos 16 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  SKILLS_DIR: z.string().default("../skills"),
  AI_PROVIDER: z.enum(["openai", "groq", "gemini", "ollama"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  GROQ_CHAT_MODEL: z.string().default("llama-3.1-8b-instant"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().default("gemini-1.5-flash"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434/v1"),
  OLLAMA_CHAT_MODEL: z.string().default("llama3.2"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(60),
});

export type AppEnv = z.infer<typeof EnvSchema> & { ACTIVE_AI_PROVIDER: "openai" | "groq" | "gemini" | "ollama" };

export function loadEnv(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Variáveis de ambiente inválidas");
  }

  const data = parsed.data;

  const activeKeys: string[] = [];
  if (data.OPENAI_API_KEY) activeKeys.push("openai");
  if (data.GROQ_API_KEY) activeKeys.push("groq");
  if (data.GEMINI_API_KEY) activeKeys.push("gemini");

  if (activeKeys.length > 1) {
    throw new Error(`Conflito: Múltiplas chaves de API detectadas (${activeKeys.join(', ')}). Por favor, mantenha apenas uma configurada no arquivo .env e deixe as outras em branco ou comentadas.`);
  }

  let activeProvider: "openai" | "groq" | "gemini" | "ollama" = "openai";

  if (activeKeys.length === 1) {
    activeProvider = activeKeys[0] as "openai" | "groq" | "gemini";
  } else if (data.AI_PROVIDER === "ollama") {
    activeProvider = "ollama";
  } else {
    throw new Error("Nenhuma chave de API detectada. Configure OPENAI_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY no arquivo .env (ou defina AI_PROVIDER=ollama se for rodar localmente).");
  }

  return {
    ...data,
    ACTIVE_AI_PROVIDER: activeProvider
  };
}
