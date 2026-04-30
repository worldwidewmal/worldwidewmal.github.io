const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Path resolution — server.js lives in dashboard/, repo root is one level up
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AGENT_STATE_DIR = path.join(DATA_DIR, 'agent_state');
const TASK_QUEUE_DIR = path.join(DATA_DIR, 'task_queue');
const RUN_HISTORY_DIR = path.join(DATA_DIR, 'run_history');
const MANUAL_ACTIONS_DIR = path.join(DATA_DIR, 'manual_actions');
const PIPELINE_CSV = path.join(ROOT, 'pipeline.csv');
const SUPPRESSION_CSV = path.join(ROOT, 'suppression-list.csv');
const REPORTS_DIR = path.join(ROOT, 'reports');
const FORMS_TRACKER = path.join(DATA_DIR, 'forms-tracker.json');
const TOURISM_TRACKER = path.join(DATA_DIR, 'tourism-boards-tracker.json');
const SHEETS_STATE = path.join(DATA_DIR, 'sheets-state.json');
const DRAFTS_DIR = path.join(DATA_DIR, 'drafts');
const ROUTINES_DIR = path.join(ROOT, 'routines');
const CLAUDE_AGENTS_DIR = path.join(ROOT, '.claude', 'agents');

const AGENT_IDS = [
  'lead-conductor',
  'lead-researcher',
  'outreach-writer',
  'follow-up-manager',
  'qa-crm-operator',
  'proof-portfolio-manager',
  'expansion-retainer-manager',
  'daily-audit-reporter',
];

const AGENT_META = {
  'lead-conductor':           { display: 'Lead Conductor',            icon: '🎯', desc: 'Orchestrates the full daily session' },
  'lead-researcher':          { display: 'Lead Researcher',           icon: '🔍', desc: 'Sources and verifies net-new Orlando leads' },
  'outreach-writer':          { display: 'Outreach Writer',           icon: '✍️',  desc: 'Drafts initial outreach emails for verified leads' },
  'follow-up-manager':        { display: 'Follow-Up Manager',         icon: '📬', desc: 'Manages FU1/FU2 sequencing and timing' },
  'qa-crm-operator':          { display: 'QA / CRM Operator',         icon: '🔒', desc: 'Validates pipeline integrity and prevents duplicates' },
  'proof-portfolio-manager':  { display: 'Proof & Portfolio',         icon: '📁', desc: 'Tracks portfolio assets, proof links, usage rights' },
  'expansion-retainer-manager': { display: 'Expansion & Retainer',   icon: '💼', desc: 'Manages warm leads from reply to close' },
  'daily-audit-reporter':     { display: 'Daily Audit Reporter',      icon: '📊', desc: 'Generates daily audit logs and end-of-day summaries' },
};

const VALID_ACTIONS = [
  { id: 'lead-hunt',        label: 'Fresh Orlando Lead Hunt',       agent: 'lead-researcher',          desc: 'Search for 5–10 new Orlando businesses matching UGC criteria' },
  { id: 'lead-scoring',     label: 'Lead QA / Scoring',             agent: 'qa-crm-operator',          desc: 'Run duplicate checks and validate all pipeline data' },
  { id: 'outreach-draft',   label: 'Initial Outreach Draft',        agent: 'outreach-writer',          desc: 'Draft initial emails for all verified leads with no prior contact' },
  { id: 'followup-queue',   label: 'Follow-Up Queue Generation',    agent: 'follow-up-manager',        desc: 'Check and draft FU1/FU2 for eligible leads (48–72h window)' },
  { id: 'qa-review',        label: 'Pipeline QA Review',            agent: 'qa-crm-operator',          desc: 'Full pipeline integrity check — status fields, dates, suppression' },
  { id: 'daily-audit',      label: 'Daily Audit Generation',        agent: 'daily-audit-reporter',     desc: "Generate today's audit log and write to reports/" },
  { id: 'eod-checklist',    label: '8 PM End-of-Day Checklist',     agent: 'daily-audit-reporter',     desc: 'Generate the 8 PM send checklist and end-of-day summary' },
  { id: 'portfolio-refresh',label: 'Portfolio / Proof Refresh',     agent: 'proof-portfolio-manager',  desc: 'Verify portfolio URL is live and assets match current verticals' },
  { id: 'retainer-review',  label: 'Retainer Expansion Review',     agent: 'expansion-retainer-manager', desc: 'Review all replied/booked leads and recommend next actions' },
  { id: 'daily-run',        label: 'Full Daily Session',            agent: 'lead-conductor',             desc: 'Run the complete daily pipeline: research → outreach → follow-ups → audit. Use /daily-run in Claude Code.' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeRead(file, fallback = null) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch { return fallback; }
}

function safeJSON(file, fallback = null) {
  const raw = safeRead(file);
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(filePath) {
  const raw = safeRead(filePath, '');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    return headers.reduce((obj, h, i) => { obj[h] = vals[i] || ''; return obj; }, {});
  });
}

