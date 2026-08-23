import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // 千问云 Token 套餐端点不支持浏览器跨域（CORS），
      // 由 dev server 同源转发，前端无需额外脚本
      '/token-plan-api': {
        target: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/token-plan-api/, ''),
      },
    },
  },
})
