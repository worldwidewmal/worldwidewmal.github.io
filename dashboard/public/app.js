// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  currentTab: 'overview',
  pipeline: null,
  agents: [],
  connections: null,
  reports: [],
  actionTypes: [],
  pendingTrigger: null,
  refreshInterval: null,
};

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e) {
    console.error(`API error ${path}:`, e.message);
    return null;
  }
}

// ─── Routing ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  loadTab(tab);
}

function loadTab(tab) {
  if (tab === 'overview')  loadOverview();
  if (tab === 'pipeline')  loadPipeline();
  if (tab === 'followups') loadFollowUps();
  if (tab === 'outreach')  loadOutreach();
  if (tab === 'audit')     loadAudit();
  if (tab === 'errors')    loadErrors();
  if (tab === 'sheets')    loadSheets();
  if (tab === 'settings')  loadSettings();
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
document.getElementById('refresh-btn').addEventListener('click', refreshAll);

async function refreshAll() {
  const btn = document.getElementById('refresh-btn');
  btn.style.opacity = '0.4';
  await loadStatusBar();
  await loadTab(state.currentTab);
  btn.style.opacity = '1';
}

// Auto-refresh every 30s
state.refreshInterval = setInterval(refreshAll, 30000);

// ─── Status Bar ───────────────────────────────────────────────────────────────
async function loadStatusBar() {
  const data = await api('/api/pipeline');
  if (!data) return;
  state.pipeline = data;
  const s = data.stats;
  setText('sb-total',     s.total);
  setText('sb-today',     s.net_new_today);
  setText('sb-ready',     s.by_status.verified || 0);
  setText('sb-fu1',       s.fu1_eligible.length);
  setText('sb-fu2',       s.fu2_eligible.length);
  setText('sb-replied',   (s.by_status.replied || 0) + (s.by_status.booked || 0));
  setText('sb-suppressed',s.suppressed_count);

  // Update tab badges
  setBadge('fu-badge',  s.fu1_eligible.length + s.fu2_eligible.length);
  setBadge('out-badge', s.by_status.verified || 0);

  // Connection dot
  const conn = await api('/api/connections');
  if (conn) {
    state.connections = conn;
    const allOk = Object.values(conn).every(v => v && (v.ok !== false));
    const dot = document.getElementById('conn-dot');
    dot.className = 'status-dot ' + (allOk ? 'ok' : 'warn');
    dot.title = allOk ? 'All connections OK' : 'Some connections need attention';
  }
}

// ─── Overview ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  await Promise.all([loadAgentGrid(), loadConnGrid()]);
}

async function loadAgentGrid() {
  const agents = await api('/api/agents');
  if (!agents) return;
  state.agents = agents;
  const grid = document.getElementById('agent-grid');
  grid.innerHTML = agents.map(a => agentCardHTML(a)).join('');
  grid.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => openAgentDrawer(card.dataset.id));
  });
}