function getDefaultAgentState(id) {
  const meta = AGENT_META[id] || { display: id, icon: '🤖', desc: '' };
  return {
    agent_id: id,
    display_name: meta.display,
    description: meta.desc,
    status: 'idle',
    current_task: null,
    pending_tasks: [],
    completed_tasks: [],
    failed_tasks: [],
    last_updated: null,
    last_run_summary: null,
    blockers: [],
    warnings: [],
    files_touched: [],
    leads_touched: [],
    tasks_completed_today: 0,
    tasks_pending: 0,
    enabled: true,
  };
}

function getAgentState(id) {
  const file = path.join(AGENT_STATE_DIR, `${id}.json`);
  const stored = safeJSON(file);
  return stored ? { ...getDefaultAgentState(id), ...stored } : getDefaultAgentState(id);
}

function pipelineStats(leads) {
  const STATUS_LIST = ['new','no-email','verified','drafted','sent','fu1-sent','fu2-sent','replied','booked','closed','rejected','suppressed'];
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  const stats = {
    total: leads.length,
    by_status: Object.fromEntries(STATUS_LIST.map(s => [s, 0])),
    net_new_today: 0,
    fu1_eligible: [],
    fu2_eligible: [],
    fu1_not_due: [],
    fu2_not_due: [],
    outreach_ready: [],
    sequence_complete: [],
    no_email_count: 0,
    suppressed_count: 0,
    by_vertical: {},
    contact_layers: {},
  };

  for (const lead of leads) {
    const st = lead.status || 'new';
    stats.by_status[st] = (stats.by_status[st] || 0) + 1;

    if (lead.date_added === today) stats.net_new_today++;
    if (st === 'no-email') stats.no_email_count++;
    if (st === 'suppressed') stats.suppressed_count++;
    if (st === 'verified') stats.outreach_ready.push(lead);
    if (st === 'fu2-sent') stats.sequence_complete.push(lead);

    if (lead.vertical) stats.by_vertical[lead.vertical] = (stats.by_vertical[lead.vertical] || 0) + 1;

    // FU eligibility
    if (st === 'sent' && lead.initial_outreach_date) {
      const hrs = (now - new Date(lead.initial_outreach_date)) / 36e5;
      if (hrs >= 48) stats.fu1_eligible.push({ ...lead, hours_since: Math.floor(hrs) });
      else stats.fu1_not_due.push({ ...lead, hours_until: Math.ceil(48 - hrs) });
    }
    if (st === 'fu1-sent' && lead.follow_up_1_date) {
      const hrs = (now - new Date(lead.follow_up_1_date)) / 36e5;
      if (hrs >= 48) stats.fu2_eligible.push({ ...lead, hours_since: Math.floor(hrs) });
      else stats.fu2_not_due.push({ ...lead, hours_until: Math.ceil(48 - hrs) });
    }

    // Contact layers per company
    if (lead.company) {
      if (!stats.contact_layers[lead.company]) stats.contact_layers[lead.company] = [];
      stats.contact_layers[lead.company].push({ role: lead.contact_role, email: lead.contact_email, status: st });
    }
  }

  stats.companies_with_multiple_layers = Object.entries(stats.contact_layers)
    .filter(([, layers]) => layers.length > 1)
    .map(([company, layers]) => ({ company, layers }));

  return stats;
}

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ─────────────────────────────────────────────────────────────

