import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type Redis from "ioredis";
import type { AppEnv } from "../config/env";

export function createApiRateLimiter(redis: Redis | null, env: AppEnv) {
  if (redis) {
    return rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redis.call(...args) as Promise<unknown>,
      }),
    });
  }

  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
