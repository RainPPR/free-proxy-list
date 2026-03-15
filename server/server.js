import { serve } from "bun";
import { statements, searchNodes } from '../core/db.js';
import { config, logger } from '../core/config.js';
import { verifyAuth, resetAdminCreds } from '../core/auth.js';
import { renderHomepage } from './render.js';

// 辅助函数
function nodeName(n) {
  const namePart = n.long_name && n.long_name !== 'Unknown' ? n.long_name : n.short_name;
  return `${namePart.replace(/\s+/g, '_')}_${n.hash}`;
}

// 静态文件服务辅助函数（用于非HTML文件）
async function serveStaticFile(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // 尝试从public目录提供静态文件
  const publicPath = `./public${pathname}`;
  const file = Bun.file(publicPath);
  if (await file.exists()) {
    return new Response(file);
  }
  
  return new Response('Not Found', { status: 404 });
}

// API路由处理器
async function handleApiStats(request, region) {
  try {
    const stats = statements.getStats.get(region, region, region, region);
    return Response.json({ success: true, data: stats });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function handleApiNodes(request, region, type) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit')) || 100), 1000);
    const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    const offset = (page - 1) * limit;
    
    const nodes = type === 'highperf' 
      ? statements.getHighPerformanceNodes.all(region, limit, offset)
      : statements.getAvailableNodesForSub.all(region, limit, offset);
    
    return Response.json({ success: true, data: nodes });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function handleSubconverter(request, region) {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get('target') || 'base64';
    const list = url.searchParams.get('list') || 'available';
    const country = url.searchParams.get('country');
    const type = url.searchParams.get('type');
    const speed = url.searchParams.get('speed');
    const delay = url.searchParams.get('delay');
    const sort = url.searchParams.get('sort');
    const order = url.searchParams.get('order');
    const udp = url.searchParams.get('udp');
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit')) || 500), 1000);
    const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    
    const nodes = searchNodes({ 
      country, type, speed, delay, sort, order, 
      limit, page, region, listType: list 
    });
    
    if (!nodes || nodes.length === 0) {
      return target === 'raw' 
        ? Response.json({ success: true, data: [] })
        : new Response('No nodes found', { status: 404 });
    }
    
    if (target === 'raw') {
      return Response.json({ success: true, data: nodes });
    }
    
    // 格式化输出逻辑
    if (target === 'clash' || target === 'clash-provider') {
      let yaml = 'proxies:\n';
      nodes.forEach(n => {
        let proto = n.protocol === 'socks4' || n.protocol === 'socks5' ? 'socks5' : n.protocol;
        yaml += `  - name: "${nodeName(n)}"\n    type: ${proto}\n    server: ${n.ip}\n    port: ${n.port}${n.protocol === 'https' ? '\n    tls: true' : ''}\n`;
      });
      if (target === 'clash-provider') {
        return new Response(yaml, { headers: { 'Content-Type': 'text/yaml' } });
      }
      yaml += '\nproxy-groups:\n  - name: "Auto"\n    type: url-test\n    proxies:\n';
      nodes.forEach(n => yaml += `      - "${nodeName(n)}"\n`);
      yaml += '    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n';
      return new Response(yaml, { headers: { 'Content-Type': 'text/yaml' } });
    }
    
    if (target === 'v2ray') {
      const v2 = nodes.map(n => ({
        remark: nodeName(n),
        protocol: n.protocol.startsWith('socks') ? 'socks' : 'http',
        server: n.ip,
        port: n.port,
        tls: n.protocol === 'https'
      }));
      const base64 = Buffer.from(JSON.stringify({ version: 1, server: v2 })).toString('base64');
      return new Response(base64, { headers: { 'Content-Type': 'text/plain' } });
    }
    
    const rawLinks = nodes.map(n => `${n.protocol}://${n.ip}:${n.port}#${encodeURIComponent(nodeName(n))}`).join('\n');
    const base64 = Buffer.from(rawLinks).toString('base64');
    return new Response(base64, { headers: { 'Content-Type': 'text/plain' } });
    
  } catch (err) {
    logger.error(`[API] Subconverter Error: ${err.message}`);
    return new Response('API Error', { status: 500 });
  }
}

async function handleAdmin(request, action) {
  try {
    const body = await request.json();
    if (!verifyAuth(body.uuid, body.token)) {
      return Response.json({ success: false }, { status: 401 });
    }
    
    if (action === 'clear') {
      statements.clearAllData.run();
      statements.clearDeletedLogs.run();
    } else if (action === 'reset-creds') {
      resetAdminCreds();
    }
    
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false }, { status: 500 });
  }
}

// 创建Bun服务器，使用routes配置
const server = serve({
  port: config.app.port,
  hostname: '0.0.0.0',
  
  routes: {
    // 主页使用服务器端渲染
    "/": {
      async GET(req) {
        const url = new URL(req.url);
        const region = url.searchParams.get('region') === 'cn' ? 'cn' : 'global';
        const html = await renderHomepage(region);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    },
    
    // API路由
    "/api/stats": {
      async GET(req) {
        return handleApiStats(req, 'global');
      }
    },
    
    "/api/cn/stats": {
      async GET(req) {
        return handleApiStats(req, 'cn');
      }
    },
    
    "/api/nodes/:type": {
      async GET(req) {
        const type = req.params.type;
        return handleApiNodes(req, 'global', type);
      }
    },
    
    "/api/:area/nodes/:type": {
      async GET(req) {
        const area = req.params.area;
        const type = req.params.type;
        const region = area === 'cn' ? 'cn' : 'global';
        return handleApiNodes(req, region, type);
      }
    },
    
    "/api/subconverter": {
      async GET(req) {
        return handleSubconverter(req, 'global');
      }
    },
    
    "/api/:area/subconverter": {
      async GET(req) {
        const area = req.params.area;
        const region = area === 'cn' ? 'cn' : 'global';
        return handleSubconverter(req, region);
      }
    },
    
    "/api/admin/:action": {
      async POST(req) {
        const action = req.params.action;
        return handleAdmin(req, action);
      }
    },
    
    // 静态文件路由（通配符）
    "/*": async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      // 如果请求的是index.html，重定向到根路径
      if (pathname === '/index.html') {
        return Response.redirect('/', 301);
      }
      
      // 静态文件服务
      return serveStaticFile(req);
    }
  },
  
  // 错误处理
  error(error) {
    logger.error(`[Server] Error: ${error.message}`);
    return new Response('Internal Server Error', { status: 500 });
  },
  
  // 开发模式（可选）
  development: config.app.env === 'development'
});

// 启动日志
logger.info(`[Web] API running at: ${server.url}`);

// 优雅关闭处理
process.on('SIGINT', () => {
  logger.info('[System] Shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('[System] Shutting down...');
  server.stop();
  process.exit(0);
});

export const startServer = () => server;
export default server;
