import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // .env mora na raiz do monorepo; prefixo '' carrega variáveis sem prefixo VITE_.
  const env = loadEnv(mode, resolve(__dirname, '..'), '');
  const frontendPort = Number(env.FRONTEND_PORT) || 5173;
  const backendPort = Number(env.BACKEND_PORT) || Number(env.PORT) || 3001;

  return {
    plugins: [react()],
    server: {
      host: true,
      port: frontendPort,
      proxy: {
        '/api': `http://localhost:${backendPort}`
      }
    }
  };
});