// All agents
app.get('/api/agents', (req, res) => {
  res.json(AGENT_IDS.map(id => ({ ...getAgentState(id), ...AGENT_META[id] })));
});

// Single agent
app.get('/api/agents/:id', (req, res) => {
  if (!AGENT_IDS.includes(req.params.id)) return res.status(404).json({ error: 'Unknown agent' });
  const state = getAgentState(req.params.id);
  const file = path.join(CLAUDE_AGENTS_DIR, `${req.params.id}.md`);
  const spec = safeRead(file, null);
  res.json({ ...state, ...AGENT_META[req.params.id], spec_loaded: !!spec });
});

// Update agent state
app.post('/api/agents/:id/state', (req, res) => {
  if (!AGENT_IDS.includes(req.params.id)) return res.status(404).json({ error: 'Unknown agent' });
  ensureDir(AGENT_STATE_DIR);
  const current = getAgentState(req.params.id);
  const updated = { ...current, ...req.body, agent_id: req.params.id, last_updated: new Date().toISOString() };
  fs.writeFileSync(path.join(AGENT_STATE_DIR, `${req.params.id}.json`), JSON.stringify(updated, null, 2));
  res.json(updated);
});

// Pipeline data
app.get('/api/pipeline', (req, res) => {
  const leads = parseCSV(PIPELINE_CSV);
  const suppressed = parseCSV(SUPPRESSION_CSV);
  const stats = pipelineStats(leads);
  stats.suppressed_list = suppressed;
  res.json({ leads, stats });
});

// Reports list
app.get('/api/reports', (req, res) => {
  try {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith('audit-log-') && f.endsWith('.md'))
      .sort().reverse();
    res.json(files.map(f => ({ filename: f, date: f.replace('audit-log-', '').replace('.md', '') })));
  } catch { res.json([]); }
});

// Single report
app.get('/api/reports/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  const file = path.join(REPORTS_DIR, safe);
  const content = safeRead(file);
  if (!content) return res.status(404).json({ error: 'Not found' });
  res.json({ content, filename: safe });
});

// Session log
app.get('/api/session-log', (req, res) => {
  const file = path.join(REPORTS_DIR, 'session-log.txt');
  const content = safeRead(file, '');
  const lines = content.trim().split('\n').filter(Boolean).reverse().slice(0, 30);
  res.json({ lines });
});

// Connections / environment check
app.get('/api/connections', (req, res) => {
  const sessionLog = path.join(REPORTS_DIR, 'session-log.txt');
  let sessionFreshHours = null;
  if (fs.existsSync(sessionLog)) {
    sessionFreshHours = Math.round((Date.now() - fs.statSync(sessionLog).mtimeMs) / 36e5);
  }

  const recentReports = (() => {
    try {
      return fs.readdirSync(REPORTS_DIR).filter(f => f.startsWith('audit-log-') && f.endsWith('.md'));
    } catch { return []; }
  })();

  const pipeline = parseCSV(PIPELINE_CSV);

  res.json({
    repo_root: ROOT,
    pipeline_csv:       { ok: fs.existsSync(PIPELINE_CSV),          note: `${pipeline.length} leads` },
    suppression_csv:    { ok: fs.existsSync(SUPPRESSION_CSV),        note: '' },
    reports_dir:        { ok: fs.existsSync(REPORTS_DIR),            note: `${recentReports.length} audit logs` },
    routines_dir:       { ok: fs.existsSync(ROUTINES_DIR),           note: '' },
    claude_md:          { ok: fs.existsSync(path.join(ROOT, 'CLAUDE.md')), note: '' },
    agents_dir:         { ok: fs.existsSync(CLAUDE_AGENTS_DIR),      note: `${AGENT_IDS.length} agents` },
    data_dir:           { ok: fs.existsSync(DATA_DIR),               note: '' },
    session_log:        { ok: fs.existsSync(sessionLog),             note: sessionFreshHours !== null ? `${sessionFreshHours}h ago` : 'never' },
    gmail_mcp:          { ok: false,                                  note: 'Manual setup required — see docs/mcp-gmail-setup.md' },
    web_search:         { ok: false,                                  note: 'Test with: "Search for hotels in Orlando"' },
    audit_logs_today:   { ok: recentReports.some(f => f.includes(new Date().toISOString().split('T')[0])), note: '' },
  });
});

