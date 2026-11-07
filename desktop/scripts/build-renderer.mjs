import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../../frontend/', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../renderer/', import.meta.url));
const requireFromFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { build } = await import(pathToFileURL(requireFromFrontend.resolve('vite')).href);

// Reuse the actual web renderer. Do not inherit a web deployment's remote API URL.
await build({
  root: frontendRoot,
  configFile: fileURLToPath(new URL('../../frontend/vite.config.ts', import.meta.url)),
  base: '/',
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
  build: { outDir: outputDirectory, emptyOutDir: true },
});
