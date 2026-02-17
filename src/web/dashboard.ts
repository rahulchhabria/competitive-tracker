export function buildDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rival — Competitive Intelligence</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --bg-card: #12121a;
    --bg-hover: #1a1a26;
    --border: #1e1e2e;
    --border-hover: #2e2e42;
    --text: #e4e4ef;
    --text-dim: #6b6b80;
    --text-muted: #44445a;
    --cyan: #22d3ee;
    --cyan-dim: rgba(34, 211, 238, 0.1);
    --green: #4ade80;
    --green-dim: rgba(74, 222, 128, 0.1);
    --yellow: #facc15;
    --yellow-dim: rgba(250, 204, 21, 0.1);
    --red: #f87171;
    --red-dim: rgba(248, 113, 113, 0.1);
    --magenta: #c084fc;
    --magenta-dim: rgba(192, 132, 252, 0.1);
    --radius: 12px;
    --radius-sm: 8px;
    --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
  }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }

  /* Layout */
  .shell {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Header */
  header {
    padding: 32px 0 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .logo h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, var(--cyan), var(--magenta));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .logo .version {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
  }

  .header-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .dot-green { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .dot-red { background: var(--red); box-shadow: 0 0 8px var(--red); }

  /* Nav */
  nav {
    display: flex;
    gap: 4px;
    margin-bottom: 32px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0;
  }

  nav button {
    font-family: var(--font);
    font-size: 14px;
    font-weight: 500;
    padding: 10px 16px;
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
  }

  nav button:hover { color: var(--text); }
  nav button.active { color: var(--cyan); border-bottom-color: var(--cyan); }

  /* Stats grid */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    transition: border-color 0.15s;
  }

  .stat:hover { border-color: var(--border-hover); }

  .stat .value {
    font-size: 32px;
    font-weight: 700;
    font-family: var(--mono);
    letter-spacing: -1px;
  }

  .stat .label {
    font-size: 13px;
    color: var(--text-dim);
    margin-top: 4px;
  }

  .stat.cyan .value { color: var(--cyan); }
  .stat.green .value { color: var(--green); }
  .stat.yellow .value { color: var(--yellow); }
  .stat.magenta .value { color: var(--magenta); }

  /* Cards */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 20px;
    transition: border-color 0.15s;
  }

  .card:hover { border-color: var(--border-hover); }

  .card-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-header h2 {
    font-size: 15px;
    font-weight: 600;
  }

  .card-body { padding: 20px; }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    font-weight: 600;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  td {
    padding: 12px 16px;
    font-size: 14px;
    border-bottom: 1px solid var(--border);
  }

  tr:last-child td { border-bottom: none; }

  tr:hover td { background: var(--bg-hover); }

  td a {
    color: var(--text);
    text-decoration: none;
    border-bottom: 1px dashed var(--text-muted);
    transition: color 0.15s, border-color 0.15s;
  }

  td a:hover { color: var(--cyan); border-color: var(--cyan); }

  /* Badges */
  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 6px;
    text-transform: uppercase;
  }

  .badge-critical { background: var(--red-dim); color: var(--red); }
  .badge-high { background: var(--yellow-dim); color: var(--yellow); }
  .badge-medium { background: var(--cyan-dim); color: var(--cyan); }
  .badge-low { background: var(--green-dim); color: var(--green); }

  .badge-enabled { background: var(--green-dim); color: var(--green); }
  .badge-disabled { background: rgba(100,100,120,0.15); color: var(--text-muted); }

  /* Threat bar */
  .threat-bar {
    display: flex;
    gap: 2px;
    height: 32px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-top: 8px;
  }

  .threat-bar .segment {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    min-width: 32px;
    transition: flex 0.3s ease;
  }

  .threat-bar .seg-critical { background: var(--red-dim); color: var(--red); }
  .threat-bar .seg-high { background: var(--yellow-dim); color: var(--yellow); }
  .threat-bar .seg-medium { background: var(--cyan-dim); color: var(--cyan); }
  .threat-bar .seg-low { background: var(--green-dim); color: var(--green); }

  /* Digest viewer */
  .digest-list {
    list-style: none;
  }

  .digest-list li {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.15s;
  }

  .digest-list li:last-child { border-bottom: none; }
  .digest-list li:hover { background: var(--bg-hover); }
  .digest-list li.active { background: var(--cyan-dim); }

  .digest-content {
    padding: 24px;
    font-size: 14px;
    line-height: 1.8;
    white-space: pre-wrap;
    font-family: var(--font);
    max-height: 70vh;
    overflow-y: auto;
  }

  .digest-content h1, .digest-content h2, .digest-content h3, .digest-content h4 {
    margin: 20px 0 8px;
    font-weight: 600;
  }

  .digest-content h1 { font-size: 20px; color: var(--cyan); }
  .digest-content h2 { font-size: 17px; }
  .digest-content h3 { font-size: 15px; color: var(--text-dim); }

  /* Grid layouts */
  .two-col {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 20px;
  }

  /* Competitor cards */
  .comp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .comp-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    transition: border-color 0.2s;
  }

  .comp-card:hover { border-color: var(--border-hover); }

  .comp-card .name {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .comp-card .meta {
    font-size: 13px;
    color: var(--text-dim);
    margin-bottom: 4px;
  }

  .comp-card .feeds {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
    margin-top: 12px;
  }

  /* Empty state */
  .empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-dim);
  }

  .empty .icon { font-size: 40px; margin-bottom: 16px; opacity: 0.3; }
  .empty h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--text); }
  .empty p { font-size: 14px; }

  /* Loading */
  .loading {
    text-align: center;
    padding: 40px;
    color: var(--text-dim);
  }

  @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
  .loading::before { content: '◒'; animation: pulse 1s infinite; margin-right: 8px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }

  /* Responsive */
  @media (max-width: 768px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; }
    .comp-grid { grid-template-columns: 1fr; }
    header { flex-direction: column; align-items: flex-start; gap: 8px; }
  }
