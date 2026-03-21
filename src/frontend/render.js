import { statements } from '../db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getAssetPath(filename) {
  const paths = [
    join(__dirname, filename),                       // 标准开发模式所在相对目录
    join(process.cwd(), filename),                   // Docker 产物目录 (dist root)
    join(process.cwd(), 'src', 'frontend', filename) // 根目录启动开发模式兜底
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return join(__dirname, filename); // Fallback to throw normal error
}

// Pre-read frontend assets into memory
let TEMPLATE_HTML = '';
let CSS_CONTENT = '';
let JS_CONTENT = '';

try {
  TEMPLATE_HTML = readFileSync(getAssetPath('template.html'), 'utf-8');
  CSS_CONTENT = readFileSync(getAssetPath('styles.css'), 'utf-8');
  JS_CONTENT = readFileSync(getAssetPath('app.js'), 'utf-8');
} catch (error) {
  console.error('Failed to load frontend assets:', error);
}

/**
 * 服务器端渲染入口
 * @param {string} region - 区域
 */
export async function renderHomepage(region = 'global') {
  try {
    const stats = statements.getStats.get(region, region, region, region) || {};
    const nodes = statements.getAvailableNodesForSub.all(region, region, region, 100, 0) || [];
    
    // 注入初始状态数据
    const INITIAL_STATE = {
      region,
      stats,
      nodes,
      currentSort: { field: 'status', order: 'DESC' }
    };
    
    // 我们将数据直接序列化注入为 window 变量，供 app.js 安全消费
    const serverDataScript = `<script>window.SERVER_DATA = ${JSON.stringify(INITIAL_STATE)};</script>`;
    
    // 进行极致性能的服务端组装
    return TEMPLATE_HTML
      .replace('<!-- INJECT_CSS -->', `<style>${CSS_CONTENT}</style>`)
      .replace('<!-- INJECT_SERVER_DATA -->', serverDataScript)
      .replace('<!-- INJECT_JS -->', `<script>${JS_CONTENT}</script>`);
      
  } catch (error) {
    console.error('Error rendering homepage:', error);
    return '<h1>Internal Server Error - Check console.</h1>';
  }
}