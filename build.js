/**
 * 前端构建脚本
 * 使用 Bun 的内置打包工具
 */

import { build } from 'bun';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(__dirname, 'src/frontend');
const outputDir = resolve(__dirname, 'dist');

/**
 * 前端构建配置
 */
const frontendBuildConfig = {
  entrypoints: [resolve(frontendDir, 'index.jsx')],
  outdir: outputDir,
  minify: process.env.NODE_ENV === 'production',
  splitting: false,
  sourcemap: process.env.NODE_ENV !== 'production',
  target: 'browser',
  format: 'esm',
};

/**
 * 复制静态文件
 */
async function copyStaticFiles() {
  const fs = await import('fs');
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 复制 public 目录下的文件
  const publicDir = resolve(frontendDir, 'public');
  if (fs.existsSync(publicDir)) {
    const files = fs.readdirSync(publicDir);
    for (const file of files) {
      const src = resolve(publicDir, file);
      const dest = resolve(outputDir, file);
      fs.copyFileSync(src, dest);
      console.log(`Copied: ${file}`);
    }
  }
  
  // 复制 index.html
  const htmlSrc = resolve(frontendDir, 'index.html');
  const htmlDest = resolve(outputDir, 'index.html');
  if (fs.existsSync(htmlSrc)) {
    fs.copyFileSync(htmlSrc, htmlDest);
    console.log('Copied: index.html');
  }
}

/**
 * 构建前端
 */
async function buildFrontend() {
  console.log('Building frontend...');
  
  try {
    // 使用 Bun 构建
    const result = await build(frontendBuildConfig);
    
    if (result.success) {
      console.log('✅ Frontend build successful');
    } else {
      console.error('❌ Frontend build failed:');
      result.logs.forEach(log => console.error(log));
      process.exit(1);
    }
  } catch (error) {
    console.error('Build error:', error);
    process.exit(1);
  }
  
  // 复制静态文件
  await copyStaticFiles();
  
  console.log('✅ Build complete!');
}

/**
 * 开发模式 - 监视文件变化
 */
async function devMode() {
  console.log('Starting dev mode...');
  
  // 初始构建
  await buildFrontend();
  
  // 监视文件变化
  const watcher = Bun.watch(frontendDir, (event, file) => {
    console.log(`File changed: ${file}`);
    buildFrontend();
  });
  
  console.log('Watching for changes...');
}

// 主入口
const args = process.argv.slice(2);
const command = args[0] || 'build';

switch (command) {
  case 'dev':
    devMode();
    break;
  case 'build':
  default:
    buildFrontend();
    break;
}
