/**
 * 构建脚本
 * 使用 Bun 编译生成独立可执行文件 (bytecode + compile)
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, 'src');
const outputDir = resolve(__dirname, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyResources() {
  ensureDir(outputDir);
  
  // 复制 public 目录 (如果你有其他的纯静态资源的话)
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

  // 复制配置文件
  const configSrc = resolve(__dirname, 'config.toml');
  const configDest = resolve(outputDir, 'config.toml');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest);
    console.log('Copied: config.toml');
  }
}

async function build() {
  console.log('Building standalone executable (bytecode + compile)...');
  ensureDir(outputDir);
  
  const entryPoint = resolve(srcDir, 'index.js');
  const outFile = resolve(outputDir, 'index');
  
  const args = [
    'build',
    entryPoint,
    '--compile',
    '--outfile', outFile,
    '--bytecode'
  ];
  
  if (process.env.NODE_ENV === 'production') {
    args.push('--minify');
  } else {
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
      copyResources();
      console.log('✅ All resources copied successfully');
    } else {
      console.error(`❌ Build failed with exit code: ${exitCode}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Build error:', error);
    process.exit(1);
  }
}

build();