function agentCardHTML(a) {
  const updated = a.last_updated ? timeAgo(a.last_updated) : 'never';
  const blockerHTML = a.blockers?.length
    ? `<div class="card-blocker">⚠ ${a.blockers[0]}</div>` : '';
  return `
  <div class="agent-card ${a.status}" data-id="${a.agent_id}">
    <div class="card-top">
      <div>
        <div class="card-name">${a.display_name || a.display}</div>
        <div class="card-desc">${a.description || a.desc || ''}</div>
      </div>
      <span class="status-badge status-${a.status}">${a.status}</span>
    </div>
    <div class="card-row">
      <span class="card-label">Current</span>
      <span class="card-val ${!a.current_task ? 'empty' : ''}">${a.current_task || 'idle'}</span>
    </div>
    <div class="card-row">
      <span class="card-label">Last done</span>
      <span class="card-val ${!lastTask(a.completed_tasks) ? 'empty' : ''}">${lastTask(a.completed_tasks) || '—'}</span>
    </div>
    <div class="card-row">
      <span class="card-label">Next up</span>
      <span class="card-val ${!nextTask(a.pending_tasks) ? 'empty' : ''}">${nextTask(a.pending_tasks) || '—'}</span>
    </div>
    <hr class="card-divider"/>
    <div class="card-stats">
      <div class="card-stat">
        <span class="card-stat-n green">${a.tasks_completed_today || 0}</span>
        <span class="card-stat-l">Done today</span>
      </div>
      <div class="card-stat">
        <span class="card-stat-n">${a.tasks_pending || a.pending_tasks?.length || 0}</span>
        <span class="card-stat-l">Pending</span>
      </div>
      <div class="card-stat">
        <span class="card-stat-n ${a.failed_tasks?.length ? 'red' : ''}">${a.failed_tasks?.length || 0}</span>
        <span class="card-stat-l">Failed</span>
      </div>
      <div class="card-stat">
        <span class="card-stat-n ${a.blockers?.length ? 'yellow' : ''}">${a.blockers?.length || 0}</span>
        <span class="card-stat-l">Blockers</span>
      </div>
    </div>
    <div class="card-footer">
      <span class="card-updated">Updated ${updated}</span>
      <button class="btn-trigger" onclick="event.stopPropagation(); openAgentDrawer('${a.agent_id}')">Details →</button>
    </div>
    ${blockerHTML}
  </div>`;
}

async function loadConnGrid() {
  const conn = await api('/api/connections');
  if (!conn) return;
  state.connections = conn;
  const labels = {
    pipeline_csv: 'pipeline.csv',
    suppression_csv: 'suppression-list.csv',
    reports_dir: 'reports/ directory',
    routines_dir: 'routines/ directory',
    claude_md: 'CLAUDE.md',
    agents_dir: 'Agents configured',
    data_dir: 'data/ directory',
    session_log: 'Session log',
    gmail_mcp: 'Gmail MCP',
    web_search: 'Web Search',
    audit_logs_today: 'Audit log today',
  };
  const grid = document.getElementById('conn-grid');
  grid.innerHTML = Object.entries(conn).map(([key, val]) => {
    if (typeof val === 'object') {
      const icon = val.ok ? '✓' : (key === 'gmail_mcp' || key === 'web_search' ? '○' : '✗');
      const cls  = val.ok ? 'conn-ok' : (key === 'gmail_mcp' || key === 'web_search' ? 'conn-warn' : 'conn-err');
      return `<div class="conn-card">
        <span class="conn-icon ${cls}">${icon}</span>
        <div>
          <div class="conn-label">${labels[key] || key}</div>
          ${val.note ? `<div class="conn-note">${val.note}</div>` : ''}
        </div>
      </div>`;
    }
    return '';
  }).filter(Boolean).join('');
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────
async function loadPipeline() {
  if (!state.pipeline) await loadStatusBar();
  const data = state.pipeline;
  if (!data) return;

  // Status chips
  const statusColors = {
    verified:'#4caf82', sent:'#5b9cf6', 'fu1-sent':'#f0b429', 'fu2-sent':'#f0b429',
    replied:'#9b8afb', booked:'#9b8afb', closed:'#4caf82', rejected:'#e05252',
    suppressed:'#4a4850', new:'#7a7580', 'no-email':'#e05252', drafted:'#5b9cf6',
  };
  const grid = document.getElementById('status-grid');
  grid.innerHTML = Object.entries(data.stats.by_status)
    .map(([s, n]) => `<div class="status-chip">
      <span class="chip-n" style="color:${statusColors[s]||'#eae5dc'}">${n}</span>
      <span class="chip-l">${s}</span>
    </div>`).join('');

  // Populate vertical filter
  const vf = document.getElementById('vertical-filter');
  const verticals = Object.keys(data.stats.by_vertical);
  if (vf.options.length <= 1) {
    verticals.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      vf.appendChild(o);
    });
  }

  renderLeadTable(data.leads);

  // Filters
  document.getElementById('status-filter').onchange = () => renderLeadTable(data.leads);
  document.getElementById('vertical-filter').onchange = () => renderLeadTable(data.leads);

  // Contact layers
  const layers = data.stats.companies_with_multiple_layers;
  const lg = document.getElementById('layers-grid');
  if (!layers.length) { lg.innerHTML = '<div class="dim">No companies with multiple verified contact layers yet.</div>'; }
  else {
    lg.innerHTML = layers.map(({company, layers: ls}) => `
      <div class="layers-card">
        <div class="layers-company">${company}</div>
        ${ls.map(l => `<div class="layers-row">
          <span class="layers-role">${l.role || '—'}</span>
          <span class="layers-email">${l.email || 'no email'}</span>
          <span class="status-pill">${l.status}</span>
        </div>`).join('')}
      </div>`).join('');
  }
}

