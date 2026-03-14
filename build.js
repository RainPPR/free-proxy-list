import esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

console.log(`[Build] 🚀 正在进行内存混合模式打包...`);

esbuild.build({
  entryPoints: {
    'bundle': 'src/index.js'
  },
  bundle: true,
  platform: 'node',
  target: 'node24',
  minify: true,
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
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
  console.log('[Build] ✨ 打包完成！由于插件已改为 ESM 导入模式，所有逻辑已整合入 bundle.cjs。');
}).catch(() => process.exit(1));
