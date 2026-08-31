import { loadEnv } from "./config/env";
import { createApp } from "./app";

const env = loadEnv();
const { app, redis } = createApp(env);

const server = app.listen(env.PORT, () => {
  console.log(`MODEL backend em http://localhost:${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    redis?.quit().catch(() => undefined);
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