function renderLeadTable(allLeads) {
  const sf = document.getElementById('status-filter').value;
  const vf = document.getElementById('vertical-filter').value;
  const leads = allLeads.filter(l =>
    (!sf || l.status === sf) && (!vf || l.vertical === vf)
  );
  document.getElementById('lead-count').textContent = `${leads.length} leads`;
  const tbody = document.getElementById('lead-tbody');
  if (!leads.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">No leads match filter.</td></tr>'; return; }
  tbody.innerHTML = leads.map(l => `<tr>
    <td><strong>${l.company || '—'}</strong><br><small class="dim">${l.website || ''}</small></td>
    <td>${l.vertical || '—'}</td>
    <td>${l.contact_name || '—'}<br><small class="dim">${l.contact_role || ''}</small></td>
    <td><span class="dim" style="font-family:var(--mono);font-size:11px">${l.contact_email || (l.fallback_route ? '↳ ' + l.fallback_route : '—')}</span></td>
    <td><span class="status-pill" style="background:${statusBg(l.status)};color:${statusFg(l.status)}">${l.status}</span></td>
    <td class="dim">${l.date_added || '—'}</td>
    <td class="dim">${l.notes ? l.notes.slice(0,60) + (l.notes.length > 60 ? '…' : '') : ''}</td>
  </tr>`).join('');
}

// ─── Follow-Ups ───────────────────────────────────────────────────────────────
async function loadFollowUps() {
  if (!state.pipeline) await loadStatusBar();
  const s = state.pipeline?.stats;
  if (!s) return;

  setText('fu1-count', s.fu1_eligible.length);
  setText('fu2-count', s.fu2_eligible.length);

  renderLeadCards('fu1-list', s.fu1_eligible, 'fu1');
  renderLeadCards('fu2-list', s.fu2_eligible, 'fu2');
  renderLeadCards('fu-pending-list', [...s.fu1_not_due, ...s.fu2_not_due], 'pending');
  renderLeadCards('fu-done-list', s.sequence_complete, 'done');
}

function renderLeadCards(id, leads, mode) {
  const el = document.getElementById(id);
  if (!leads.length) { el.innerHTML = `<div class="dim" style="padding:8px 0">None.</div>`; return; }
  el.innerHTML = leads.map(l => {
    const hoursLabel = mode === 'pending'
      ? `<span class="hours-badge">${l.hours_until}h until due</span>`
      : mode === 'done' ? ''
      : `<span class="hours-badge ${l.hours_since > 72 ? 'overdue' : ''}">${l.hours_since}h since sent</span>`;
    return `<div class="lead-card">
      <div class="lead-card-info">
        <div class="lead-company">${l.company}</div>
        <div class="lead-meta">${l.vertical || '—'} · ${l.contact_role || '—'}</div>
        <div class="lead-email">${l.contact_email || l.fallback_route || '—'}</div>
      </div>
      <div class="lead-card-right">
        <span class="status-pill" style="background:${statusBg(l.status)};color:${statusFg(l.status)}">${l.status}</span>
        ${hoursLabel}
      </div>
    </div>`;
  }).join('');
}

// ─── Outreach ─────────────────────────────────────────────────────────────────
async function loadOutreach() {
  if (!state.pipeline) await loadStatusBar();
  const s = state.pipeline?.stats;
  const leads = state.pipeline?.leads;
  if (!s || !leads) return;

  setText('outreach-ready-count', s.outreach_ready.length);
  renderLeadCards('outreach-ready-list', s.outreach_ready, 'ready');

  const drafted = leads.filter(l => l.status === 'drafted');
  renderLeadCards('outreach-drafted-list', drafted, 'drafted');
}

// ─── Audit ────────────────────────────────────────────────────────────────────
async function loadAudit() {
  const [reports, log] = await Promise.all([api('/api/reports'), api('/api/session-log')]);
  state.reports = reports || [];

  const list = document.getElementById('audit-list');
  if (!reports?.length) { list.innerHTML = '<div class="dim" style="padding:12px">No audit logs yet. Run /end-of-day to generate one.</div>'; }
  else {
    list.innerHTML = reports.map(r => `<div class="audit-item" data-file="${r.filename}">${r.date}</div>`).join('');
    list.querySelectorAll('.audit-item').forEach(item => {
      item.addEventListener('click', () => loadReport(item.dataset.file, item));
    });
    // Auto-load the most recent
    if (reports[0]) loadReport(reports[0].filename, list.querySelector('.audit-item'));
  }

  const logEl = document.getElementById('session-log');
  if (log?.lines?.length) logEl.innerHTML = log.lines.map(l => `<div>${l}</div>`).join('');
  else logEl.textContent = 'No session log entries yet.';
}

async function loadReport(filename, itemEl) {
  document.querySelectorAll('.audit-item').forEach(el => el.classList.remove('active'));
  if (itemEl) itemEl.classList.add('active');
  const data = await api(`/api/reports/${filename}`);
  const viewer = document.getElementById('audit-viewer');
  if (data?.content) viewer.innerHTML = `<pre class="audit-content">${escapeHTML(data.content)}</pre>`;
  else viewer.innerHTML = '<div class="audit-placeholder">Could not load report.</div>';
}

// ─── Errors ───────────────────────────────────────────────────────────────────
async function loadErrors() {
  const [agents, actions] = await Promise.all([api('/api/agents'), api('/api/actions')]);

  const errEl = document.getElementById('error-agents');
  const withIssues = (agents || []).filter(a => a.blockers?.length || a.warnings?.length || a.failed_tasks?.length);
  if (!withIssues.length) {
    errEl.innerHTML = '<div class="dim">No blockers or warnings. All agents look clean.</div>';
  } else {
    errEl.innerHTML = withIssues.map(a => {
      const items = [
        ...(a.blockers || []).map(b => `<div class="error-msg">🔴 ${b}</div>`),
        ...(a.warnings || []).map(w => `<div class="error-msg">⚠ ${w}</div>`),
        ...(a.failed_tasks || []).map(t => `<div class="error-msg">✗ Failed: ${typeof t === 'string' ? t : t.task || JSON.stringify(t)}</div>`),
      ].join('');
      const cls = a.blockers?.length ? 'error-card' : 'warn-card';
      const agentCls = a.blockers?.length ? 'error-agent' : 'warn-agent';
      return `<div class="${cls}"><div class="${agentCls}">${a.display_name || a.display}</div>${items}</div>`;
    }).join('');
  }

  const actEl = document.getElementById('manual-actions-list');
  if (!actions?.length) {
    actEl.innerHTML = '<div class="dim">No pending manual trigger requests.</div>';
  } else {
    actEl.innerHTML = actions.map(a => `
      <div class="action-card">
        <div>
          <div class="action-label">${a.label || a.action}</div>
          <div class="action-meta">${a.timestamp ? new Date(a.timestamp).toLocaleString() : ''} · Safe mode: ON</div>
          ${a.notes ? `<div class="action-meta">${a.notes}</div>` : ''}
        </div>
        <span class="action-status ${a.status}">${a.status}</span>
      </div>`).join('');
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  await loadConnGrid();
  // Mirror conn-grid to settings page
  const sg = document.getElementById('settings-conn-grid');
  sg.innerHTML = document.getElementById('conn-grid').innerHTML;

  const rules = await api('/api/rules');
  const rl = document.getElementById('rules-list');
  if (rules) {
    rl.className = 'rules-list';
    rl.innerHTML = rules.map(r => `
      <div class="rule-row">
        <span class="rule-num">${r.id}</span>
        <span class="rule-cat">${r.category}</span>
        <span class="rule-text">${r.rule}</span>
      </div>`).join('');
  }

  const actionTypes = await api('/api/actions/types');
  state.actionTypes = actionTypes || [];
  const tg = document.getElementById('trigger-grid');
  tg.innerHTML = (actionTypes || []).map(a => `
    <div class="trigger-card">
      <div class="trigger-label">${a.label}</div>
      <div class="trigger-desc">${a.desc}</div>
      <div class="trigger-agent">Agent: ${a.agent}</div>
      <button class="btn-trigger" onclick="triggerAction('${a.id}')">Log Trigger →</button>
    </div>`).join('');
}

// ─── Agent Drawer ─────────────────────────────────────────────────────────────
async function openAgentDrawer(id) {
  const agent = await api(`/api/agents/${id}`);
  if (!agent) return;

  document.getElementById('drawer-title').textContent = agent.display_name || agent.display;
  document.getElementById('drawer-desc').textContent  = agent.description || agent.desc || '';

  const body = document.getElementById('drawer-body');
  const actionTypes = state.actionTypes.filter(a => a.agent === id);

  body.innerHTML = `
    <div class="drawer-section">
      <div class="drawer-section-title">Status</div>
      <div class="drawer-kv"><span class="drawer-k">Status</span><span class="drawer-v"><span class="status-badge status-${agent.status}">${agent.status}</span></span></div>
      <div class="drawer-kv"><span class="drawer-k">Current task</span><span class="drawer-v">${agent.current_task || '<span class="dim">idle</span>'}</span></div>
      <div class="drawer-kv"><span class="drawer-k">Last updated</span><span class="drawer-v">${agent.last_updated ? timeAgo(agent.last_updated) : '<span class="dim">never</span>'}</span></div>
      <div class="drawer-kv"><span class="drawer-k">Enabled</span><span class="drawer-v">${agent.enabled !== false ? '✓ Yes' : '✗ Disabled'}</span></div>
    </div>

    ${agent.blockers?.length ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Blockers</div>
      ${agent.blockers.map(b => `<div class="card-blocker">⚠ ${b}</div>`).join('')}
    </div>` : ''}

    ${agent.warnings?.length ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Warnings</div>
      ${agent.warnings.map(w => `<div class="fu-rule">⚠ ${w}</div>`).join('')}
    </div>` : ''}

    <div class="drawer-section">
      <div class="drawer-section-title">Pending Tasks (${agent.pending_tasks?.length || 0})</div>
      ${(agent.pending_tasks?.length
        ? agent.pending_tasks.map(t => `<div class="task-item">${typeof t === 'string' ? t : t.task || JSON.stringify(t)}</div>`)
        : ['<div class="dim">No pending tasks.</div>']
      ).join('')}
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Completed Tasks Today (${agent.tasks_completed_today || 0})</div>
      ${(agent.completed_tasks?.slice(0,10).length
        ? agent.completed_tasks.slice(0,10).map(t => `<div class="task-item completed">✓ ${typeof t === 'string' ? t : t.task || JSON.stringify(t)}</div>`)
        : ['<div class="dim">None yet today.</div>']
      ).join('')}
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Failed Tasks (${agent.failed_tasks?.length || 0})</div>
      ${(agent.failed_tasks?.length
        ? agent.failed_tasks.map(t => `<div class="task-item failed">✗ ${typeof t === 'string' ? t : t.task || JSON.stringify(t)}</div>`)
        : ['<div class="dim">None.</div>']
      ).join('')}
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">Last Run Summary</div>
      <div class="${agent.last_run_summary ? '' : 'dim'}">${agent.last_run_summary || 'No summary yet.'}</div>
    </div>

    ${agent.leads_touched?.length ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Leads Touched (${agent.leads_touched.length})</div>
      ${agent.leads_touched.slice(0,8).map(l => `<div class="dim" style="font-size:12px;padding:3px 0">${l}</div>`).join('')}
    </div>` : ''}

    ${actionTypes.length ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Trigger This Agent</div>
      <div class="fu-rule" style="margin-bottom:10px">🔒 Safe mode: clicking logs a request only. No outreach is sent. Open Claude Code to execute.</div>
      <div class="drawer-actions">
        ${actionTypes.map(a => `<button class="btn-trigger" onclick="triggerAction('${a.id}')">${a.label}</button>`).join('')}
      </div>
    </div>` : ''}
  `;

  document.getElementById('agent-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
}

document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
function closeDrawer() {
  document.getElementById('agent-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
}

// ─── Trigger Modal ────────────────────────────────────────────────────────────
function triggerAction(actionId) {
  const def = state.actionTypes.find(a => a.id === actionId)
    || { id: actionId, label: actionId, desc: '' };
  state.pendingTrigger = def;
  document.getElementById('modal-title').textContent = def.label;
  document.getElementById('modal-desc').textContent  = def.desc;
  document.getElementById('modal-notes').value = '';
  document.getElementById('modal-overlay').classList.add('open');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.pendingTrigger = null;
}

document.getElementById('modal-confirm').addEventListener('click', async () => {
  if (!state.pendingTrigger) return;
  const notes = document.getElementById('modal-notes').value.trim();
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Logging…'; btn.disabled = true;

  const result = await api('/api/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: state.pendingTrigger.id, notes }),
  });

  btn.textContent = 'Log Trigger Request'; btn.disabled = false;
  closeModal();
  if (result?.success) showToast(`✓ Trigger logged: ${state.pendingTrigger.label}`);
  else showToast('✗ Failed to log trigger', 'error');
});

// Full session trigger from overview — logs a daily-run request, does not auto-execute
document.getElementById('trigger-all-btn').addEventListener('click', async () => {
  await loadActionTypes();
  showToast('To run the full daily session, type /daily-run in Claude Code.', 'info');
});

async function loadActionTypes() {
  if (state.actionTypes.length) return;
  state.actionTypes = await api('/api/actions/types') || [];
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--gold)' };
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:999;
    background:${colors[type] || colors.success};
    color:#fff;font-size:13px;font-weight:500;padding:10px 16px;
    border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.4);max-width:360px;
    animation:slideIn .2s ease`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n > 0 ? n : '';
  el.style.display = n > 0 ? 'inline-flex' : 'none';
}

function lastTask(tasks) {
  if (!tasks?.length) return null;
  const t = tasks[tasks.length - 1];
  return typeof t === 'string' ? t.slice(0, 50) : (t.task || '').slice(0, 50);
}

function nextTask(tasks) {
  if (!tasks?.length) return null;
  const t = tasks[0];
  return typeof t === 'string' ? t.slice(0, 50) : (t.task || '').slice(0, 50);
}

function timeAgo(isoStr) {
  const ms = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHTML(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const STATUS_COLORS = {
  new:        ['rgba(122,117,128,.15)', '#7a7580'],
  'no-email': ['rgba(224,82,82,.1)',    '#e05252'],
  verified:   ['rgba(76,175,130,.1)',   '#4caf82'],
  drafted:    ['rgba(91,156,246,.1)',   '#5b9cf6'],
  sent:       ['rgba(91,156,246,.12)',  '#5b9cf6'],
  'fu1-sent': ['rgba(240,180,41,.1)',   '#f0b429'],
  'fu2-sent': ['rgba(240,180,41,.1)',   '#f0b429'],
  replied:    ['rgba(155,138,251,.1)',  '#9b8afb'],
  booked:     ['rgba(155,138,251,.15)','#9b8afb'],
  closed:     ['rgba(76,175,130,.15)', '#4caf82'],
  rejected:   ['rgba(224,82,82,.1)',   '#e05252'],
  suppressed: ['rgba(74,72,80,.2)',     '#4a4850'],
};
function statusBg(s) { return (STATUS_COLORS[s] || ['var(--s3)', 'var(--sub)'])[0]; }
function statusFg(s) { return (STATUS_COLORS[s] || ['var(--s3)', 'var(--sub)'])[1]; }

// ─── Sheets Tab ───────────────────────────────────────────────────────────────
let activeSheetTab = 'forms';

document.querySelectorAll('.sheets-subtab').forEach(btn => {
  btn.addEventListener('click', () => switchSheetsTab(btn.dataset.sheetsTab));
});

function switchSheetsTab(tab) {
  activeSheetTab = tab;
  document.querySelectorAll('.sheets-subtab').forEach(b => b.classList.toggle('active', b.dataset.sheetsTab === tab));
  document.querySelectorAll('.sheets-pane').forEach(p => p.classList.toggle('active', p.id === `sheets-pane-${tab}`));
  if (tab === 'forms')    loadSheetsForms();
  if (tab === 'tourism')  loadSheetsTourism();
  if (tab === 'outreach') loadSheetsOutreach();
}

async function loadSheets() {
  if (activeSheetTab === 'forms')    await loadSheetsForms();
  if (activeSheetTab === 'tourism')  await loadSheetsTourism();
  if (activeSheetTab === 'outreach') await loadSheetsOutreach();
}

async function loadSheetsForms() {
  const rows = await api('/api/sheets/forms');
  const tbody = document.getElementById('forms-tbody');
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No application forms tracked yet. Run /find-forms to add forms.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td class="dim">${i + 1}</td>
    <td><strong>${r.company}</strong></td>
    <td>${r.vertical || '—'}</td>
    <td class="dim">${r.date_added || '—'}</td>
    <td><a class="form-url" href="${r.form_url}" target="_blank" title="${r.form_url}">${truncUrl(r.form_url)}</a></td>
    <td class="dim">${r.requires_video ? '<span class="badge red">Yes</span>' : '<span class="badge green">No</span>'}</td>
    <td class="sheet-check-cell">
      <label class="check-wrap">
        <input type="checkbox" class="sheet-check" data-tab="forms" data-key="${escapeHTML(r.form_url)}" data-field="submitted" ${r.submitted ? 'checked' : ''}/>
        <span class="check-label ${r.submitted ? 'checked' : ''}">${r.submitted ? 'Done' : 'Pending'}</span>
      </label>
    </td>
  </tr>`).join('');
  tbody.querySelectorAll('.sheet-check').forEach(cb => {
    cb.addEventListener('change', handleSheetToggle);
  });
}

