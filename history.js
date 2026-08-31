/* Jobilly.AI — posting & resume history */
const WORKSPACE_KEY = 'jobilly_workspace_v1';

const $ = id => document.getElementById(id);

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function formatHistoryDate(ts) {
  if (!ts) return 'Unknown date';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return 'Unknown date';
  }
}

function cleanJobTitle(title) {
  if (window.RAGEngine?.cleanJobTitle) return RAGEngine.cleanJobTitle(title);
  return String(title || '').trim();
}

const TAB_TITLE_PREFIX_RE = /^(hands[\s-]?on|experienced|passionate|talented|skilled|motivated|dynamic|dedicated|results[\s-]?driven|strong)\s+/i;

function shortenVerboseTabTitle(title) {
  const t = cleanJobTitle(title);
  if (!t) return '';
  const low = t.toLowerCase().replace(/centre/g, 'center');
  if (/\b(data\s*center|linux|hw|hardware|cabling|infrastructure|colo)\b/.test(low)
    && /\b(engineer|technician|operator|specialist)\b/.test(low)) {
    return 'Data Center Technician';
  }
  if (/\b(ml|llm|machine learning|deep learning|nlp)\b/.test(low) && /\b(engineer|scientist|developer)\b/.test(low)) {
    if (/\bllm\b/.test(low) && /\bml\b/.test(low)) return 'ML / LLM Engineer';
    if (/\bllm\b/.test(low)) return 'LLM Engineer';
    if (/\bml\b/.test(low) || /\bmachine learning\b/.test(low)) return 'ML Engineer';
  }
  return t.replace(TAB_TITLE_PREFIX_RE, '').replace(/\s+/g, ' ').trim();
}

function sessionMeta(session) {
  const jd = String(session?.jd || '').trim();
  let title = shortenVerboseTabTitle(session?.roleTitle || session?.label || '');
  if (!title && jd && window.RAGEngine?.extractJdTitle) {
    title = shortenVerboseTabTitle(RAGEngine.extractJdTitle(jd));
  }
  const company = String(session?.company || '').trim();
  return {
    title: title || session?.label || 'Untitled posting',
    company,
    hasJd: jd.length > 0,
    hasResume: String(session?.tailoredResume || '').trim().length > 120,
  };
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return { jdSessions: [], baseResume: {} };
    const data = JSON.parse(raw);
    return {
      jdSessions: Array.isArray(data.jdSessions) ? data.jdSessions : [],
      baseResume: data.baseResume || {},
    };
  } catch {
    return { jdSessions: [], baseResume: {} };
  }
}

function getHistorySessions(sessions) {
  return (sessions || [])
    .filter(s => String(s.jd || '').trim() || String(s.tailoredResume || '').trim())
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function excerpt(text, max = 1200) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + '…';
}

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function openInDashboard(sessionId) {
  window.location.href = `index.html?session=${encodeURIComponent(sessionId)}`;
}

function printFromDashboard(sessionId) {
  window.location.href = `index.html?session=${encodeURIComponent(sessionId)}&print=1`;
}

function renderHistoryCard(session) {
  const meta = sessionMeta(session);
  const jd = String(session.jd || '').trim();
  const resume = String(session.tailoredResume || '').trim();
  const badge = meta.hasResume
    ? '<span class="history-badge draft">Tailored draft</span>'
    : '<span class="history-badge jd-only">JD only</span>';

  return `
    <article class="history-card" id="history-${escapeHtml(session.id)}">
      <header class="history-card-head">
        <div>
          <h2 class="history-card-title">${escapeHtml(meta.title)}</h2>
          <div class="history-card-meta">
            ${meta.company ? `<span class="co">${escapeHtml(meta.company)}</span>` : ''}
            <span>${escapeHtml(formatHistoryDate(session.updatedAt))}</span>
            ${jd ? `<span>${wordCount(jd)} JD words</span>` : ''}
            ${meta.hasResume ? `<span>${wordCount(resume)} resume words</span>` : ''}
          </div>
        </div>
        <div class="history-card-actions">
          ${badge}
          <a class="btn-secondary" href="index.html?session=${encodeURIComponent(session.id)}">Open</a>
          ${meta.hasResume ? `<button type="button" class="btn-secondary" onclick="printFromDashboard('${session.id}')">Print</button>` : ''}
        </div>
      </header>
      <div class="history-card-body">
        <section class="history-pane">
          <div class="history-pane-label">Job posting</div>
          <div class="history-pane-text ${jd ? '' : 'empty'}">${jd ? escapeHtml(excerpt(jd, 2400)) : 'No job description saved for this slot.'}</div>
          <div class="history-pane-foot">${jd ? `${jd.length} characters` : ''}</div>
        </section>
        <section class="history-pane">
          <div class="history-pane-label">Tailored resume</div>
          <div class="history-pane-text ${meta.hasResume ? '' : 'empty'}">${meta.hasResume ? escapeHtml(excerpt(resume, 2400)) : 'Not rewritten yet — open in dashboard and run Rewrite for this posting.'}</div>
          <div class="history-pane-foot">${meta.hasResume ? `${resume.length} characters` : ''}</div>
        </section>
      </div>
    </article>`;
}

function renderHistoryPage() {
  const { jdSessions } = loadWorkspace();
  const items = getHistorySessions(jdSessions);
  const withResume = items.filter(s => String(s.tailoredResume || '').trim().length > 120);
  const withJd = items.filter(s => String(s.jd || '').trim().length > 0);

  const stats = $('historyStats');
  if (stats) {
    stats.innerHTML = `
      <span class="stat-pill"><strong>${items.length}</strong> saved posting${items.length === 1 ? '' : 's'}</span>
      <span class="stat-pill"><strong>${withJd.length}</strong> with JD text</span>
      <span class="stat-pill"><strong>${withResume.length}</strong> tailored resume${withResume.length === 1 ? '' : 's'}</span>
    `;
  }

  const list = $('historyList');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `
      <div class="history-empty">
        <h2>No postings yet</h2>
        <p>Add job descriptions on the dashboard and rewrite your resume. Every posting and tailored draft will show up here.</p>
        <a class="btn-primary" href="index.html">Go to dashboard</a>
      </div>`;
    return;
  }

  list.innerHTML = items.map(renderHistoryCard).join('');
}

window.printFromDashboard = printFromDashboard;
window.openInDashboard = openInDashboard;
renderHistoryPage();
