import { statements } from '../db.js';

// 资源编译期引入 (Bun 宏: 构建 exe 时直接打入文件，无需 fs)
import TEMPLATE_HTML from './template.html' with { type: 'text' };
import CSS_CONTENT from './styles.css' with { type: 'text' };
import JS_CONTENT from './app.js' with { type: 'text' };

/**
 * 服务器端渲染入口
 * @param {string} region - 区域
 */
export async function renderHomepage(region = 'global') {
  try {
    const stats = statements.getStats.get(region, region, region, region) || {};
    const nodes = statements.getAvailableNodesForSub.all(region, 100, 0) || [];
    
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