async function loadSheetsTourism() {
  const rows = await api('/api/sheets/tourism-boards');
  const tbody = document.getElementById('tourism-tbody');
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No tourism boards tracked yet. Run /find-tourism-boards to add programs.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td class="dim">${i + 1}</td>
    <td><strong>${r.org}</strong>${r.follower_minimum ? `<br><span class="dim" style="font-size:11px">Min: ${r.follower_minimum.toLocaleString()} followers</span>` : ''}</td>
    <td><span class="badge">${r.type || 'DMO'}</span></td>
    <td class="dim">${r.geography || '—'}</td>
    <td class="dim">${r.date_added || '—'}</td>
    <td><a class="form-url" href="${r.form_url}" target="_blank" title="${r.form_url}">${truncUrl(r.form_url)}</a></td>
    <td class="dim">${r.requires_video ? '<span class="badge red">Yes</span>' : '<span class="badge green">No</span>'}</td>
    <td class="sheet-check-cell">
      <label class="check-wrap">
        <input type="checkbox" class="sheet-check" data-tab="tourism" data-key="${escapeHTML(r.form_url)}" data-field="submitted" ${r.submitted ? 'checked' : ''}/>
        <span class="check-label ${r.submitted ? 'checked' : ''}">${r.submitted ? 'Done' : 'Pending'}</span>
      </label>
    </td>
  </tr>`).join('');
  tbody.querySelectorAll('.sheet-check').forEach(cb => {
    cb.addEventListener('change', handleSheetToggle);
  });
}

async function loadSheetsOutreach() {
  const rows = await api('/api/sheets/outreach');
  const tbody = document.getElementById('outreach-sheet-tbody');
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading">No outreach with confirmed emails yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td class="dim">${i + 1}</td>
    <td><strong>${r.company}</strong><br><span class="dim" style="font-size:11px">${r.status}</span></td>
    <td>${r.vertical || '—'}</td>
    <td style="font-family:var(--mono);font-size:11px">${r.contact_email || '—'}</td>
    <td class="dim">${r.date_added || '—'}</td>
    <td class="sheet-check-cell">
      <label class="check-wrap">
        <input type="checkbox" class="sheet-check" data-tab="outreach" data-key="${r.id}" data-field="initial_sent" ${r.initial_sent ? 'checked' : ''}/>
        <span class="check-label ${r.initial_sent ? 'checked' : ''}"></span>
      </label>
    </td>
    <td class="sheet-check-cell">
      <label class="check-wrap">
        <input type="checkbox" class="sheet-check" data-tab="outreach" data-key="${r.id}" data-field="fu1_sent" ${r.fu1_sent ? 'checked' : ''}/>
        <span class="check-label ${r.fu1_sent ? 'checked' : ''}"></span>
      </label>
    </td>
    <td class="sheet-check-cell">
      <label class="check-wrap">
        <input type="checkbox" class="sheet-check" data-tab="outreach" data-key="${r.id}" data-field="fu2_sent" ${r.fu2_sent ? 'checked' : ''}/>
        <span class="check-label ${r.fu2_sent ? 'checked' : ''}"></span>
      </label>
    </td>
    <td class="sheet-check-cell">
      ${r.has_draft
        ? `<button class="btn-trigger" onclick="viewDraft('${r.id}','${escapeHTML(r.company)}','${escapeHTML(r.contact_email || '')}')">View</button>`
        : '<span class="dim">—</span>'}
    </td>
  </tr>`).join('');
  tbody.querySelectorAll('.sheet-check').forEach(cb => {
    cb.addEventListener('change', handleSheetToggle);
  });
}

