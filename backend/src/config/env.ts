import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter ao menos 16 caracteres").default("default_secret_equilibra_nr1_2026"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000,http://127.0.0.1:5500"),
  SKILLS_DIR: z.string().default("../skills"),
  AI_PROVIDER: z.enum(["openai", "groq", "gemini", "ollama", "custom"]).default("groq"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  GROQ_CHAT_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().default("gemini-1.5-flash"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434/v1"),
  OLLAMA_CHAT_MODEL: z.string().default("llama3.2"),
  CUSTOM_API_KEY: z.string().optional(),
  CUSTOM_BASE_URL: z.string().default("http://localhost:8000/v1"),
  CUSTOM_CHAT_MODEL: z.string().default("custom-model-rh"),
  // WhatsApp Business Cloud API (Meta Oficial)
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default("equilibra_meta_webhook_token_2026"),
  WHATSAPP_API_VERSION: z.string().default("v20.0"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  ACTIVE_AI_PROVIDER: "openai" | "groq" | "gemini" | "ollama" | "custom";
};

export function loadEnv(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Variáveis de ambiente inválidas");
  }

  const data = parsed.data;
  const activeProvider = data.AI_PROVIDER;

  if (activeProvider === "groq" && !data.GROQ_API_KEY) {
    console.warn("Aviso: GROQ_API_KEY não foi informada no .env. Configure sua chave para usar o provedor Groq.");
  } else if (activeProvider === "openai" && !data.OPENAI_API_KEY) {
    console.warn("Aviso: OPENAI_API_KEY não foi informada no .env.");
  } else if (activeProvider === "gemini" && !data.GEMINI_API_KEY) {
    console.warn("Aviso: GEMINI_API_KEY não foi informada no .env.");
  }

  return {
    ...data,
    ACTIVE_AI_PROVIDER: activeProvider,
  };
}
