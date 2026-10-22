import { loadEnv } from "./config/env";
import { createApp } from "./app";

const env = loadEnv();
const { app, redis, ready, drain } = createApp(env);

ready.then(() => {
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Equilibra API ouvindo na porta ${env.PORT}`);
  });
  let stopping=false;
  function shutdown() {
    if(stopping)return;stopping=true;
    const timeout=setTimeout(()=>process.exit(1),25000);timeout.unref();
    server.close(async()=>{
      await drain();await redis?.quit().catch(()=>undefined);clearTimeout(timeout);process.exit(0);
    });
  }
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}).catch(()=>{
  console.error('Inicialização recusada: confira disco persistente, configuração e chave de cifragem.');
  redis?.disconnect();process.exitCode=1;
});
