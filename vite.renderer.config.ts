import path from 'path';
import react from '@vitejs/plugin-react';
import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig } from 'vite';
import { pluginExposeRenderer } from './vite.base.config';
import {nodePolyfills} from "vite-plugin-node-polyfills";

export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>;
  const { root, mode, forgeConfigSelf } = forgeEnv;
  const name = forgeConfigSelf.name ?? '';

  const config: UserConfig = {
    root: root,
    mode,
    base: './',
    build: {
      outDir: `.vite/renderer/${name}`,
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
    plugins: [
      nodePolyfills({include: ['timers']}),
      pluginExposeRenderer(name),
      react()
    ],
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, './src/renderer/'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@tanstack/react-router'],
      force: true,
    },
    clearScreen: false,
  };

  return config;
});
