import express from "express";
import path from "node:path";
import type { AppEnv } from "./config/env";
import { securityHeaders, corsMiddleware, sanitizeChatBody } from "./middleware/security";
import { createApiRateLimiter } from "./middleware/rate-limit";
import { createRedis } from "./lib/redis";
import { createAIProvider } from "./providers/provider-factory";
import { SkillLoader } from "./services/skill-loader";
import { ChatService } from "./services/chat.service";
import { AuthService } from "./services/auth.service";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { skillsRouter } from "./routes/skills.routes";
import { chatRouter } from "./routes/chat.routes";
import { conversationsRouter } from "./routes/conversations.routes";
import { widgetRouter } from "./routes/widget.routes";
import type Redis from "ioredis";

export type AppContext = {
  env: AppEnv;
  redis: Redis | null;
};

export function createApp(env: AppEnv) {
  const redis = createRedis(env);
  const skillsDir = path.resolve(process.cwd(), env.SKILLS_DIR);
  const skillLoader = new SkillLoader(skillsDir);
  const provider = createAIProvider(env);
  const chatService = new ChatService(skillLoader, provider);
  const authService = new AuthService(env);

  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders());
  app.use(corsMiddleware(env));
  app.use(express.json({ limit: "512kb" }));

  const limiter = createApiRateLimiter(redis, env);

  app.use(healthRouter());

  const api = express.Router();
  api.use(limiter);
  api.use("/auth", authRouter(authService));
  api.use(skillsRouter(skillLoader));
  api.use("/widget", widgetRouter(chatService, skillLoader));
  api.use(sanitizeChatBody);
  api.use(chatRouter(chatService, authService));
  api.use(conversationsRouter(authService));

  app.use(express.static(path.join(process.cwd(), "public"))); // Serve o widget.js
  app.use("/api", api);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  });

  return { app, redis, skillLoader };
}
