import express from 'express';
import path from 'node:path';
import { statements, searchNodes } from './db.js';
import { config, logger } from './config.js';
import { verifyAuth, resetAdminCreds } from './auth.js';

const app = express();

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

// ==========================================
// 辅助逻辑抽离 (Shared Logic)
// ==========================================

function handleGetStats(req, res, region = 'global') {
  try {
    // 注入 4 个 region 参数，对应 SQL 中的 4 个 (WHERE region = ?)
    const stats = statements.getStats.get(region, region, region, region);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function handleGetNodes(req, res, region = 'global', type = 'available') {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const offset = (Math.max(1, page) - 1) * safeLimit;

    let nodes;
    if (type === 'highperf') {
      nodes = statements.getHighPerformanceNodes.all(region, safeLimit, offset);
    } else {
      nodes = statements.getAvailableNodesForSub.all(region, safeLimit, offset);
    }
    res.json({ success: true, data: nodes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function formatNodesResponse(nodes, clientType, res, udp) {
  function nodeName(n) {
    const namePart = n.long_name && n.long_name !== 'Unknown' ? n.long_name : n.short_name;
    return `${namePart.replace(/\s+/g, '_')}_${n.hash}`;
  }

  if (clientType === 'raw') {
    return res.json({ success: true, data: nodes });
  }

  if (clientType === 'base64') {
    const rawLinks = nodes.map(n => {
      const remark = encodeURIComponent(nodeName(n));
      return `${n.protocol}://${n.ip}:${n.port}#${remark}`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    return res.send(Buffer.from(rawLinks).toString('base64'));
  }
  
  if (clientType === 'clash' || clientType === 'clash-provider') {
    let yaml = 'proxies:\n';
    for (const n of nodes) {
      const name = nodeName(n);
      let type = n.protocol;
      if (type === 'socks4' || type === 'socks5') type = 'socks5';
      yaml += `  - name: "${name}"\n    type: ${type}\n    server: ${n.ip}\n    port: ${n.port}\n`;
      if (n.protocol === 'https') yaml += `    tls: true\n`;
    }
    
    if (clientType === 'clash-provider') {
      res.setHeader('Content-Type', 'text/yaml');
      return res.send(yaml);
    }

    yaml += '\nproxy-groups:\n  - name: "自动选择"\n    type: url-test\n    proxies:\n';
    nodes.forEach(n => yaml += `      - "${nodeName(n)}"\n`);
    yaml += '    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n';
    yaml += '  - name: "故障转移"\n    type: fallback\n    proxies:\n';
    nodes.forEach(n => yaml += `      - "${nodeName(n)}"\n`);
    yaml += '    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n';
    res.setHeader('Content-Type', 'text/yaml');
    return res.send(yaml);
  }

  if (clientType === 'v2ray' || clientType === 'v2ray-json') {
    const v2rayServers = nodes.map(n => {
      const name = nodeName(n);
      const type = n.protocol;
      if (type === 'socks4' || type === 'socks5') {
        return { remark: name, protocol: 'socks', server: n.ip, port: n.port, udp: !!udp };
      }
      return { remark: name, protocol: 'http', server: n.ip, port: n.port, tls: type === 'https' };
    });
    res.setHeader('Content-Type', 'text/plain');
    return res.send(Buffer.from(JSON.stringify({ version: 1, server: v2rayServers }, null, 2)).toString('base64'));
  }

  const rawLinks = nodes.map(n => `${n.protocol}://${n.ip}:${n.port}#${encodeURIComponent(nodeName(n))}`).join('\n');
  res.setHeader('Content-Type', 'text/plain');
  res.send(Buffer.from(rawLinks).toString('base64'));
}

function handleSubConverter(req, res, region = 'global') {
  try {
    const { target: clientType = 'base64', list: listType = 'available', country, type, speed, delay, sort, order, udp } = req.query;
    const limit = parseInt(req.query.limit) || 500;
    const page = parseInt(req.query.page) || 1;

    let nodes;
    if (country || type || speed || delay || sort || req.query.limit || req.query.page) {
      nodes = searchNodes({ country, type, speed, delay, sort, order, limit, page, region, listType });
    } else {
      const safeLimit = Math.min(Math.max(1, limit), 1000);
      const offset = (Math.max(1, page) - 1) * safeLimit;
      nodes = (listType === 'highperf') ? statements.getHighPerformanceNodes.all(region, safeLimit, offset) : statements.getAvailableNodesForSub.all(region, safeLimit, offset);
    }

    if (!nodes || nodes.length === 0) {
      return clientType === 'raw' ? res.json({ success: true, data: [] }) : res.status(404).send('No nodes matching your criteria.');
    }

    return formatNodesResponse(nodes, clientType, res, udp);
  } catch (err) {
    logger.error(`[API] Sub Error: ${err.message}`);
    res.status(500).send('Internal Error');
  }
}

// ==========================================
// 路由注册 (Routes)
// ==========================================

// 统计 API
app.get('/api/stats', (req, res) => handleGetStats(req, res, 'global'));
app.get('/api/cn/stats', (req, res) => handleGetStats(req, res, 'cn'));

// 节点列表 API
app.get('/api/nodes/available', (req, res) => handleGetNodes(req, res, 'global', 'available'));
app.get('/api/nodes/highperf', (req, res) => handleGetNodes(req, res, 'global', 'highperf'));
app.get('/api/cn/nodes/available', (req, res) => handleGetNodes(req, res, 'cn', 'available'));
app.get('/api/cn/nodes/highperf', (req, res) => handleGetNodes(req, res, 'cn', 'highperf'));

// 订阅转换 API
app.get('/api/subconverter', (req, res) => handleSubConverter(req, res, 'global'));
app.get('/api/cn/subconverter', (req, res) => handleSubConverter(req, res, 'cn'));

// 管理员 API
app.post('/api/admin/clear', (req, res) => {
  const { uuid, token } = req.body;
  if (!verifyAuth(uuid, token)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  try {
    statements.clearAllData.run();
    statements.clearDeletedLogs.run();
    res.json({ success: true, message: 'Data cleared' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/reset-creds', (req, res) => {
  const { uuid, token } = req.body;
  if (!verifyAuth(uuid, token)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  try { resetAdminCreds(); res.json({ success: true, message: 'Credentials reset' }); } 
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export function startServer() {
  const { port } = config.app;
  return app.listen(port, '0.0.0.0', () => logger.info(`[Web] API service running at: http://0.0.0.0:${port}`));
}