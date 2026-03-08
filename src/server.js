import express from 'express';
import path from 'node:path';
import { statements } from './db.js';
import { config, logger } from './config.js';

const app = express();

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
    const clientType = req.query.target || 'clash';
    const listType = req.query.list || 'all'; // 'all', 'available', 'highperf'
    const udp = req.query.udp === 'true'; // v2ray 是否启用 UDP

    let nodes = [];
    if (listType === 'highperf') {
      nodes = statements.getHighPerformanceNodes.all(500, 0);
    } else if (listType === 'available') {
      nodes = statements.getAvailableNodesForSub.all(500, 0);
    } else {
      // 'all' - 获取所有可用+高性能，保持 getAvailableNodesForSub 的排序
      nodes = statements.getAvailableNodesForSub.all(500, 0);
    }

    if (!nodes || nodes.length === 0) {
      return res.status(404).send('No available proxy nodes yet. Wait for validator.');
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

export function startServer() {
  const { port } = config.app;
  return app.listen(port, '0.0.0.0', () => {
    logger.info(`[Web] 控制台和 API 服务已运行: http://0.0.0.0:${port}`);
  });
}