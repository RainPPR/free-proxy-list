import express from 'express';
import path from 'node:path';
import { statements, searchNodes } from './db.js';
import { config, logger } from './config.js';
import { verifyAuth, resetAdminCreds } from './auth.js';

const app = express();

// 解析 JSON 请求体
app.use(express.json());

// 提供 public 的静态前端面板
app.use(express.static(path.resolve(process.cwd(), 'public')));

// 核心统计 API
app.get('/api/stats', (req, res) => {
  try {
    const stats = statements.getStats.get();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取节点列表（支持排序和过滤）
app.get('/api/nodes/available', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const safeLimit = Math.min(limit, 1000);

    const nodes = statements.getAvailableNodesForSub.all(safeLimit, offset);
    res.json({ success: true, data: nodes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取高性能列表
app.get('/api/nodes/highperf', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const offset = parseInt(req.query.offset) || 0;
    const safeLimit = Math.min(limit, 1000);

    const nodes = statements.getHighPerformanceNodes.all(safeLimit, offset);
    res.json({ success: true, data: nodes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 订阅接口：支持多个列表和多个格式
// 支持的 target: base64, clash, v2ray, clash-provider
// 支持的 list: all, available, highperf
app.get('/api/subconverter', async (req, res) => {
  try {
    const { target: clientType = 'clash', list: listType, udp, country, type, speed, delay, sort, order } = req.query;
    const isUdp = udp === 'true';

    let nodes = [];
    
    // 如果有具体的过滤参数，使用 searchNodes
    if (country || type || speed || delay || sort) {
      nodes = searchNodes({ country, type, speed, delay, sort, order });
    } else {
      // 否则回退到原有的列表类型逻辑
      if (listType === 'highperf') {
        nodes = statements.getHighPerformanceNodes.all(500, 0);
      } else {
        nodes = statements.getAvailableNodesForSub.all(500, 0);
      }
    }

    if (!nodes || nodes.length === 0) {
      if (clientType === 'raw') return res.json({ success: true, data: [] });
      return res.status(404).send('No nodes matching your criteria.');
    }

    // target=raw 直接返回 JSON
    if (clientType === 'raw') {
      return res.json({ success: true, data: nodes });
    }

    // 格式化节点名称: longName_hash (如 United States_a1b2c3d)，如果 long_name 不存在则使用 short_name
    function nodeName(n) {
      const namePart = n.long_name && n.long_name !== 'Unknown' ? n.long_name : n.short_name;
      return `${namePart.replace(/\s+/g, '_')}_${n.hash}`;
    }

    // Base64 订阅格式
    if (clientType === 'base64') {
      const rawLinks = nodes.map(n => {
        const remark = encodeURIComponent(nodeName(n));
        return `${n.protocol}://${n.ip}:${n.port}#${remark}`;
      }).join('\n');
      const b64 = Buffer.from(rawLinks).toString('base64');
      res.setHeader('Content-Type', 'text/plain');
      return res.send(b64);
    }
    
    // Clash 配置文件格式 (YAML)
    if (clientType === 'clash') {
      let yaml = 'proxies:\n';
      for (const n of nodes) {
        const name = nodeName(n);
        let type = n.protocol;
        if (type === 'socks4' || type === 'socks5') type = 'socks5';
        yaml += `  - name: "${name}"\n`;
        yaml += `    type: ${type}\n`;
        yaml += `    server: ${n.ip}\n`;
        yaml += `    port: ${n.port}\n`;
      }
      yaml += '\nproxy-groups:\n';
      yaml += '  - name: "自动选择"\n';
      yaml += '    type: url-test\n';
      yaml += '    proxies:\n';
      for (const n of nodes) {
        yaml += `      - "${nodeName(n)}"\n`;
      }
      yaml += '    url: "http://www.gstatic.com/generate_204"\n';
      yaml += '    interval: 300\n';
      yaml += '  - name: "故障转移"\n';
      yaml += '    type: fallback\n';
      yaml += '    proxies:\n';
      for (const n of nodes) {
        yaml += `      - "${nodeName(n)}"\n`;
      }
      yaml += '    url: "http://www.gstatic.com/generate_204"\n';
      yaml += '    interval: 300\n';
      res.setHeader('Content-Type', 'text/yaml');
      return res.send(yaml);
    }

    // V2Ray/VController 订阅格式 (Base64 JSON)
    if (clientType === 'v2ray' || clientType === 'v2ray-json') {
      const v2rayServers = nodes.map(n => {
        const name = nodeName(n);
        // 根据协议确定网络类型
        let net = 'tcp';
        if (n.protocol === 'socks4' || n.protocol === 'socks5') {
          return {
            remark: name,
            protocol: 'socks',
            protocolparam: '',
            server: n.ip,
            port: n.port,
            method: '',
            ota: false,
            udp: udp
          };
        }
        if (n.protocol === 'http') {
          return {
            remark: name,
            protocol: 'http',
            protocolparam: '',
            server: n.ip,
            port: n.port,
            method: '',
            ota: false,
            udp: udp
          };
        }
        // https 作为 http 处理（实际是 http over tls）
        return {
          remark: name,
          protocol: 'http',
          protocolparam: '',
          server: n.ip,
          port: n.port,
          method: '',
          ota: false,
          udp: udp,
          tls: n.protocol === 'https'
        };
      });

      const v2rayConfig = {
        version: 1,
        server: v2rayServers
      };
      const jsonStr = JSON.stringify(v2rayConfig, null, 2);
      res.setHeader('Content-Type', 'text/plain');
      return res.send(Buffer.from(jsonStr).toString('base64'));
    }

    // Clash Proxy Provider 格式 (YAML)
    if (clientType === 'clash-provider') {
      let yaml = 'proxies:\n';
      for (const n of nodes) {
        const name = nodeName(n);
        let type = n.protocol;
        if (type === 'socks4' || type === 'socks5') type = 'socks5';
        yaml += `  - name: "${name}"\n`;
        yaml += `    type: ${type}\n`;
        yaml += `    server: ${n.ip}\n`;
        yaml += `    port: ${n.port}\n`;
      }
      res.setHeader('Content-Type', 'text/yaml');
      return res.send(yaml);
    }

    // 默认返回 base64
    const rawLinks = nodes.map(n => {
      const remark = encodeURIComponent(nodeName(n));
      return `${n.protocol}://${n.ip}:${n.port}#${remark}`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.send(Buffer.from(rawLinks).toString('base64'));

  } catch (err) {
    logger.error(`[API] 生成订阅错误: ${err.message}`);
    res.status(500).send('Internal Error');
  }
});

// 管理员 API: 清除所有数据 (需要双重验证)
app.post('/api/admin/clear', (req, res) => {
  const { uuid, token } = req.body;
  if (verifyAuth(uuid, token)) {
    try {
      statements.clearAllData.run();
      statements.clearDeletedLogs.run();
      logger.warn(`[Admin] 🗑️ 管理员指令：已清空所有代理数据和历史日志。`);
      res.json({ success: true, message: '数据已清空' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.status(401).json({ success: false, message: '凭据无效' });
  }
});

// 管理员 API: 重置凭据 (需要双重验证)
app.post('/api/admin/reset-creds', (req, res) => {
  const { uuid, token } = req.body;
  if (verifyAuth(uuid, token)) {
    try {
      resetAdminCreds();
      res.json({ success: true, message: '凭据已重置，新凭据请查看终端或 data/admin_creds.txt' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.status(401).json({ success: false, message: '凭据无效' });
  }
});

export function startServer() {
  const { port } = config.app;
  return app.listen(port, '0.0.0.0', () => {
    logger.info(`[Web] 控制台和 API 服务已运行: http://0.0.0.0:${port}`);
  });
}