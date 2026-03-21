(function() {
  // Application State
  const state = {
    region: window.SERVER_DATA?.region || 'global',
    sort: window.SERVER_DATA?.currentSort || { field: 'status', order: 'DESC' },
    debounceTimer: null,
    stats: window.SERVER_DATA?.stats || {},
    nodes: window.SERVER_DATA?.nodes || []
  };

  // DOM Elements
  const DOM = {
    regionBtns: document.querySelectorAll('.region-switcher .btn'),
    title: document.getElementById('main-title'),
    btnRefresh: document.getElementById('btn-refresh'),
    stats: {
      ready: document.getElementById('s-ready'),
      avail: document.getElementById('s-avail'),
      perf: document.getElementById('s-perf'),
      del: document.getElementById('s-del')
    },
    filters: {
      country: document.getElementById('f-country'),
      type: document.getElementById('f-type'),
      speed: document.getElementById('f-speed'),
      delay: document.getElementById('f-delay'),
      format: document.getElementById('f-format'),
      page: document.getElementById('f-page'),
      limit: document.getElementById('f-limit')
    },
    btnCopy: document.getElementById('btn-copy'),
    tableHeaders: document.querySelectorAll('th[data-sort]'),
    nodeList: document.getElementById('node-list'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    toast: document.getElementById('toast'),
    admin: {
      uuid: document.getElementById('a-uuid'),
      token: document.getElementById('a-token'),
      btnClear: document.getElementById('btn-clear'),
      btnReset: document.getElementById('btn-reset'),
      btnTest: document.getElementById('btn-test')
    }
  };

  // Initialization
  function init() {
    bindEvents();
    renderInitialState();
  }

  function bindEvents() {
    // Region Switcher
    DOM.regionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.region = e.target.dataset.region;
        updateRegionUI();
        resetPageAndLoad();
      });
    });

    // Refresh
    DOM.btnRefresh.addEventListener('click', loadData);

    // Filters (Input Debounce)
    ['country', 'speed', 'delay'].forEach(f => {
      DOM.filters[f].addEventListener('input', debounceLoad);
    });

    // Filters (Change instantly)
    ['type', 'page'].forEach(f => {
      DOM.filters[f].addEventListener('change', loadData);
    });
    DOM.filters.limit.addEventListener('change', resetPageAndLoad);

    // Table Sorting
    DOM.tableHeaders.forEach(th => {
      th.addEventListener('click', (e) => {
        const field = e.target.dataset.sort;
        if (state.sort.field === field) {
          state.sort.order = state.sort.order === 'ASC' ? 'DESC' : 'ASC';
        } else {
          state.sort.field = field;
          state.sort.order = 'DESC';
        }
        updateSortUI();
        loadData();
      });
    });

    // Pagination
    DOM.btnPrev.addEventListener('click', () => changePage(-1));
    DOM.btnNext.addEventListener('click', () => changePage(1));

    // Copy Link
    DOM.btnCopy.addEventListener('click', copyLink);

    // Admin
    DOM.admin.btnClear.addEventListener('click', () => adminOp('clear'));
    DOM.admin.btnReset.addEventListener('click', () => adminOp('reset-creds'));
    DOM.admin.btnTest.addEventListener('click', () => adminOp('test-plugins'));
  }

  function renderInitialState() {
    updateRegionUI();
    updateSortUI();
    renderStats(state.stats);
    renderTable(state.nodes);
  }

  // UI Updates
  function updateRegionUI() {
    DOM.regionBtns.forEach(btn => {
      if (btn.dataset.region === state.region) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    DOM.title.innerText = state.region === 'cn' ? 'China Proxy Portal' : 'Global Proxy Portal';
  }

  function updateSortUI() {
    DOM.tableHeaders.forEach(th => {
      th.classList.remove('active', 'asc');
      if (th.dataset.sort === state.sort.field) {
        th.classList.add('active');
        if (state.sort.order === 'ASC') th.classList.add('asc');
      }
    });
  }

  function renderStats(stats) {
    if (!stats) return;
    DOM.stats.ready.innerText = stats.readyCount ?? '-';
    DOM.stats.avail.innerText = stats.availableCount ?? '-';
    DOM.stats.perf.innerText = stats.highPerfCount ?? '-';
    DOM.stats.del.innerText = stats.deletedLogsCount ?? '-';
  }

  function renderTable(nodes) {
    if (!nodes || nodes.length === 0) {
      DOM.nodeList.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-muted)">No matching nodes found.</td></tr>';
      return;
    }

    const html = nodes.map(n => {
      const speed = (n.download_speed_bps / 1024).toFixed(1) + ' KB/s';
      const latency = n.google_latency > 0 ? n.google_latency + 'ms' : '-';
      const msft = n.msft_latency > 0 ? n.msft_latency + 'ms' : '-';
      const hic = n.hicmatch_latency > 0 ? n.hicmatch_latency + 'ms' : '-';
      const location = n.long_name && n.long_name !== 'Unknown' ? n.long_name : (n.short_name || '-');
      const time = new Date(n.last_checked).toLocaleTimeString();

      return `<tr>
        <td style="font-family: monospace;"><b>${n.ip}</b>:<span style="color:var(--text-secondary)">${n.port}</span></td>
        <td><span class="protocol-tag">${n.protocol.toUpperCase()}</span></td>
        <td>${location}</td>
        <td><span class="speed-val">${speed}</span></td>
        <td><span class="latency-val ${n.google_latency <= 0 ? 'fail' : ''}">${latency}</span></td>
        <td><span class="latency-val ${n.msft_latency <= 0 ? 'fail' : ''}">${msft}</span></td>
        <td><span class="latency-val">${hic}</span></td>
        <td style="font-size:0.75rem; color:var(--text-muted)">${time}</td>
      </tr>`;
    }).join('');

    DOM.nodeList.innerHTML = html;
  }

  function showToast(msg) {
    DOM.toast.innerText = msg;
    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), 2500);
  }

  // Actions
  function debounceLoad() {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(loadData, 400);
  }

  function changePage(delta) {
    let val = parseInt(DOM.filters.page.value, 10) || 1;
    val = Math.max(1, val + delta);
    DOM.filters.page.value = val;
    loadData();
  }

  function resetPageAndLoad() {
    DOM.filters.page.value = 1;
    loadData();
  }

  function getQueryString(isRaw = true) {
    const f = DOM.filters;
    let q = '?target=' + (isRaw ? 'raw' : f.format.value);
    if (f.country.value) q += '&country=' + encodeURIComponent(f.country.value);
    if (f.type.value) q += '&type=' + encodeURIComponent(f.type.value);
    if (f.speed.value) q += '&speed=' + encodeURIComponent(f.speed.value);
    if (f.delay.value) q += '&delay=' + encodeURIComponent(f.delay.value);
    if (f.page.value) q += '&page=' + encodeURIComponent(f.page.value);
    if (f.limit.value) q += '&limit=' + encodeURIComponent(f.limit.value);
    if (state.sort.field) q += '&sort=' + state.sort.field + '&order=' + state.sort.order;
    return q;
  }

  function getApiBase() {
    return state.region === 'cn' ? '/api/cn' : '/api';
  }

  async function loadData() {
    DOM.nodeList.style.opacity = '0.4';
    try {
      const base = getApiBase();
      
      const [statRes, nodeRes] = await Promise.all([
        fetch(base + '/stats').then(r => r.json()).catch(() => ({})),
        fetch(base + '/subconverter' + getQueryString(true)).then(r => r.json()).catch(() => ({}))
      ]);

      if (statRes.success) {
        state.stats = statRes.data;
        renderStats(state.stats);
      }

      if (nodeRes.success) {
        state.nodes = nodeRes.data || [];
        renderTable(state.nodes);
      } else if (nodeRes.status === 404 || !nodeRes.data) {
        renderTable([]);
      }
    } catch(e) {
      console.error(e);
      showToast('Network error loading data');
    } finally {
      DOM.nodeList.style.opacity = '1';
    }
  }

  function copyLink() {
    const url = window.location.origin + getApiBase() + '/subconverter' + getQueryString(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Link copied!');
    } catch (e) {
      showToast('Copy failed');
    }
    document.body.removeChild(textarea);
  }

  async function adminOp(type) {
    const uuid = DOM.admin.uuid.value;
    const token = DOM.admin.token.value;
    if (!uuid || !token) {
      showToast('Credentials required!');
      return;
    }

    if (type === 'clear' && !confirm('Are you sure you want to clear ALL proxies?')) return;

    try {
      DOM.admin.btnTest.style.opacity = '0.5';
      const res = await fetch('/api/admin/' + type, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, token })
      });
      const data = await res.json();
      showToast(data.message || (data.success ? 'Operation Successful' : 'Operation Failed'));
      if (data.success && type !== 'test-plugins') loadData();
    } catch (e) {
      showToast('Network error');
    } finally {
      DOM.admin.btnTest.style.opacity = '1';
    }
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
