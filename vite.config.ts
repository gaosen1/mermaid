import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import type { Plugin } from 'vite'

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

// 随 dev / preview 一起启动本地 Agent REST API（scripts/agent-api.mjs），
// 供 mermaid-mcp-app 的「→ Mermaid Local」按钮写回笔记，无需再手动 node 启动。
// 端口已被占用（用户另行启动过）时直接复用，不重复拉起。
//
// 同步目录必须与 Web 应用里「本地 Agent 同步」选的目录一致（浏览器里的授权句柄，
// 服务端无从得知），否则 inbox 写进了页面不会去读的目录。在 .env.local（已被
// gitignore）里设置一次：MERMAID_SYNC_DIR=/绝对路径；不设则用 agent-api 默认目录。
function agentApiPlugin(): Plugin {
  let agentEnv: Record<string, string> = {}
  const port = () => Number(agentEnv.MERMAID_API_PORT) || 4789

  const start = async (httpServer: { once: (e: string, cb: () => void) => void } | null) => {
    // vitest 也会起 vite server，测试不应拉起常驻的 REST 服务
    if (process.env.VITEST) return
    if (await isPortInUse(port())) {
      console.log(`[agent-api] 端口 ${port()} 已有服务在运行，复用（其同步目录以它启动时为准）`)
      return
    }
    const child = spawn(process.execPath, [path.resolve(__dirname, 'scripts/agent-api.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, ...agentEnv },
    })
    const stop = () => child.kill()
    httpServer?.once('close', stop)
    process.once('exit', stop)
    // SIGINT/SIGTERM 终止进程时不会触发 'exit'，需单独处理；
    // 挂了监听就会取消默认退出行为，若没有其他监听者（如 preview）则自行退出。
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.once(sig, () => {
        stop()
        if (process.listenerCount(sig) === 0) process.exit()
      })
    }
  }
  return {
    name: 'mermaid-local-agent-api',
    configResolved(config) {
      agentEnv = loadEnv(config.mode, config.root, 'MERMAID_')
    },
    configureServer(server) {
      void start(server.httpServer)
    },
    configurePreviewServer(server) {
      void start(server.httpServer)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), agentApiPlugin()],
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