async function handleSheetToggle(e) {
  const cb = e.target;
  const { tab, key, field } = cb.dataset;
  const value = cb.checked;
  const label = cb.nextElementSibling;
  if (label) {
    label.textContent = (tab === 'forms' || tab === 'tourism') ? (value ? 'Done' : 'Pending') : '';
    label.className = 'check-label' + (value ? ' checked' : '');
  }
  const result = await api('/api/sheets/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab, key, field, value }),
  });
  if (!result?.ok) {
    showToast('Failed to save checkbox state', 'error');
    cb.checked = !value;
  }
}

async function viewDraft(id, company, email) {
  const data = await api(`/api/drafts/${id}`);
  document.getElementById('draft-modal-company').textContent = company;
  document.getElementById('draft-modal-email').textContent = email;
  document.getElementById('draft-subject').textContent = data?.subject || '(no subject)';
  document.getElementById('draft-body').textContent = data?.body || '(no body)';
  document.getElementById('draft-modal-overlay').classList.add('open');
}

document.getElementById('draft-modal-close').addEventListener('click',  () => document.getElementById('draft-modal-overlay').classList.remove('open'));
document.getElementById('draft-modal-cancel').addEventListener('click', () => document.getElementById('draft-modal-overlay').classList.remove('open'));
document.getElementById('draft-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('draft-modal-overlay').classList.remove('open'); });

function truncUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.length > 28 ? u.pathname.slice(0, 28) + '…' : u.pathname;
    return u.hostname + p;
  } catch { return url.slice(0, 40) + (url.length > 40 ? '…' : ''); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  await loadActionTypes();
  await loadStatusBar();
  await loadOverview();
})();
