import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine } from './vite.base.config';
import commonjs from "@rollup/plugin-commonjs";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'build'>;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const config: UserConfig = {
    build: {
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => '[name].js',
        formats: ['cjs'],
      },
    },
    plugins: [
      commonjs({
        ignoreDynamicRequires: true
      })
    ],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ['module', 'jsnext:main', 'jsnext'],
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
