import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const processProxyTarget = process.env.VITE_DEV_PROXY_TARGET || process.env.VITE_API_BASE_URL
  const proxyTarget =
    processProxyTarget ||
    env.VITE_DEV_PROXY_TARGET ||
    env.VITE_API_BASE_URL ||
    'http://127.0.0.1:3303'
  const wsTarget = proxyTarget.replace(/^http/iu, 'ws')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@generated': path.resolve(__dirname, './generated'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-router-dom') || id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor'
            }

            if (id.includes('node_modules/lucide-react') || id.includes('node_modules/framer-motion')) {
              return 'ui'
            }

            if (id.includes('node_modules/recharts')) {
              return 'charts'
            }

            if (
              id.includes('/src/i18n/') ||
              id.includes('\\src\\i18n\\')
            ) {
              return 'i18n'
            }

            return undefined
          },
        },
      },
    },
    test: {
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['e2e/**', 'playwright.config.ts', 'dist/**', 'output/**'],
    },
  }
})