// Available trigger actions
app.get('/api/actions/types', (req, res) => res.json(VALID_ACTIONS));

// Pending manual actions
app.get('/api/actions', (req, res) => {
  try {
    const files = fs.readdirSync(MANUAL_ACTIONS_DIR).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 50);
    const actions = files.map(f => safeJSON(path.join(MANUAL_ACTIONS_DIR, f))).filter(Boolean);
    res.json(actions);
  } catch { res.json([]); }
});

// Submit a manual trigger (safe mode — writes a request file only, never sends)
app.post('/api/trigger', (req, res) => {
  const { action, notes } = req.body;
  const actionDef = VALID_ACTIONS.find(a => a.id === action);
  if (!actionDef) return res.status(400).json({ error: `Unknown action: ${action}` });

  ensureDir(MANUAL_ACTIONS_DIR);
  const id = `trigger_${Date.now()}`;
  const trigger = {
    id, action, label: actionDef.label, target_agent: actionDef.agent,
    notes: notes || '', timestamp: new Date().toISOString(),
    status: 'pending', safe_mode: true,
    warning: 'This trigger is logged only. Open Claude Code and run the corresponding /command to execute.',
  };
  fs.writeFileSync(path.join(MANUAL_ACTIONS_DIR, `${id}.json`), JSON.stringify(trigger, null, 2));
  res.json({ success: true, trigger });
});

