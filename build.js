/**
 * 构建脚本
 * 使用 Bun 的内置打包工具生成可执行文件
 * 
 * 支持:
 * - bytecode: 字节码编译（加速启动）
 * - compile: 生成独立可执行文件
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, 'src');
const outputDir = resolve(__dirname, 'dist');

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 复制静态文件
 */
function copyStaticFiles() {
  ensureDir(outputDir);
  
  // 复制 frontend 核心资产
  const frontendAssets = ['template.html', 'styles.css', 'app.js'];
  for (const file of frontendAssets) {
    const src = resolve(__dirname, 'src/frontend', file);
    const dest = resolve(outputDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied: ${file}`);
    }
  }
  
  // 复制 public 目录
  const publicSrc = resolve(__dirname, 'public');
  const publicDest = resolve(outputDir, 'public');
  if (fs.existsSync(publicSrc)) {
    ensureDir(publicDest);
    const files = fs.readdirSync(publicSrc);
    for (const file of files) {
      const src = resolve(publicSrc, file);
      const dest = resolve(publicDest, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
        console.log(`Copied: public/${file}`);
      }
    }
  }
}

/**
 * 复制配置文件
 */
function copyConfig() {
  const configSrc = resolve(__dirname, 'config.toml');
  const configDest = resolve(outputDir, 'config.toml');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest);
    console.log('Copied: config.toml');
  }
}

/**
 * 构建可执行文件（字节码 + 编译为独立可执行文件）
 * 使用 CLI 命令方式确保正确生成 .exe 文件
 */
async function buildExecutable() {
  console.log('Building executable with bytecode + compile...');
  
  ensureDir(outputDir);
  
  const entryPoint = resolve(srcDir, 'index.js');
  const outFile = resolve(outputDir, 'index');
  
  // 构建命令参数
  const args = [
    'build',
    entryPoint,
    '--compile',
    '--outfile', outFile,
  ];
  
  // 添加字节码选项
  args.push('--bytecode');
  
  // 根据环境添加其他选项
  if (process.env.NODE_ENV === 'production') {
    args.push('--minify');
  }
  if (process.env.NODE_ENV !== 'production') {
    args.push('--sourcemap');
  }
  
  try {
    const proc = Bun.spawn(['bun', ...args], {
      cwd: __dirname,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    
    const exitCode = await proc.exited;
    
    if (exitCode === 0) {
      console.log('✅ Executable build successful');
    } else {
      console.error(`❌ Build failed with exit code: ${exitCode}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Build error:', error);
    process.exit(1);
  }
}

/**
 * 构建 CommonJS 字节码版本（不编译为可执行文件）
 */
async function buildBytecode() {
  console.log('Building with CommonJS bytecode...');
  
  ensureDir(outputDir);
  
  const buildConfig = {
    entrypoints: [resolve(srcDir, 'index.js')],
    outdir: outputDir,
    target: 'bun',
    // 使用 CJS 格式可以不需要 compile 就能生成字节码
    format: 'cjs',
    bytecode: true,
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production',
  };
  
  try {
    const result = await Bun.build(buildConfig);
    
    if (result.success) {
      console.log('✅ Bytecode build successful');
    } else {
      console.error('❌ Build failed:');
      result.logs.forEach(log => console.error(log));
      process.exit(1);
    }
  } catch (error) {
    console.error('Build error:', error);
    process.exit(1);
  }
}

/**
 * 主入口
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'build';
  
  console.log(`Running command: ${command}`);
  
  switch (command) {
    case 'build':
      // 默认构建 CJS 字节码版本
      await buildBytecode();
      copyStaticFiles();
      copyConfig();
      console.log('✅ Build complete!');
      break;
      
    case 'exe':
    case 'executable':
      // 构建独立可执行文件（ESM + 字节码 + 编译）
      await buildExecutable();
      copyStaticFiles();
      copyConfig();
      console.log('✅ Executable build complete!');
      break;
      
    case 'dev':
      console.log('Dev mode: use "bun run src/index.js" instead');
      break;
      
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Available commands: build, exe, dev');
  }
}

main();
