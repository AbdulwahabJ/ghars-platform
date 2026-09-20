import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT is only needed for the dev/preview server. A production build
// (`vite build`) must not require it — the deploy build environment does
// not provide one.
function resolvePort(): number {
  const rawPort = process.env.PORT;
  if (!rawPort) {
    throw new Error(
      'PORT environment variable is required but was not provided.',
    );
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  return port;
}

// The app is served from the domain root in production.
const basePath = process.env.BASE_PATH ?? '/';

function resolveBuildId(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  if (process.env.REPLIT_DEPLOYMENT_ID) return process.env.REPLIT_DEPLOYMENT_ID;
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'development';
  }
}

export default defineConfig(async ({ command, mode }) => {
  // Vitest loads Vite with command === "serve" and mode === "test", but it
  // does not expose the application HTTP server and therefore needs no port.
  const port = command === 'serve' && mode !== 'test' ? resolvePort() : 0;
  return {
  base: basePath,
  define: {
    __APP_BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