// Update action status
app.post('/api/actions/:id/status', (req, res) => {
  const file = path.join(MANUAL_ACTIONS_DIR, `${req.params.id}.json`);
  const current = safeJSON(file);
  if (!current) return res.status(404).json({ error: 'Action not found' });
  const updated = { ...current, ...req.body, updated_at: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
  res.json(updated);
});

// Operating rules (from CLAUDE.md summary)
app.get('/api/rules', (req, res) => {
  res.json([
    { id: 1, category: 'Lead Sourcing',       rule: 'Fresh Orlando web leads are the primary source' },
    { id: 2, category: 'Lead Sourcing',       rule: 'No duplicate companies unless explicitly overridden' },
    { id: 3, category: 'Lead Sourcing',       rule: 'No duplicate company-contact layers unless explicitly overridden' },
    { id: 4, category: 'Outreach',            rule: 'Daily initial outreach only for net-new companies' },
    { id: 5, category: 'Outreach',            rule: 'Follow-up 1 and Follow-up 2 only — no FU3' },
    { id: 6, category: 'Outreach',            rule: 'Follow-ups only after 48–72 hours of no response' },
    { id: 7, category: 'Email Verification',  rule: 'Verified emails only from approved public sources' },
    { id: 8, category: 'Email Verification',  rule: 'Never guess email formats or construct addresses' },
    { id: 9, category: 'Email Verification',  rule: 'If no verified email exists, use another public route' },
    { id: 10, category: 'Contact Layering',   rule: 'One company may have multiple verified contact layers' },
    { id: 11, category: 'Contact Layering',   rule: 'Draft separate outreach per verified contact layer' },
    { id: 12, category: 'Safety',             rule: 'No outbound send without explicit human approval — safe mode always on' },
  ]);
});

// Sheets — Application Forms
app.get('/api/sheets/forms', (req, res) => {
  const forms = safeJSON(FORMS_TRACKER, []);
  const st = safeJSON(SHEETS_STATE, { forms: {}, outreach: {} });
  const rows = forms.map((f, i) => ({
    row: i + 1,
    company: f.company,
    vertical: f.vertical,
    date_added: f.date_added,
    form_url: f.form_url,
    requires_video: f.requires_video || false,
    notes: f.notes || '',
    submitted: st.forms[f.form_url]?.submitted ?? f.submitted ?? false,
  }));
  res.json(rows);
});

// Sheets — Email Outreach
app.get('/api/sheets/outreach', (req, res) => {
  const leads = parseCSV(PIPELINE_CSV);
  const st = safeJSON(SHEETS_STATE, { forms: {}, outreach: {} });
  const SENT_STATUSES = ['sent', 'fu1-sent', 'fu2-sent', 'replied', 'booked', 'closed', 'rejected'];
  const FU1_STATUSES  = ['fu1-sent', 'fu2-sent', 'replied', 'booked', 'closed', 'rejected'];
  const FU2_STATUSES  = ['fu2-sent', 'replied', 'booked', 'closed', 'rejected'];
  const rows = leads
    .filter(l => l.contact_email)
    .map(l => {
      const ov = st.outreach[l.id] || {};
      const s = l.status;
      const hasDraft = fs.existsSync(path.join(DRAFTS_DIR, `${l.id}.json`));
      return {
        id: l.id,
        row: Number(l.id),
        company: l.company,
        vertical: l.vertical,
        contact_email: l.contact_email,
        date_added: l.date_added,
        status: s,
        initial_sent: ov.initial_sent !== undefined ? ov.initial_sent : SENT_STATUSES.includes(s),
        fu1_sent:     ov.fu1_sent     !== undefined ? ov.fu1_sent     : FU1_STATUSES.includes(s),
        fu2_sent:     ov.fu2_sent     !== undefined ? ov.fu2_sent     : FU2_STATUSES.includes(s),
        has_draft: hasDraft,
        notes: l.notes || '',
      };
    });
  res.json(rows);
});

// Sheets — Toggle checkbox
app.post('/api/sheets/toggle', (req, res) => {
  const { tab, key, field, value } = req.body;
  if (!tab || !key || !field) return res.status(400).json({ error: 'tab, key, and field required' });
  ensureDir(DATA_DIR);
  const st = safeJSON(SHEETS_STATE, { forms: {}, outreach: {}, tourism: {} });
  if (!st[tab]) st[tab] = {};
  if (!st[tab][key]) st[tab][key] = {};
  st[tab][key][field] = value;
  fs.writeFileSync(SHEETS_STATE, JSON.stringify(st, null, 2));
  res.json({ ok: true });
});

// Sheets — Tourism Boards
app.get('/api/sheets/tourism-boards', (req, res) => {
  const boards = safeJSON(TOURISM_TRACKER, []);
  const st = safeJSON(SHEETS_STATE, { forms: {}, outreach: {}, tourism: {} });
  const rows = boards.map((b, i) => ({
    row: i + 1,
    org: b.org,
    type: b.type || 'DMO',
    geography: b.geography || 'Orlando, FL',
    date_added: b.date_added,
    form_url: b.form_url,
    requires_video: b.requires_video || false,
    follower_minimum: b.follower_minimum || null,
    notes: b.notes || '',
    submitted: st.tourism?.[b.form_url]?.submitted ?? b.submitted ?? false,
  }));
  res.json(rows);
});

// Draft viewer
app.get('/api/drafts/:id', (req, res) => {
  const file = path.join(DRAFTS_DIR, `${req.params.id}.json`);
  const data = safeJSON(file);
  if (!data) return res.status(404).json({ error: 'No draft found' });
  res.json(data);
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString(), version: '1.0.0' }));

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ┌──────────────────────────────────────────┐`);
  console.log(`  │  Orlando UGC Dashboard                   │`);
  console.log(`  │  http://localhost:${PORT}                    │`);
  console.log(`  │                                          │`);
  console.log(`  │  Safe mode: ON  |  No auto-send          │`);
  console.log(`  └──────────────────────────────────────────┘\n`);
});
