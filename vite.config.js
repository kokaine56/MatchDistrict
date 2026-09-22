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
    },
    headers: {
      // Enforces TLS (HTTPS) connections strictly for 2 years
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      // Prevents the browser from guessing the content type (Firewall support)
      'X-Content-Type-Options': 'nosniff',
      // Prevents Clickjacking
      'X-Frame-Options': 'DENY',
      // Legacy XSS protection for older browsers
      'X-XSS-Protection': '1; mode=block',
      // Controls referrer information sent with requests
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
  },
  envPrefix: ['APP_', 'ENABLE_', 'SUPABASE_', 'VITE_'],
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
