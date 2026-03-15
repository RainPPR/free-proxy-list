import express from 'express';
import path from 'node:path';
import { statements, searchNodes } from './db.js';
import { config, logger } from './config.js';
import { verifyAuth, resetAdminCreds } from './auth.js';

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

// ============= 共享工具函数 =============

function nodeName(n) {
  const namePart = n.long_name && n.long_name !== 'Unknown' ? n.long_name : n.short_name;
  return `${namePart.replace(/\s+/g, '_')}_${n.hash}`;
}

// ============= 路由处理 =============

app.get('/api/stats', (req, res) => {
  const region = req.path.includes('/cn/') ? 'cn' : 'global';
  try {
    const stats = statements.getStats.get(region, region, region, region);
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.get('/api/cn/stats', (req, res) => {
  try {
    const stats = statements.getStats.get('cn', 'cn', 'cn', 'cn');
    res.json({ success: true, data: stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 带区域参数的路由
app.get('/api/:area/nodes/:type', (req, res) => {
  const region = req.params.area === 'cn' ? 'cn' : 'global';
  const type = req.params.type;
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 100), 1000);
    const offset = (Math.max(1, parseInt(req.query.page) || 1) - 1) * limit;
    const nodes = (type === 'highperf') ? statements.getHighPerformanceNodes.all(region, limit, offset) : statements.getAvailableNodesForSub.all(region, limit, offset);
    res.json({ success: true, data: nodes });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 不带区域参数的路由（默认 global）
app.get('/api/nodes/:type', (req, res) => {
  const region = 'global';
  const type = req.params.type;
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 100), 1000);
    const offset = (Math.max(1, parseInt(req.query.page) || 1) - 1) * limit;
    const nodes = (type === 'highperf') ? statements.getHighPerformanceNodes.all(region, limit, offset) : statements.getAvailableNodesForSub.all(region, limit, offset);
    res.json({ success: true, data: nodes });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/:area/subconverter', (req, res) => {
  const region = req.params.area === 'cn' ? 'cn' : 'global';
  try {
    const { target = 'base64', list = 'available', country, type, speed, delay, sort, order, udp } = req.query;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 500), 1000);
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const nodes = searchNodes({ country, type, speed, delay, sort, order, limit, page, region, listType: list });
    if (!nodes || nodes.length === 0) return target === 'raw' ? res.json({ success: true, data: [] }) : res.status(404).send('No nodes found');

    if (target === 'raw') return res.json({ success: true, data: nodes });

    // 格式化输出逻辑
    if (target === 'clash' || target === 'clash-provider') {
      let yaml = 'proxies:\n';
      nodes.forEach(n => {
        let proto = n.protocol === 'socks4' || n.protocol === 'socks5' ? 'socks5' : n.protocol;
        yaml += `  - name: "${nodeName(n)}"\n    type: ${proto}\n    server: ${n.ip}\n    port: ${n.port}${n.protocol === 'https' ? '\n    tls: true' : ''}\n`;
      });
      if (target === 'clash-provider') { res.setHeader('Content-Type', 'text/yaml'); return res.send(yaml); }
      yaml += '\nproxy-groups:\n  - name: "Auto"\n    type: url-test\n    proxies:\n';
      nodes.forEach(n => yaml += `      - "${nodeName(n)}"\n`);
      yaml += '    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n';
      res.setHeader('Content-Type', 'text/yaml');
      return res.send(yaml);
    }

    if (target === 'v2ray') {
      const v2 = nodes.map(n => ({ remark: nodeName(n), protocol: n.protocol.startsWith('socks')?'socks':'http', server: n.ip, port: n.port, tls: n.protocol === 'https' }));
      res.setHeader('Content-Type', 'text/plain');
      return res.send(Buffer.from(JSON.stringify({ version: 1, server: v2 })).toString('base64'));
    }

    const rawLinks = nodes.map(n => `${n.protocol}://${n.ip}:${n.port}#${encodeURIComponent(nodeName(n))}`).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.send(Buffer.from(rawLinks).toString('base64'));

  } catch (err) {
    logger.error(`[API] Subconverter Error: ${err.message}`);
    res.status(500).send('API Error');
  }
});

// 不带区域参数的路由（默认 global）
app.get('/api/subconverter', (req, res) => {
  const region = 'global';
  try {
    const { target = 'base64', list = 'available', country, type, speed, delay, sort, order, udp } = req.query;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 500), 1000);
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const nodes = searchNodes({ country, type, speed, delay, sort, order, limit, page, region, listType: list });
    if (!nodes || nodes.length === 0) return target === 'raw' ? res.json({ success: true, data: [] }) : res.status(404).send('No nodes found');

    if (target === 'raw') return res.json({ success: true, data: nodes });

    // 格式化输出逻辑
    if (target === 'clash' || target === 'clash-provider') {
      let yaml = 'proxies:\n';
      nodes.forEach(n => {
        let proto = n.protocol === 'socks4' || n.protocol === 'socks5' ? 'socks5' : n.protocol;
        yaml += `  - name: "${nodeName(n)}"\n    type: ${proto}\n    server: ${n.ip}\n    port: ${n.port}${n.protocol === 'https' ? '\n    tls: true' : ''}\n`;
      });
      if (target === 'clash-provider') { res.setHeader('Content-Type', 'text/yaml'); return res.send(yaml); }
      yaml += '\nproxy-groups:\n  - name: "Auto"\n    type: url-test\n    proxies:\n';
      nodes.forEach(n => yaml += `      - "${nodeName(n)}"\n`);
      yaml += '    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n';
      res.setHeader('Content-Type', 'text/yaml');
      return res.send(yaml);
    }

    if (target === 'v2ray') {
      const v2 = nodes.map(n => ({ remark: nodeName(n), protocol: n.protocol.startsWith('socks')?'socks':'http', server: n.ip, port: n.port, tls: n.protocol === 'https' }));
      res.setHeader('Content-Type', 'text/plain');
      return res.send(Buffer.from(JSON.stringify({ version: 1, server: v2 })).toString('base64'));
    }

    const rawLinks = nodes.map(n => `${n.protocol}://${n.ip}:${n.port}#${encodeURIComponent(nodeName(n))}`).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.send(Buffer.from(rawLinks).toString('base64'));

  } catch (err) {
    logger.error(`[API] Subconverter Error: ${err.message}`);
    res.status(500).send('API Error');
  }
});

// 管理员逻辑
app.post('/api/admin/:action', (req, res) => {
  if (!verifyAuth(req.body.uuid, req.body.token)) return res.status(401).json({ success: false });
  try {
    if (req.params.action === 'clear') { statements.clearAllData.run(); statements.clearDeletedLogs.run(); }
    else if (req.params.action === 'reset-creds') { resetAdminCreds(); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

export function startServer() {
  const { port } = config.app;
  return app.listen(port, '0.0.0.0', () => logger.info(`[Web] API running at: http://0.0.0.0:${port}`));
}