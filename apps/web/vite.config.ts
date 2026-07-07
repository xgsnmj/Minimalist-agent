import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";


export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        // SSE / streaming 响应需要关闭代理缓冲
        configure: (proxy) => {
          proxy.on("proxyReq", (_proxyReq, req, res) => {
            // 对 SSE 端点禁用缓冲，保持连接活跃
            if (req.url?.includes("/copilotkit/")) {
              res.setHeader("X-Accel-Buffering", "no");
            }
          });
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    setupFiles: "./src/test-setup.ts",
    server: {
      deps: {
        inline: [/^@copilotkit\//],
      },
    },
    testTimeout: 10000,
  },
});
