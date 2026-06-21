import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'motion/react': 'framer-motion'
    }
  },
  server: {
    historyApiFallback: true, // serve index.html for all unknown routes (SPA routing)
    proxy: {
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  envPrefix: ['APP_', 'API_', 'SOCKET_', 'AUTH_', 'OTP_', 'ADMIN_', 'JWT_', 'ENABLE_', 'ANALYTICS_', 'DATABASE_', 'SUPABASE_', 'VITE_'],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('framer-motion') || id.includes('react-router')) {
              return 'vendor'
            }
            return 'dependencies'
          }
        }
      }
    }
  }
})
