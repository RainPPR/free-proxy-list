import { statements, searchNodes } from '../db.js';
import { config } from '../config.js';

/**
 * 服务器端渲染组件
 * 提供类似Next.js的服务端渲染功能
 */

// 读取CSS文件内容 - 使用 fs 同步读取以兼容打包环境
const fs = require('fs');
let CSS_CONTENT = '';
try {
  CSS_CONTENT = fs.readFileSync('./styles.css', 'utf-8');
} catch (e) {
  console.error('Failed to load CSS:', e);
}

/**
 * 生成完整的HTML页面
 * @param {Object} data - 服务器端数据
 * @returns {string} - HTML字符串
 */
export function renderFullPage(data = {}) {
  const { stats = {}, nodes = [], region = 'global', currentSort = {} } = data;
  
  // 基础HTML结构
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${region === 'cn' ? 'China Proxy Portal' : 'Global Proxy Portal'}</title>
  <style>${CSS_CONTENT}</style>
</head>
<body>

<div class="container">
  <header>
    <div style="display: flex; align-items: baseline; gap: 15px;">
      <h1>${region === 'cn' ? 'China Proxy Portal' : 'Proxy List System'}</h1>
      <div id="mode-switcher" style="display: flex; gap: 5px;">
        <button class="btn btn-outline mode-btn ${region === 'global' ? 'active' : ''}" data-region="global" onclick="switchRegion('global')">Global</button>
        <button class="btn btn-outline mode-btn ${region === 'cn' ? 'active' : ''}" data-region="cn" onclick="switchRegion('cn')">China</button>
      </div>
    </div>
    <button class="btn btn-outline" onclick="loadData()">Refresh</button>
  </header>

  <div class="stats-bar" id="stats">
    <div class="stat-item"><span class="stat-label">Ready:</span> <span id="s-ready" class="stat-value">${stats.readyCount || '-'}</span></div>
    <div class="stat-item"><span class="stat-label">Available:</span> <span id="s-avail" class="stat-value">${stats.availableCount || '-'}</span></div>
    <div class="stat-item"><span class="stat-label">High-Perf:</span> <span id="s-perf" class="stat-value">${stats.highPerfCount || '-'}</span></div>
    <div class="stat-item"><span class="stat-label">Purged:</span> <span id="s-del" class="stat-value">${stats.deletedLogsCount || '-'}</span></div>
  </div>

  <div class="toolbar">
    <div class="field">
      <label>Country</label>
      <input type="text" id="f-country" placeholder="e.g. US" oninput="debounceLoad()">
    </div>
    <div class="field">
      <label>Protocol</label>
      <select id="f-type" onchange="loadData()">
        <option value="">ALL</option>
        <option value="http">HTTP</option>
        <option value="https">HTTPS</option>
        <option value="socks4">SOCKS4</option>
        <option value="socks5">SOCKS5</option>
      </select>
    </div>
    <div class="field">
      <label>Min Speed (KB/s)</label>
      <input type="number" id="f-speed" oninput="debounceLoad()">
    </div>
    <div class="field">
      <label>Max Delay (ms)</label>
      <input type="number" id="f-delay" oninput="debounceLoad()">
    </div>
    <div class="field">
      <label>Format</label>
      <select id="f-format">
        <option value="base64">Base64</option>
        <option value="clash">Clash</option>
        <option value="v2ray">V2Ray</option>
        <option value="clash-provider">Provider</option>
        <option value="raw">Raw Format</option>
      </select>
    </div>
    <div class="field" style="justify-content: flex-end;">
        <button class="btn" onclick="copyLink()">Copy Link</button>
    </div>
  </div>

  <div class="table-box">
    <table>
      <thead>
        <tr>
          <th onclick="setSort('ip')">Endpoint</th>
          <th onclick="setSort('protocol')">Type</th>
          <th onclick="setSort('short_name')">Location</th>
          <th onclick="setSort('download_speed_bps')">Speed</th>
          <th onclick="setSort('google_latency')">Latency</th>
          <th onclick="setSort('msft_latency')">MSFT</th>
          <th onclick="setSort('hicmatch_latency')">HICMATCH</th>
          <th onclick="setSort('last_checked')">Checked</th>
        </tr>
      </thead>
      <tbody id="node-list">
        ${renderNodesTable(nodes)}
      </tbody>
    </table>
  </div>

  <div class="pagination">
    <button class="btn btn-outline" onclick="changePage(-1)">PREV</button>
    <div class="field">
      <label>Page</label>
      <input type="number" id="f-page" value="1" min="1" onchange="loadData()">
    </div>
    <div class="field">
      <label>Limit</label>
      <select id="f-limit" onchange="resetPageAndLoad()">
        <option value="20">20</option>
        <option value="50">50</option>
        <option value="100" selected>100</option>
        <option value="200">200</option>
      </select>
    </div>
    <button class="btn btn-outline" onclick="changePage(1)">NEXT</button>
  </div>

  <div class="admin-section">
    <h2>Administrative Controls</h2>
    <p style="color: var(--text-muted); margin-bottom: 15px;">Requires UUID and Token from server logs.</p>
    <div style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
        <div class="field">
            <label>Master UUID</label>
            <input type="text" id="a-uuid">
        </div>
        <div class="field">
            <label>Session Token</label>
            <input type="password" id="a-token">
        </div>
        <button class="btn btn-danger" onclick="adminOp('clear')">Clear All Data</button>
        <button class="btn btn-outline" onclick="adminOp('reset-creds')">Reset Credentials</button>
    </div>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
  // 服务器端注入的数据
  const SERVER_DATA = ${JSON.stringify({
    region,
    stats,
    nodes,
    currentSort
  })};
  
  let debounceTimer;
  let currentSort = SERVER_DATA.currentSort || { field: 'status', order: 'DESC' };
  let currentRegion = SERVER_DATA.region || 'global';

  function switchRegion(region) {
    currentRegion = region;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.region === region);
      if (btn.classList.contains('active')) {
          btn.style.background = 'var(--text)';
          btn.style.color = 'var(--bg)';
      } else {
          btn.style.background = 'transparent';
          btn.style.color = 'var(--text)';
      }
    });

    if (region === 'cn') {
      document.querySelector('h1').innerText = 'China Proxy Portal';
    } else {
      document.querySelector('h1').innerText = 'Global Proxy Portal';
    }

    resetPageAndLoad();
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.innerText = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
  }

  function debounceLoad() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadData, 400);
  }

  function setSort(field) {
    if (currentSort.field === field) {
        currentSort.order = currentSort.order === 'ASC' ? 'DESC' : 'ASC';
    } else {
        currentSort.field = field;
        currentSort.order = 'DESC';
    }
    
    document.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-active', 'asc');
        if (th.innerText.toLowerCase().includes(field.replace('_','').toLowerCase()) || 
            (field === 'download_speed_bps' && th.innerText === 'SPEED') ||
            (field === 'google_latency' && th.innerText === 'LATENCY') ||
            (field === 'short_name' && th.innerText === 'LOCATION') ||
            (field === 'last_checked' && th.innerText === 'CHECKED')) {
            th.classList.add('sort-active');
            if (currentSort.order === 'ASC') th.classList.add('asc');
        }
    });
    
    loadData();
  }

  function getQueryString(isRaw = true) {
      const country = document.getElementById('f-country').value;
      const type = document.getElementById('f-type').value;
      const speed = document.getElementById('f-speed').value;
      const delay = document.getElementById('f-delay').value;
      const page = document.getElementById('f-page').value;
      const limit = document.getElementById('f-limit').value;
      const format = document.getElementById('f-format') ? document.getElementById('f-format').value : 'base64';
      
      let q = '?target=' + (isRaw ? 'raw' : format);
      if (country) q += '&country=' + country;
      if (type) q += '&type=' + type;
      if (speed) q += '&speed=' + speed;
      if (delay) q += '&delay=' + delay;
      if (page) q += '&page=' + page;
      if (limit) q += '&limit=' + limit;
      if (currentSort.field) q += '&sort=' + currentSort.field + '&order=' + currentSort.order;
      return q;
  }

  function getApiBase() {
    return currentRegion === 'cn' ? '/api/cn' : '/api';
  }

  function changePage(delta) {
    const el = document.getElementById('f-page');
    let val = parseInt(el.value, 10) || 1;
    val = Math.max(1, val + delta);
    el.value = val;
    loadData();
  }

  function resetPageAndLoad() {
    document.getElementById('f-page').value = 1;
    loadData();
  }

  async function loadData() {
    try {
      const base = getApiBase();
      // Load Stats
      const statRes = await fetch(base + '/stats').then(r => r.json());
      if (statRes.success) {
        document.getElementById('s-ready').innerText = statRes.data.readyCount;
        document.getElementById('s-avail').innerText = statRes.data.availableCount;
        document.getElementById('s-perf').innerText = statRes.data.highPerfCount;
        document.getElementById('s-del').innerText = statRes.data.deletedLogsCount;
      }

      // Load Nodes
      const nodeRes = await fetch(base + '/subconverter' + getQueryString(true)).then(r => r.json());
      const tbody = document.getElementById('node-list');
      
      if (nodeRes.success) {
        if (nodeRes.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">No matching nodes found.</td></tr>';
            return;
        }
        
        tbody.innerHTML = nodeRes.data.map(n => {
            const speed = (n.download_speed_bps / 1024).toFixed(1) + ' KB/s';
            const latency = n.google_latency > 0 ? n.google_latency + 'ms' : '-';
            const msft = n.msft_latency > 0 ? n.msft_latency + 'ms' : '-';
            const location = n.long_name && n.long_name !== 'Unknown' ? n.long_name : (n.short_name || '-');
            const time = new Date(n.last_checked).toLocaleTimeString();
            
            return '<tr>' +
                '<td><b>' + n.ip + '</b>:' + n.port + '</td>' +
                '<td><span class="protocol-tag">' + n.protocol.toUpperCase() + '</span></td>' +
                '<td>' + location + '</td>' +
                '<td><span class="speed-val">' + speed + '</span></td>' +
                '<td><span class="latency-val ' + (n.google_latency <= 0 ? 'fail':'') + '">' + latency + '</span></td>' +
                '<td><span class="latency-val ' + (n.msft_latency <= 0 ? 'fail':'') + '">' + msft + '</span></td>' +
                '<td><span class="latency-val">' + (n.hicmatch_latency > 0 ? n.hicmatch_latency + 'ms' : '-') + '</span></td>' +
                '<td style="font-size:10px; color:var(--text-muted)">' + time + '</td>' +
            '</tr>';
        }).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }

  function copyLink() {
      const url = window.location.origin + getApiBase() + '/subconverter' + getQueryString(false);
      
      // 尝试使用Clipboard API，失败则降级到传统方法
      if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => showToast('Link copied')).catch(() => fallbackCopy(url));
      } else {
          fallbackCopy(url);
      }
  }
  
  function fallbackCopy(text) {
      // 传统降级方案：创建临时元素复制
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
          document.execCommand('copy');
          showToast('Link copied');
      } catch (e) {
          showToast('Copy failed');
      }
      document.body.removeChild(textarea);
  }

  async function adminOp(type) {
      const uuid = document.getElementById('a-uuid').value;
      const token = document.getElementById('a-token').value;
      if (!uuid || !token) return alert('Credentials required');
      
      if (type === 'clear' && !confirm('Clear all data?')) return;
      
      try {
          const res = await fetch('/api/admin/' + type, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uuid, token })
          });
          const data = await res.json();
          showToast(data.message || (data.success ? 'Success' : 'Failed'));
          if (data.success) loadData();
      } catch (e) {
          alert('Network error');
      }
  }

  // 页面加载时，如果服务器已经提供了数据，可以直接显示
  if (SERVER_DATA.nodes && SERVER_DATA.nodes.length > 0) {
    // 统计数据已经在HTML中显示了
    console.log('Server-side rendered data loaded');
  }
