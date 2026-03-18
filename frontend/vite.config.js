import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Raise the warning threshold since stream-chat-react is inherently large
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // ── Vendor splits ──
          // React core — changes rarely, cached long-term
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Stream Chat SDK + UI (heaviest dependency)
          'vendor-stream-chat': ['stream-chat', 'stream-chat-react'],

          // Stream Video SDK (only needed on call pages)
          'vendor-stream-video': ['@stream-io/video-react-sdk'],

          // Utility libs
          'vendor-misc': ['axios', '@tanstack/react-query', 'zustand', 'react-hot-toast'],
        },
      },
    },
  },
})
