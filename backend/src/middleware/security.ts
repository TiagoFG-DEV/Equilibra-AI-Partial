import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import type { AppEnv } from "../config/env";

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  });
}

export function corsMiddleware(env: AppEnv) {
  const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  return cors({
    origin: env.NODE_ENV === "production" ? origins : true,
    credentials: true,
  });
}

const CTRL = /[\u0000-\u001F\u007F]/g;

/**
 * Sanitização leve + limite de tamanho por mensagem (camada extra além do Zod).
 */
export function sanitizeChatBody(req: Request, res: Response, next: NextFunction) {
  const body = req.body as { messages?: Array<{ content?: string }> };
  if (!body?.messages?.length) return next();
  for (const m of body.messages) {
    if (typeof m.content === "string") {
      m.content = m.content.replace(CTRL, "").trim();
    }
  }
  next();
}
