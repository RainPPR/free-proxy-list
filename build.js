import esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';
import fs from 'node:fs';
import path from 'node:path';

// 递归遍历目录，寻找所有的 JS 插件入口
function getAllPluginEntries(dir, allFiles = {}) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const entryPath = path.join(dir, file);
    if (fs.statSync(entryPath).isDirectory()) {
      getAllPluginEntries(entryPath, allFiles);
    } else if (file.endsWith(".js")) {
      // 保持相对路径结构作为 entryPoint 名称，例如 plugins/spys/index
      const key = entryPath.replace(/\\/g, '/').replace('.js', '');
      allFiles[key] = entryPath;
    }
  }
  return allFiles;
}

const pluginEntries = getAllPluginEntries('plugins');
const entryPoints = {
  'bundle': 'src/index.js',
  ...pluginEntries
};

console.log(`[Build] 🔍 发现插件入口: ${Object.keys(pluginEntries).length} 个`);

esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'node24',
  minify: true,
  outdir: 'dist',
  outExtension: { '.js': '.cjs' }, // 插件输出为 .cjs
  format: 'cjs',
  external: ['better-sqlite3'],
  plugins: [
    copy({
      assets: {
        from: ['./node_modules/better-sqlite3/build/Release/better_sqlite3.node'],
        to: ['./better_sqlite3.node'],
      },
    }),
  ],
}).then(() => {
  console.log('[Build] ✨ 全量打包完成！产物位于 dist/ 目录。');
}).catch(() => process.exit(1));
