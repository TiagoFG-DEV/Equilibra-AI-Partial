import Redis from "ioredis";
import type { AppEnv } from "../config/env";

export function createRedis(env: AppEnv): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  try {
    return new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true });
  } catch {
    return null;
  }
}