</style>
</head>
<body>

<div class="shell">
  <header>
    <div class="logo">
      <h1>Rival</h1>
      <span class="version">v2.0.0</span>
    </div>
    <div class="header-status" id="api-status">
      <span class="dot dot-red"></span>
      <span>Loading...</span>
    </div>
  </header>

  <nav>
    <button class="active" data-tab="dashboard">Dashboard</button>
    <button data-tab="competitors">Competitors</button>
    <button data-tab="feed">Feed</button>
    <button data-tab="digests">Digests</button>
  </nav>

  <main id="main">
    <div class="loading">Loading dashboard...</div>
  </main>
</div>

<script>
(function() {
  let state = { tab: 'dashboard', status: null, competitors: [], content: [], analyses: [], digests: [], threats: null, selectedDigest: null };

  // Nav
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tab = btn.dataset.tab;
      render();
    });
  });

  async function fetchJSON(url) {
    const res = await fetch(url);
    return res.json();
  }

  async function loadAll() {
    const [status, competitors, content, analyses, threats, digests] = await Promise.all([
      fetchJSON('/api/status'),
      fetchJSON('/api/competitors'),
      fetchJSON('/api/content'),
      fetchJSON('/api/analyses'),
      fetchJSON('/api/threat-summary'),
      fetchJSON('/api/digests'),
    ]);
    state.status = status;
    state.competitors = competitors;
    state.content = content;
    state.analyses = analyses;
    state.threats = threats;
    state.digests = digests;

    // Update header status
    const el = document.getElementById('api-status');
    if (status.apiKey.configured) {
      el.innerHTML = '<span class="dot dot-green"></span><span>' + status.apiKey.provider + ' connected</span>';
    } else {
      el.innerHTML = '<span class="dot dot-red"></span><span>No API key</span>';
    }

    render();
  }

  function render() {
    const main = document.getElementById('main');
    switch (state.tab) {
      case 'dashboard': main.innerHTML = renderDashboard(); break;
      case 'competitors': main.innerHTML = renderCompetitors(); break;
      case 'feed': main.innerHTML = renderFeed(); break;
      case 'digests': main.innerHTML = renderDigests(); break;
    }
    attachEvents();
  }

  function renderDashboard() {
    if (!state.status) return '<div class="loading">Loading...</div>';
    const s = state.status;
    const t = state.threats || { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

    const threatBar = t.total > 0 ? \`
      <div class="threat-bar">
        \${t.critical > 0 ? '<div class="segment seg-critical" style="flex:' + t.critical + '">' + t.critical + '</div>' : ''}
        \${t.high > 0 ? '<div class="segment seg-high" style="flex:' + t.high + '">' + t.high + '</div>' : ''}
        \${t.medium > 0 ? '<div class="segment seg-medium" style="flex:' + t.medium + '">' + t.medium + '</div>' : ''}
        \${t.low > 0 ? '<div class="segment seg-low" style="flex:' + t.low + '">' + t.low + '</div>' : ''}
      </div>
    \` : '';

    // Recent content
    const recent = state.content.slice(0, 8);
    const recentRows = recent.map(c => {
      const analysis = state.analyses.find(a => a.contentId === c.id);
      const threat = analysis ? '<span class="badge badge-' + analysis.threatLevel + '">' + analysis.threatLevel + '</span>' : '<span class="badge badge-disabled">pending</span>';
      const date = new Date(c.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return '<tr><td>' + date + '</td><td><a href="' + esc(c.url) + '" target="_blank">' + esc(trunc(c.title, 55)) + '</a></td><td>' + esc(c.competitor) + '</td><td>' + threat + '</td></tr>';
    }).join('');

    return \`
      <div class="stats">
        <div class="stat cyan"><div class="value">\${s.competitors.total}</div><div class="label">Competitors tracked</div></div>
        <div class="stat green"><div class="value">\${s.content}</div><div class="label">Articles ingested</div></div>
        <div class="stat magenta"><div class="value">\${s.analyses}</div><div class="label">Analyses complete</div></div>
        <div class="stat yellow"><div class="value">\${s.digests}</div><div class="label">Digests generated</div></div>
      </div>

      \${t.total > 0 ? \`
      <div class="card">
        <div class="card-header">
          <h2>Threat Distribution</h2>
          <span style="font-size:13px;color:var(--text-dim)">\${t.total} analyzed</span>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:24px;margin-bottom:12px;font-size:13px">
            <span><span class="badge badge-critical">crit</span> \${t.critical}</span>
            <span><span class="badge badge-high">high</span> \${t.high}</span>
            <span><span class="badge badge-medium">med</span> \${t.medium}</span>
            <span><span class="badge badge-low">low</span> \${t.low}</span>
          </div>
          \${threatBar}
        </div>
      </div>
      \` : ''}

      <div class="card">
        <div class="card-header">
          <h2>Recent Activity</h2>
        </div>
        \${recent.length > 0 ? \`
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Competitor</th><th>Threat</th></tr></thead>
          <tbody>\${recentRows}</tbody>
        </table>
        \` : '<div class="empty"><div class="icon">&#9673;</div><h3>No content yet</h3><p>Run <code>rival</code> and generate a digest to populate data.</p></div>'}
      </div>
    \`;
  }

  function renderCompetitors() {
    if (state.competitors.length === 0) {
      return '<div class="empty"><div class="icon">&#9673;</div><h3>No competitors</h3><p>Add competitors using <code>rival</code> in your terminal.</p></div>';
    }

    const cards = state.competitors.map(c => {
      const badge = c.enabled ? '<span class="badge badge-enabled">enabled</span>' : '<span class="badge badge-disabled">disabled</span>';
      const contentCount = state.content.filter(x => x.competitor === c.name).length;
      const feedList = c.feedUrls.map(u => '<div>' + esc(u) + '</div>').join('');
      return \`
        <div class="comp-card">
          <div class="name">\${esc(c.name)} \${badge}</div>
          <div class="meta">\${esc(c.websiteUrl || 'No URL')} &middot; \${contentCount} articles</div>
          <div class="feeds">\${c.feedUrls.length} feed\${c.feedUrls.length !== 1 ? 's' : ''}</div>
        </div>
      \`;
    }).join('');

    return '<div class="comp-grid">' + cards + '</div>';
  }

  function renderFeed() {
    if (state.content.length === 0) {
      return '<div class="empty"><div class="icon">&#9673;</div><h3>No content</h3><p>Run the ingest pipeline to fetch competitor content.</p></div>';
    }

    const rows = state.content.map(c => {
      const analysis = state.analyses.find(a => a.contentId === c.id);
      const threat = analysis ? '<span class="badge badge-' + analysis.threatLevel + '">' + analysis.threatLevel + '</span>' : '<span class="badge badge-disabled">pending</span>';
      const date = new Date(c.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const summary = analysis ? esc(trunc(analysis.summary, 80)) : '<span style="color:var(--text-muted)">Not analyzed</span>';
      return '<tr><td style="white-space:nowrap">' + date + '</td><td><a href="' + esc(c.url) + '" target="_blank">' + esc(trunc(c.title, 50)) + '</a><br><span style="font-size:12px;color:var(--text-dim)">' + summary + '</span></td><td>' + esc(c.competitor) + '</td><td>' + esc(c.contentType.replace('_', ' ')) + '</td><td>' + threat + '</td></tr>';
    }).join('');

    return \`
      <div class="card">
        <div class="card-header"><h2>Content Feed</h2><span style="font-size:13px;color:var(--text-dim)">\${state.content.length} articles</span></div>
        <table>
          <thead><tr><th>Date</th><th>Article</th><th>Competitor</th><th>Type</th><th>Threat</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
    \`;
  }

  function renderDigests() {
    if (state.digests.length === 0) {
      return '<div class="empty"><div class="icon">&#9673;</div><h3>No digests</h3><p>Generate a digest from the terminal to see it here.</p></div>';
    }

    const items = state.digests.map((d, i) => {
      const active = state.selectedDigest === d.filename ? ' active' : '';
      return '<li class="digest-item' + active + '" data-file="' + esc(d.filename) + '">' + esc(d.label) + '<span style="color:var(--text-muted);font-size:12px">&rarr;</span></li>';
    }).join('');

    const viewer = state.selectedDigest
      ? '<div class="digest-content" id="digest-viewer"><div class="loading">Loading digest...</div></div>'
      : '<div class="empty" style="padding:40px"><h3>Select a digest</h3><p>Choose a report from the list to view it.</p></div>';

    return '<div class="two-col"><div class="card"><ul class="digest-list">' + items + '</ul></div><div class="card">' + viewer + '</div></div>';
  }

  function attachEvents() {
    document.querySelectorAll('.digest-item').forEach(el => {
      el.addEventListener('click', async () => {
        state.selectedDigest = el.dataset.file;
        render();
        const res = await fetch('/api/digests/' + encodeURIComponent(el.dataset.file));
        const text = await res.text();
        const viewer = document.getElementById('digest-viewer');
        if (viewer) {
          viewer.innerHTML = formatMarkdown(text);
        }
      });
    });
  }

  function formatMarkdown(md) {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">')
      .replace(/^- (.+)$/gm, '&bull; $1')
      .replace(/\\[(.+?)\\]\\((.+?)\\)/g, '<a href="$2" target="_blank" style="color:var(--cyan)">$1</a>')
      .replace(/\\n\\n/g, '<br><br>');
  }

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function trunc(s, n) { return s && s.length > n ? s.substring(0, n) + '...' : s || ''; }

  // Boot
  loadAll();
  // Auto-refresh every 30s
  setInterval(loadAll, 30000);
})();
</script>
</body>
</html>`;
}