</script>
</body>
</html>`;
}

/**
 * 渲染节点表格行
 * @param {Array} nodes - 节点数组
 * @returns {string} - HTML字符串
 */
function renderNodesTable(nodes) {
  if (!nodes || nodes.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; padding: 40px;">No nodes available</td></tr>';
  }
  
  return nodes.map(n => {
    const speed = (n.download_speed_bps / 1024).toFixed(1) + ' KB/s';
    const latency = n.google_latency > 0 ? n.google_latency + 'ms' : '-';
    const msft = n.msft_latency > 0 ? n.msft_latency + 'ms' : '-';
    const hicmatch = n.hicmatch_latency > 0 ? n.hicmatch_latency + 'ms' : '-';
    const location = n.long_name && n.long_name !== 'Unknown' ? n.long_name : (n.short_name || '-');
    const time = new Date(n.last_checked).toLocaleTimeString();
    
    return `<tr>
      <td><b>${n.ip}</b>:${n.port}</td>
      <td><span class="protocol-tag">${n.protocol.toUpperCase()}</span></td>
      <td>${location}</td>
      <td><span class="speed-val">${speed}</span></td>
      <td><span class="latency-val ${n.google_latency <= 0 ? 'fail' : ''}">${latency}</span></td>
      <td><span class="latency-val ${n.msft_latency <= 0 ? 'fail' : ''}">${msft}</span></td>
      <td><span class="latency-val">${hicmatch}</span></td>
      <td style="font-size:10px; color:var(--text-muted)">${time}</td>
    </tr>`;
  }).join('');
}

/**
 * 渲染主页
 * @param {string} region - 区域
 * @returns {Promise<string>} - HTML字符串
 */
export async function renderHomepage(region = 'global') {
  try {
    // 获取统计数据
    const stats = statements.getStats.get(region, region, region, region) || {};
    
    // 获取节点数据（第一页，100条）
    const nodes = statements.getAvailableNodesForSub.all(region, region, region, 100, 0) || [];
    
    return renderFullPage({
      stats,
      nodes,
      region,
      currentSort: { field: 'status', order: 'DESC' }
    });
  } catch (error) {
    console.error('Error rendering homepage:', error);
    // 返回错误页面
    return renderFullPage({
      stats: {},
      nodes: [],
      region,
      currentSort: { field: 'status', order: 'DESC' }
    });
  }
}