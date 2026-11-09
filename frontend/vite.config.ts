import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const host = loadEnv(mode, '..', 'BACKEND_HOST').BACKEND_HOST || '127.0.0.1';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:8080`, changeOrigin: true, ws: true } },
    },
  };
});
