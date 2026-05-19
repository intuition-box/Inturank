import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function graphqlProxyOrigin(env: Record<string, string>): string {
  const isTestnet = String(env.VITE_INTUITION_NETWORK ?? '').trim().toLowerCase() === 'testnet';
  const custom = String(
    isTestnet ? env.VITE_INTUITION_TESTNET_GRAPHQL_URL : env.VITE_INTUITION_MAINNET_GRAPHQL_URL
  ).trim();
  if (custom) {
    try {
      return new URL(custom).origin;
    } catch {
      /* fall through */
    }
  }
  return isTestnet ? 'https://testnet.intuition.sh' : 'https://mainnet.intuition.sh';
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const graphqlTarget = graphqlProxyOrigin(env);

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        // Dev: browser calls /v1/graphql → Vite forwards to active network (see VITE_INTUITION_NETWORK).
        '/v1/graphql': {
          target: graphqlTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ''),
    },
  };
});