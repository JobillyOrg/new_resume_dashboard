/* Jobilly.AI Resume Dashboard */
const SCORE_THRESHOLD = 95;
const MAX_BOOST_PASSES = 6;
const SKILLSET_CACHE = 'ats_skillset_v9_';
const CERT_TERM_RE = /certif(?:y|ied|ication|ications)?|\baws certified\b|\bazure certified\b|\bgoogle cloud certified\b|\bsnowflake certified\b|\bdatabricks certified\b|\bpmp\b|\bcissp\b|\bcspo\b|\bcsm\b|\bcka\b|\bckad\b|\bcomptia\b|\bscrum master\b|\bprofessional cloud architect\b|\bsolutions architect associate\b|\bdata engineer associate\b/i;
const JUNK_SKILL_RE = /\b(retirement|401k|401\(k\)|benefits?|insurance|dental|vision|compensation|how to apply|cover letter|submit your resume|employer-paid|disability insurance|employee assistance)\b/i;

function isCertTerm(term) {
  return CERT_TERM_RE.test(String(term || ''));
}

function dropCertTerms(list) {
  return (list || []).filter(t => t && !isCertTerm(t));
}

function filterExtractedSkills(list) {
  return dropCertTerms(list).filter(t => {
    const s = String(t || '').trim();
    if (s.length < 2 || s.length > 72) return false;
    if (JUNK_SKILL_RE.test(s)) return false;
    if (/^(the|what|how|we|you|our|this|that)\b/i.test(s)) return false;
    return true;
  });
}

function termInJdText(jd, term) {
  if (window.RAGEngine && RAGEngine.keywordInText) return RAGEngine.keywordInText(term, jd, {});
  const t = String(term || '').trim().toLowerCase();
  return t.length >= 2 && String(jd || '').toLowerCase().includes(t);
}

function stripCertGaps(items) {
  return (items || []).filter(g => !isCertTerm(g) && !/certif/i.test(String(g)));
}

function uniqTerms(list) {
  const out = [];
  const seen = new Set();
  for (const t of dropCertTerms(list || [])) {
    const k = String(t).toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function mergeKeywordSets(a = {}, b = {}) {
  const primary = uniqTerms([...(a.primary || []), ...(b.primary || [])]).slice(0, 14);
  const pset = new Set(primary.map(x => String(x).toLowerCase()));
  const secondary = uniqTerms([...(a.secondary || []), ...(b.secondary || [])])
    .filter(t => !pset.has(String(t).toLowerCase()))
    .slice(0, 14);
  return {
    primary,
    secondary,
    aliasMap: Object.fromEntries([...primary, ...secondary].map(k => [k, [k]])),
    title: a.title || b.title || '',
    source: a.source || b.source || 'merged',
  };
}
const TRACKS = [
  { id: 'auto', label: 'Read from posting', headline: '' },
  { id: 'sde', label: 'Senior data engineer', headline: 'Senior Data Engineer | Python | SQL | Spark | AWS | GCP | Databricks' },
  { id: 'cloud', label: 'Cloud data engineer', headline: 'Cloud Data Engineer | AWS | GCP | Spark | Airflow | Kafka' },
  { id: 'dbx', label: 'Databricks engineer', headline: 'Databricks Engineer | PySpark | Delta Lake | Unity Catalog | Spark' },
  { id: 'gcp', label: 'GCP data engineer', headline: 'GCP Data Engineer | BigQuery | Dataflow | Pub/Sub | Composer | GCS' },
  { id: 'aws', label: 'AWS data engineer', headline: 'AWS Data Engineer | Glue | Redshift | EMR | S3 | Kinesis | MWAA' },
  { id: 'dc', label: 'Data center technician', headline: 'Data Center Technician | Linux | Cabling | TCP/IP | PDU | HVAC' },
];

const TEN_QUESTIONS = [
  { key: 'role', label: 'Is the target role obvious?' },
  { key: 'years', label: 'Can you see years of experience?' },
  { key: 'strongestTech', label: 'Are the strongest tools visible?' },
  { key: 'cloud', label: 'Are the platforms named?' },
  { key: 'problemsSolved', label: 'Does the work show real problems solved?' },
  { key: 'measurableResults', label: 'Are there numbers on the page?' },
  { key: 'jdMatch', label: 'Does the history match this posting?' },
];

const RULE_META = [
  { key: 'keywordsInExperience', label: 'Skills in work history', max: 25 },
  { key: 'keywordCredibility', label: 'Skills you can defend', max: 10 },
  { key: 'secondaryKeywords', label: 'Extra role skills', max: 8 },
  { key: 'quantified', label: 'Measured bullets', max: 15 },
  { key: 'achievementsNotDuties', label: 'Results, not chores', max: 8 },
  { key: 'tenSecond', label: 'Top-third punch', max: 12 },
  { key: 'format', label: 'Parser-safe page', max: 8 },
  { key: 'structure', label: 'Section order', max: 6 },
  { key: 'bulletQuality', label: 'Bullet strength', max: 8 },
];

let state = {
  mode: 'integrity',
  track: 'auto',
  keywords: null,
  kwHash: '',
  tailoredResume: '',
  scorecard: null,
  filename: '',
  geminiOk: false,
  lastModel: '',
  docFit: { bodyPt: 12, lh: 1, pages: 1 },
  boldTerms: [],
  boldFinalized: false,
  preTailor: null,
  detailAnalysisOpen: false,
  baseResume: { text: '', fileName: '', fileType: '', updatedAt: 0 },
  jdSessions: [],
  activeJdId: '',
};

const WORKSPACE_KEY = 'jobilly_workspace_v1';
let saveWorkspaceTimer = null;

function newJdId() {
  return 'jd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function jdSessionLabel(jd, fallback, keywords) {
  const meta = deriveJdSessionMeta(jd, keywords);
  return meta.label || fallback || 'New posting';
}

function getActiveJdSession() {
  return state.jdSessions.find(s => s.id === state.activeJdId) || state.jdSessions[0] || null;
}

function persistCurrentJdSession(keywords) {
  const session = getActiveJdSession();
  if (!session) return;
  if ($('jdInput')) session.jd = $('jdInput').value;
  session.tailoredResume = state.tailoredResume || ($('outputArea') && $('outputArea').textContent) || '';
  syncJdSessionMeta(session, keywords || state.keywords);
  session.updatedAt = Date.now();
  renderResumeHistory();
}

function initDefaultWorkspace() {
  state.baseResume = { text: '', fileName: '', fileType: '', updatedAt: 0 };
  state.jdSessions = [{ id: newJdId(), label: 'New posting', jd: '', tailoredResume: '', updatedAt: Date.now() }];
  state.activeJdId = state.jdSessions[0].id;
}

function saveWorkspace() {
  const payload = {
    baseResume: state.baseResume,
    jdSessions: state.jdSessions,
    activeJdId: state.activeJdId,
    mode: state.mode,
    track: state.track,
  };
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(payload)); } catch { /* quota */ }
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) {
      initDefaultWorkspace();
      return;
    }
    const data = JSON.parse(raw);
    state.baseResume = data.baseResume || { text: '', fileName: '', fileType: '', updatedAt: 0 };
    state.jdSessions = Array.isArray(data.jdSessions) && data.jdSessions.length
      ? data.jdSessions
      : [{ id: newJdId(), label: 'New posting', jd: '', tailoredResume: '', updatedAt: Date.now() }];
    state.activeJdId = data.activeJdId || state.jdSessions[0].id;
    if (data.mode) state.mode = data.mode;
    if (data.track) state.track = data.track;
  } catch {
    initDefaultWorkspace();
  }
  if (!state.jdSessions.length) initDefaultWorkspace();
  state.jdSessions.forEach(s => syncJdSessionMeta(s));
}

function applyBaseResumeToUi() {
  const text = state.baseResume?.text || '';
  if ($('resumeInput')) $('resumeInput').value = text;
  if ($('baseResumeName')) {
    const name = state.baseResume?.fileName;
    $('baseResumeName').textContent = name || (text.trim() ? 'Pasted text (no file)' : 'No file loaded — paste or upload');
  }
}

function updateJdActiveMeta() {
  const session = getActiveJdSession();
  const banner = $('jdActiveMeta');
  const titleEl = $('jdActiveTitle');
  const companyEl = $('jdActiveCompany');
  if (!banner || !titleEl || !companyEl) return;
  const meta = deriveJdSessionMeta(session?.jd || '', state.keywords);
  const hasJd = String(session?.jd || '').trim().length > 0;
  const fullTitle = session?.roleTitle || meta.fullTitle || meta.title;
  const company = session?.company || meta.company;
  if (!hasJd || !fullTitle) {
    banner.classList.add('hidden');
    return;
  }
  titleEl.textContent = fullTitle;
  companyEl.textContent = company || '';
  companyEl.classList.toggle('hidden', !company);
  banner.classList.remove('hidden');
}

function renderJdTabs() {
  const el = $('jdTabRow');
  if (!el) return;
  const canClose = state.jdSessions.length > 1;
  el.innerHTML = state.jdSessions.map(s => {
    const meta = deriveJdSessionMeta(s.jd, s.id === state.activeJdId ? state.keywords : null);
    const hasJd = String(s.jd || '').trim().length > 0;
    const fullTitle = (s.roleTitle || meta.fullTitle || meta.title || '').trim();
    const title = formatTabJobTitle(fullTitle) || (hasJd ? 'Untitled role' : 'New posting');
    const company = (s.company || meta.company || '').trim();
    const tip = company ? `${company} — ${fullTitle || title}` : (fullTitle || title);
    const hasDraft = String(s.tailoredResume || '').trim().length > 200;
    const active = s.id === state.activeJdId;
    return `
    <div class="jd-tab-wrap ${active ? 'active' : ''}">
      <button type="button" class="jd-tab ${active ? 'active' : ''}" onclick="switchJdSession('${s.id}')" title="${escapeHtml(tip).replace(/"/g, '&quot;')}">
        <span class="jd-tab-top">
          ${hasDraft ? '<span class="jd-tab-dot" title="Tailored draft saved"></span>' : ''}
          <span class="jd-tab-title">${escapeHtml(title)}</span>
        </span>
        ${company ? `<span class="jd-tab-sub">${escapeHtml(company)}</span>` : ''}
      </button>
      ${canClose ? `<button type="button" class="jd-tab-close" onclick="closeJdSession('${s.id}', event)" aria-label="Remove posting" title="Remove posting">×</button>` : ''}
    </div>`;
  }).join('') + '<button type="button" class="jd-tab add" onclick="addJdSession()"><span class="jd-tab-add-icon">+</span> Add posting</button>';
  updateJdActiveMeta();
  renderResumeHistory();
}

function getHistorySessions() {
  return state.jdSessions
    .filter(s => String(s.tailoredResume || '').trim().length > 120)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function formatHistoryDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function renderResumeHistory() {
  const el = $('resumeHistory');
  if (!el) return;
  const items = getHistorySessions();
  if (!items.length) {
    el.innerHTML = '<p class="rail-history-empty">Rewrite a posting to build your print history.</p>';
    return;
  }
  el.innerHTML = items.map(s => {
    const meta = deriveJdSessionMeta(s.jd);
    const title = formatTabJobTitle(s.roleTitle || meta.fullTitle || s.label || 'Untitled role', { full: true });
    const company = (s.company || meta.company || '').trim();
    const active = s.id === state.activeJdId;
    return `
      <article class="rail-history-item ${active ? 'active' : ''}" onclick="openHistorySession('${s.id}')">
        <div class="rail-history-title" title="${escapeHtml(title).replace(/"/g, '&quot;')}">${escapeHtml(title)}</div>
        ${company ? `<div class="rail-history-sub">${escapeHtml(company)}</div>` : ''}
        <div class="rail-history-meta">${escapeHtml(formatHistoryDate(s.updatedAt))}</div>
        <div class="rail-history-actions">
          <button type="button" class="rail-history-print" onclick="printSessionResume('${s.id}', event)">Print</button>
        </div>
      </article>`;
  }).join('');
}

function openHistorySession(id) {
  if (id === state.activeJdId) {
    const target = $('resultsSection') || $('resumePaper');
    if (target && !target.classList?.contains('hidden')) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  switchJdSession(id);
  setTimeout(() => {
    const target = $('resultsSection') || $('resumePaper');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function printSessionResume(id, event) {
  event?.stopPropagation?.();
  event?.preventDefault?.();
  const session = state.jdSessions.find(s => s.id === id);
  const content = String(session?.tailoredResume || '').trim();
  if (!content || content.length < 50) {
    showToast('No tailored resume to print', '#e11d48');
    return;
  }
  if (id !== state.activeJdId) {
    persistCurrentJdSession();
    state.activeJdId = id;
    syncUiFromActiveSession();
  } else {
    state.tailoredResume = content;
    if ($('outputArea')) $('outputArea').textContent = content;
    showFormattedResume(content);
  }
  printResume();
}

function syncUiFromActiveSession() {
  const session = getActiveJdSession();
  if (!session) return;
  if ($('jdInput')) $('jdInput').value = session.jd || '';
  state.tailoredResume = session.tailoredResume || '';
  if ($('outputArea')) $('outputArea').textContent = state.tailoredResume;
  if (state.tailoredResume) showFormattedResume(state.tailoredResume);
  else if ($('resumePaper')) $('resumePaper').innerHTML = '';
  state.keywords = null;
  state.kwHash = '';
  renderJdTabs();
  updateCounts();
}

function switchJdSession(id) {
  if (id === state.activeJdId) return;
  persistCurrentJdSession();
  state.activeJdId = id;
  resetResultsUi(true);
  syncUiFromActiveSession();
}

function addJdSession() {
  persistCurrentJdSession();
  const session = { id: newJdId(), label: 'New posting', jd: '', tailoredResume: '', updatedAt: Date.now() };
  state.jdSessions.push(session);
  state.activeJdId = session.id;
  resetResultsUi(true);
  syncUiFromActiveSession();
  saveWorkspace();
  if ($('jdInput')) $('jdInput').focus();
  showToast('New posting slot added');
}

function closeJdSession(id, event) {
  event?.stopPropagation?.();
  event?.preventDefault?.();
  if (state.jdSessions.length <= 1) {
    removeActiveJdSession();
    return;
  }
  persistCurrentJdSession();
  const wasActive = id === state.activeJdId;
  state.jdSessions = state.jdSessions.filter(s => s.id !== id);
  if (wasActive) state.activeJdId = state.jdSessions[0].id;
  resetResultsUi(true);
  syncUiFromActiveSession();
  saveWorkspace();
  showToast('Posting removed');
}

function removeActiveJdSession() {
  if (state.jdSessions.length <= 1) {
    const s = getActiveJdSession();
    if (s) {
      s.jd = '';
      s.tailoredResume = '';
      s.label = 'New posting';
      s.roleTitle = '';
      s.company = '';
    }
    if ($('jdInput')) $('jdInput').value = '';
    resetResultsUi(true);
    syncUiFromActiveSession();
    saveWorkspace();
    showToast('Posting cleared');
    return;
  }
  persistCurrentJdSession();
  state.jdSessions = state.jdSessions.filter(s => s.id !== state.activeJdId);
  state.activeJdId = state.jdSessions[0].id;
  resetResultsUi(true);
  syncUiFromActiveSession();
  saveWorkspace();
  showToast('Posting removed');
}

function scheduleSaveWorkspace() {
  clearTimeout(saveWorkspaceTimer);
  saveWorkspaceTimer = setTimeout(() => {
    persistCurrentJdSession();
    state.baseResume = {
      ...(state.baseResume || {}),
      text: ($('resumeInput') && $('resumeInput').value) || '',
      updatedAt: Date.now(),
    };
    saveWorkspace();
    renderJdTabs();
  }, 400);
}

function onResumeInput() {
  updateCounts();
  scheduleSaveWorkspace();
}

function onJdInput() {
  updateCounts();
  const session = getActiveJdSession();
  if (session && $('jdInput')) {
    session.jd = $('jdInput').value;
    syncJdSessionMeta(session);
  }
  renderJdTabs();
  scheduleSaveWorkspace();
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function extractResumeOnServer(fileName, data) {
  const res = await fetch('/api/extract-resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, data }),
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 404) {
    throw new Error('Restart the server (start.bat or python server.py) to enable file upload, then refresh.');
  }
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `Extract failed (HTTP ${res.status})`);
  }
  return payload;
}

async function handleResumeUpload(file) {
  if (!file) return;
  if (!/\.(pdf|doc|docx|txt)$/i.test(file.name)) {
    showToast('Use PDF, DOC, DOCX, or TXT', '#e11d48');
    return;
  }
  showAiProcessing('Reading your resume file…', 'Extracting text from ' + file.name + '…');
  try {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'txt') {
      const text = (await file.text()).trim();
      if (text.length < 40) throw new Error('Very little text was found in that file. Try another export.');
      setBaseResume(text, file.name);
      stopAiProcessing();
      showToast('Base resume loaded · ' + wordCount(text) + ' words');
      return;
    }
    const data = await fileToBase64(file);
    const payload = await extractResumeOnServer(file.name, data);
    setBaseResume(payload.text, file.name);
    stopAiProcessing();
    showToast('Base resume loaded · ' + wordCount(payload.text) + ' words');
  } catch (err) {
    stopAiProcessing();
    showToast(String(err.message || err).slice(0, 140), '#e11d48');
  }
}

function setBaseResume(text, fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const normalized = normalizeContactInResume(text || '');
  state.baseResume = {
    text: normalized,
    fileName: fileName || '',
    fileType: ext || 'txt',
    updatedAt: Date.now(),
  };
  applyBaseResumeToUi();
  updateCounts();
  state.keywords = null;
  state.kwHash = '';
  saveWorkspace();
}

function triggerReplaceResume() {
  const input = $('resumeFileInput');
  if (input) input.click();
}

function initResumeUpload() {
  const input = $('resumeFileInput');
  const zone = $('resumeUploadZone');
  if (input) {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) handleResumeUpload(file);
      input.value = '';
    });
  }
  if (zone) {
    zone.addEventListener('click', () => { if (input) input.click(); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleResumeUpload(file);
    });
  }
}

function $(id) { return document.getElementById(id); }

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function wordCount(s) { return s.trim() ? s.trim().split(/\s+/).length : 0; }

function jdHash(str) {
  return window.RAGEngine ? RAGEngine.jdHash(str) : String(str.length);
}

function showToast(msg, color = '#4f46e5') {
  const el = $('toast');
  el.textContent = msg;
  el.style.background = color;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

function setStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = $('step' + i);
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
}

function setProgress(pct, label, sub = '') {
  if ($('progressBar')) $('progressBar').style.width = pct + '%';
  if ($('progressLabel')) $('progressLabel').textContent = label;
  if ($('progressSub')) $('progressSub').textContent = sub;
  if (sub) updateAiProcessing(sub, label);
}

let screenLoadingDepth = 0;

function showScreenLoading(title, sub = 'Please wait…', { showNotice = false } = {}) {
  screenLoadingDepth += 1;
  const overlay = $('aiProcessingOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('screen-loading');
  if ($('aiOverlayTitle')) $('aiOverlayTitle').textContent = title;
  if ($('aiOverlaySub')) $('aiOverlaySub').textContent = sub;
  if ($('aiNoticeBanner')) $('aiNoticeBanner').classList.toggle('hidden', !showNotice);
  if ($('loadingIndicator')) $('loadingIndicator').classList.add('hidden');
}

function hideScreenLoading() {
  screenLoadingDepth = Math.max(0, screenLoadingDepth - 1);
  if (screenLoadingDepth > 0) return;
  const overlay = $('aiProcessingOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('screen-loading');
}

function showAiProcessing(title, sub = 'Please wait…') {
  showScreenLoading(title, sub, { showNotice: true });
  if ($('progressSection')) $('progressSection').classList.add('hidden');
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.add('hidden');
  if ($('detailAnalysisPanel')) $('detailAnalysisPanel').classList.add('hidden');
  if ($('scoreSection')) $('scoreSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  if ($('resultsSection')) $('resultsSection').classList.add('hidden');
}

function updateAiProcessing(sub, title) {
  if (title && $('aiOverlayTitle')) $('aiOverlayTitle').textContent = title;
  if (sub && $('aiOverlaySub')) $('aiOverlaySub').textContent = sub;
}

function stopAiProcessing() {
  hideScreenLoading();
}

function setDetailAnalysisOpen(open) {
  state.detailAnalysisOpen = !!open;
  const panel = $('detailAnalysisPanel');
  const btn = $('detailAnalysisBtn');
  if (panel) panel.classList.toggle('hidden', !open);
  if ($('scoreSection')) $('scoreSection').classList.toggle('hidden', !open);
  if ($('optimizeBoard')) $('optimizeBoard').classList.toggle('hidden', !open);
  if (btn) btn.textContent = open ? 'Hide detail analysis' : 'Detail analysis';
}

function toggleDetailAnalysis() {
  setDetailAnalysisOpen(!state.detailAnalysisOpen);
  if (state.detailAnalysisOpen && $('detailAnalysisPanel')) {
    $('detailAnalysisPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setLoading(text) {
  showScreenLoading('Working…', text || 'Please wait…');
}

function stopLoading() {
  hideScreenLoading();
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  $('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

function setMode(mode) {
  if (state.mode !== mode) {
    state.keywords = null;
    state.kwHash = '';
  }
  state.mode = mode;
  $('modeIntegrity').classList.toggle('active', mode === 'integrity');
  $('modeAggressive').classList.toggle('active', mode === 'aggressive');
  saveWorkspace();
}

function setTrack(id) {
  state.track = id;
  document.querySelectorAll('#trackRow .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.id === id);
  });
  saveWorkspace();
}

function cleanJobTitle(title) {
  const fn = window.RAGEngine && RAGEngine.cleanJobTitle;
  if (fn) return fn(title);
  return String(title || '')
    .replace(/\s*[—–\-|:•]+\s*(primary\s+)?responsibilit(y|ies)\b.*$/i, '')
    .replace(/\s*[—–\-|:•]+\s*why\b.*$/i, '')
    .trim();
}

function currentHeadline() {
  const track = TRACKS.find(t => t.id === state.track) || TRACKS[0];
  if (track.headline) return cleanJobTitle(track.headline.split('|')[0].trim());
  const role = state.keywords && state.keywords.role;
  if (role) return cleanJobTitle(role.title || role.label || '');
  return '';
}

const COMPANY_STOP = new Set([
  'the', 'our', 'your', 'this', 'that', 'we', 'us', 'job', 'role', 'team', 'about',
  'join', 'company', 'employer', 'equal', 'opportunity', 'position', 'opening',
  'hiring', 'remote', 'hybrid', 'onsite', 'full', 'time', 'contract', 'intern',
  'fine', 'tuning', 'model', 'models', 'hands', 'machine', 'learning', 'llm', 'ml', 'ai',
]);

function isValidCompanyName(raw) {
  const s = cleanCompanyName(raw);
  if (!s || s.length < 3) return false;
  const low = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!low || COMPANY_STOP.has(low)) return false;
  if (/^(fine|tune|tuning|engineer|developer|analyst|scientist|specialist)$/i.test(s)) return false;
  return true;
}

const KNOWN_COMPANIES = [
  'Amazon', 'Google', 'Alphabet', 'Microsoft', 'Meta', 'Facebook', 'Netflix', 'Apple',
  'Stripe', 'Uber', 'Lyft', 'Airbnb', 'Salesforce', 'Oracle', 'Adobe', 'Intel',
  'Nvidia', 'Tesla', 'JPMorgan', 'Chase', 'Goldman Sachs', 'Bank of America',
  'Walmart', 'Target', 'Costco', 'Deloitte', 'Accenture', 'IBM', 'Cisco', 'VMware',
  'Snowflake', 'Databricks', 'Palantir', 'Coinbase', 'Robinhood', 'Spotify',
  'Twitter', 'LinkedIn', 'PayPal', 'Square', 'Block', 'Shopify', 'Twilio',
  'Atlassian', 'ServiceNow', 'Workday', 'Intuit', 'Capital One', 'American Express',
  'Boeing', 'Lockheed Martin', 'Pfizer', 'Johnson & Johnson', 'Merck', 'Novartis',
  'Roche', 'Genentech', 'Moderna', 'CVS', 'UnitedHealth', 'Anthem', 'Cigna',
  'Humana', 'Kaiser', 'Mayo Clinic', 'Cleveland Clinic', 'HCA', 'Epic', 'Cerner',
];

function cleanCompanyName(raw) {
  let s = String(raw || '').trim()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\.?$/i, '')
    .replace(/[|,].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length < 2) return '';
  const low = s.toLowerCase();
  if (COMPANY_STOP.has(low)) return '';
  if (/^(job|role|team|the|our|your)$/i.test(s)) return '';
  const words = s.split(' ');
  if (words.length > 3) s = words.slice(0, 2).join(' ');
  return s;
}

function extractCompanyFromJd(jd) {
  const text = String(jd || '').trim();
  if (!text) return '';

  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:careers|jobs)\.([a-z0-9-]{2,30})\./i);
  if (urlMatch) {
    const fromUrl = cleanCompanyName(urlMatch[1].replace(/-/g, ' '));
    if (fromUrl) return fromUrl;
  }

  const patterns = [
    /\bcompany\s*[:]\s*([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})/i,
    /\bemployer\s*[:]\s*([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})/i,
    /\borganization\s*[:]\s*([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})/i,
    /\bat\s+([A-Z][A-Za-z0-9&.'-]{2,28})\s*,\s*we\b/,
    /\bjoin\s+([A-Z][A-Za-z0-9&.'-]{2,28})(?:\s+(?:as|our|the|a|an)\b)/,
    /\babout\s+((?:the\s+)?[A-Z][A-Za-z0-9&.'-]{2,28})(?:\s+(?:company|role|us|the role|our team|our mission)\b|[,\n])/,
    /\b([A-Z][A-Za-z0-9&.'-]{2,28})\s+is\s+(?:hiring|looking|seeking)\b/,
    /^([A-Z][A-Za-z0-9&.'-]{2,28})\s*[|–—-]\s*.+/m,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const cand = cleanCompanyName(m[1]);
      if (isValidCompanyName(cand)) return cand;
    }
  }

  const lower = text.toLowerCase();
  for (const brand of KNOWN_COMPANIES) {
    if (lower.includes(brand.toLowerCase())) return brand;
  }
  return '';
}

const JD_MARKETING_RE = /\b(is revolutioniz|leading provider|our mission|we(?:'| a)re hiring|join our team|transforming|healthcare industry|world.?class|fast.?growing|equal opportunity)\b/i;

function looksLikeMarketingLine(line) {
  const t = String(line || '').trim();
  if (!t) return true;
  if (t.length > 72) return true;
  if (JD_MARKETING_RE.test(t)) return true;
  if (/\b(about us|company overview|job description|primary responsibilities)\b/i.test(t)) return true;
  return false;
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
  if (/\b(network|noc|wan|lan)\b/.test(low) && /\b(engineer|technician|administrator|specialist)\b/.test(low)) {
    return 'Network Technician';
  }
  if (/\b(help\s*desk|service\s*desk|desktop|it)\b/.test(low) && /\b(support|technician|specialist)\b/.test(low)) {
    return 'IT Support Specialist';
  }
  if (/\b(ml|llm|machine learning|deep learning|nlp)\b/.test(low) && /\b(engineer|scientist|developer)\b/.test(low)) {
    if (/\bllm\b/.test(low) && /\bml\b/.test(low)) return 'ML / LLM Engineer';
    if (/\bllm\b/.test(low)) return 'LLM Engineer';
    if (/\bml\b/.test(low) || /\bmachine learning\b/.test(low)) return 'ML Engineer';
  }
  return t.replace(TAB_TITLE_PREFIX_RE, '').replace(/\s+/g, ' ').trim();
}

function formatTabJobTitle(title, { full = false } = {}) {
  let t = shortenVerboseTabTitle(title);
  if (!t) return '';
  if (!full && t.length > 34) t = t.slice(0, 31).trim() + '…';
  return t;
}

function deriveJdSessionMeta(jd, keywords) {
  const text = String(jd || '').trim();
  if (!text) return { title: '', company: '', label: 'New posting', fullTitle: '' };

  let rawTitle = cleanJobTitle(
    keywords?.role?.title || keywords?.role?.label || keywords?.title || ''
  );
  if (!rawTitle || looksLikeMarketingLine(rawTitle)) {
    rawTitle = window.RAGEngine?.extractJdTitle
      ? cleanJobTitle(RAGEngine.extractJdTitle(text))
      : '';
  }
  if (!rawTitle || looksLikeMarketingLine(rawTitle)) rawTitle = '';

  const fullTitle = shortenVerboseTabTitle(rawTitle);
  const title = formatTabJobTitle(rawTitle);
  let company = extractCompanyFromJd(text);
  if (!isValidCompanyName(company)) company = '';
  const label = fullTitle || title || 'New posting';
  return { title, company, label, fullTitle: fullTitle || rawTitle };
}

function syncJdSessionMeta(session, keywords) {
  if (!session) return;
  const meta = deriveJdSessionMeta(session.jd, keywords);
  session.roleTitle = meta.fullTitle || meta.title;
  session.company = meta.company;
  session.label = meta.label;
}

function shortcutCompany(name) {
  const s = String(name || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return (s || 'company').slice(0, 18);
}

function shortcutRole(title) {
  const tokens = cleanJobTitle(title || '')
    .split(/[\s/,&+|–—-]+/)
    .map(t => t.trim())
    .filter(Boolean);
  if (!tokens.length) return 'Role';

  const skip = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal', 'ii', 'iii', 'iv', 'i', 'the', 'and']);
  const acronyms = { ai: 'AI', ml: 'ML', llm: 'LLM', nlp: 'NLP', de: 'DE', se: 'SE', swe: 'SWE', iam: 'IAM', qa: 'QA', ui: 'UI', ux: 'UX', sre: 'SRE', etl: 'ETL', bi: 'BI', pm: 'PM', api: 'API' };
  const abbrev = {
    engineer: 'Engg', engineering: 'Engg', developer: 'Dev', development: 'Dev',
    scientist: 'Sci', analyst: 'Anlst', architect: 'Arch', manager: 'Mgr',
    specialist: 'Spec', consultant: 'Cons', administrator: 'Admin', associate: 'Assoc',
    intern: 'Intern', support: 'Supp', operations: 'Ops', operational: 'Ops',
  };

  const parts = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const low = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!low || skip.has(low)) continue;

    const next = tokens[i + 1] ? tokens[i + 1].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const after = tokens[i + 2] ? tokens[i + 2].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    if (low === 'machine' && next === 'learning') {
      parts.push('ML');
      if (after === 'engineer' || after === 'engineering') parts.push('Engg');
      i += (after === 'engineer' || after === 'engineering') ? 2 : 1;
      continue;
    }
    if (low === 'artificial' && next === 'intelligence') { parts.push('AI'); i++; continue; }
    if (low === 'data' && (next === 'engineer' || next === 'engineering')) { parts.push('DEEngg'); i++; continue; }
    if (low === 'software' && next === 'engineer') { parts.push('SEEngg'); i++; continue; }
    if (low === 'site' && next === 'reliability') { parts.push('SRE'); i++; continue; }

    if (acronyms[low]) { parts.push(acronyms[low]); continue; }
    if (abbrev[low]) { parts.push(abbrev[low]); continue; }
    if (w.length <= 4 && w === w.toUpperCase()) { parts.push(w); continue; }
    if (/^[A-Z]{2,}$/.test(w)) { parts.push(w); continue; }
  }

  const out = parts.join('').replace(/[^A-Za-z0-9]/g, '');
  if (out) return out;
  return tokens
    .filter(t => !skip.has(t.toLowerCase()))
    .map(t => t[0])
    .join('')
    .toUpperCase()
    .slice(0, 10) || 'Role';
}

function extractFirstName(resumeText) {
  const line = String(resumeText || '').split('\n').map(l => l.trim()).find(Boolean) || 'Resume';
  const name = line.replace(/[|,].*$/, '').trim();
  const first = (name.split(/\s+/)[0] || 'Resume').replace(/[^A-Za-z'-]/g, '');
  if (!first) return 'Resume';
  if (first === first.toUpperCase() && first.length > 1) {
    return first.charAt(0) + first.slice(1).toLowerCase();
  }
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function buildExportBasename(resumeText, jd, keywords) {
  const first = extractFirstName(resumeText);
  const company = shortcutCompany(extractCompanyFromJd(jd));
  const roleTitle = cleanJobTitle(
    keywords?.role?.title || keywords?.role?.label || keywords?.title
    || (window.RAGEngine && RAGEngine.extractJdTitle(jd))
    || currentHeadline()
    || 'Role'
  );
  const role = shortcutRole(roleTitle);
  return `${first}_${company}_${role}`;
}

function updateExportFilename(resumeText) {
  const jd = ($('jdInput') && $('jdInput').value.trim()) || '';
  const base = buildExportBasename(resumeText, jd, state.keywords || {});
  state.filename = `${base}.doc`;
  if ($('suggestedFilename')) $('suggestedFilename').textContent = state.filename;
  if ($('filenameReason')) {
    $('filenameReason').textContent = 'Format: FirstName_company_role (e.g. John_amazon_AIEngg). Used for Word, text, and Print/PDF save.';
  }
  return base;
}

function parseJsonLoose(raw) {
  if (!raw) throw new Error('Empty model response');
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in response');
  return JSON.parse(match[0]);
}

async function callGemini(prompt, { json = false, maxTokens = 4096 } = {}) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, json, maxTokens }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Gemini error ${res.status}`);
  }
  state.lastModel = data.model || '';
  state.geminiOk = true;
  markGemini(true);
  return data.text || '';
}

function markGemini() {
  /* API status badge removed from sidebar */
}

function formatPhoneUS(phone) {
  if (!phone) return '';
  const p = phone.trim();
  if (/^\+1(?:\s|[(.-]|\d)/.test(p)) return p;
  if (/^1[\s(.-]\d{3}/.test(p)) return '+' + p;
  return '+1 ' + p.replace(/^\+?/, '');
}

function shortenLinkedIn(url) {
  const s = String(url || '').trim();
  const m = s.match(/(?:https?:\/\/)?(?:www\.)?(linkedin\.com\/in\/[A-Za-z0-9\-_%]+)/i);
  return m ? m[1].toLowerCase() : s;
}

function formatContactLine(line) {
  if (!line) return '';
  return line.split('|').map(part => {
    const p = part.trim();
    if (!p) return '';
    if (/linkedin/i.test(p)) return shortenLinkedIn(p);
    const phoneMatch = p.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) return formatPhoneUS(phoneMatch[0]);
    return p;
  }).filter(Boolean).join(' | ');
}

function normalizeContactInResume(text) {
  const lines = String(text || '').split('\n');
  let seenName = false;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!seenName) {
      seenName = true;
      continue;
    }
    if (isSectionHeader(l)) break;
    if (/@/.test(l) || /\d{3}[\s.()-]*\d{3}/.test(l) || /linkedin/i.test(l)) {
      const trimmed = formatContactLine(l);
      if (trimmed !== l) lines[i] = lines[i].replace(l, trimmed);
    }
  }
  return lines.join('\n');
}

function extractContactFields(resumeText) {
  const text = resumeText || '';
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const rawPhone = (text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [])[0] || '';
  const rawLinkedin = (text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?/i) || [])[0] || '';
  const locLine = text.split('\n').slice(0, 8).find(l =>
    /\b([A-Z][a-z]+,\s*[A-Z]{2}|Remote|USA|United States)\b/.test(l) && !l.includes('@')
  );
  return {
    email,
    phone: formatPhoneUS(rawPhone),
    linkedin: shortenLinkedIn(rawLinkedin),
    location: locLine ? locLine.trim() : '',
  };
}

function extractRolesFromResume(resumeText) {
  const rawLines = resumeText.split('\n').map(l => l.trim());
  const isBullet = l => /^[-•*·◦▸▶>]/.test(l) || /^\d+[.)]\s/.test(l);
  const MONTH = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const PRESENT = /\b(present|current|now|today|ongoing)\b/i;
  const YR_RANGE = /\b(19|20)\d{2}\s*[-–—\/to]+\s*((19|20)\d{2}|present|current|now)\b/i;
  const YEAR = /\b(19|20)\d{2}\b/;
  const isDateLine = l => YEAR.test(l) && (MONTH.test(l) || PRESENT.test(l) || YR_RANGE.test(l));
  const STOP = /^(EDUCATION|CERTIF|PROJECT|SKILLS|SUMMARY|OBJECTIVE|PROFILE|AWARD|HONOR|VOLUNTEER|PUBLICATION|LANGUAGE|LEADERSHIP|AFFILIAT|INTEREST|TRAINING|COURSEWORK|PATENT|MEMBERSHIP|REFERENCE|ADDITIONAL)/i;
  const EXP = /^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT)/i;
  const nonEmpty = rawLines.map((text, idx) => ({ text, idx })).filter(l => l.text);
  let start = -1, end = nonEmpty.length;
  for (let i = 0; i < nonEmpty.length; i++) {
    if (start === -1 && EXP.test(nonEmpty[i].text)) { start = i + 1; continue; }
    if (start !== -1 && STOP.test(nonEmpty[i].text)) { end = i; break; }
  }
  const scan = start === -1 ? nonEmpty.slice(6) : nonEmpty.slice(start, end);
  const roles = [];
  for (let i = 0; i < scan.length; i++) {
    const cur = scan[i].text;
    if (!isDateLine(cur) || cur.includes('@')) continue;
    const prev = [];
    for (let j = i - 1; j >= 0 && prev.length < 2; j--) {
      const t = scan[j].text;
      if (isBullet(t) || isDateLine(t) || EXP.test(t) || STOP.test(t)) break;
      if (t.length >= 3 && t.length <= 120) prev.unshift(t);
    }
    roles.push([prev.join(' | '), cur].filter(Boolean).join(' | '));
  }
  return roles;
}

function buildAliasMap(...lists) {
  const terms = uniqTerms(lists.flat());
  const aliasMap = {};
  const kb = (window.RAGEngine && RAGEngine.SKILL_KB) || [];
  for (const k of terms) {
    const skill = kb.find(s => s.label.toLowerCase() === String(k).toLowerCase());
    aliasMap[k] = skill ? uniqTerms([skill.label, ...skill.terms]) : [k];
  }
  return aliasMap;
}

function ensureAliasMap(kw) {
  if (!kw) return {};
  if (kw.aliasMap && Object.keys(kw.aliasMap).length) return kw.aliasMap;
  kw.aliasMap = buildAliasMap(
    kw.primary, kw.secondary, kw.jdSkills, kw.marketSkills,
    kw.atsKeywords, kw.internetKeywords, kw.jdPrimary, kw.jdSecondary,
    kw.internetSkills, kw.roleSkills,
  );
  return kw.aliasMap;
}

function buildJdAnalysisPrompt(jd, ragHints) {
  const role = ragHints?.role || {};
  const ragJd = uniqTerms([...(ragHints?.jdPrimary || []), ...(ragHints?.jdSecondary || [])]).join(', ');
  return `You are an expert US job-posting analyst for resume ATS tailoring. Read the ENTIRE job description. Extract skills the way a senior recruiter would — not just literal tool names, but applied capabilities clearly required.

LOCAL RAG HINTS (verify each against the JD; correct, drop, or replace bad hints):
- RAG guessed role: ${role.label || 'unknown'} (${role.title || ''})
- RAG keyword hints: ${ragJd || 'none'}

YOUR JOB — extract from THIS posting only (not internet/market skills):

1. roleTitle: exact hiring title (e.g. "ML/LLM Engineer", not a section header like "The Opportunity").
2. roleLabel: short readable label for the role.
3. roleFamily: one of data|ml|swe|support|network|devops|cloud|security|qa|datacenter|ba|healthcare
4. jdPrimary: 10-16 MUST-HAVE technical skills/tools/frameworks explicitly stated or clearly required in THIS JD.
   Include stacks like Python, PyTorch, LangChain, LlamaIndex, RAG, embeddings, vector search, fine-tuning, LLM evaluation, MLOps, etc. when the JD mentions them.
5. jdSecondary: 4-10 secondary items FROM THE JD ONLY — domain (healthcare, biopharma), practices (responsible AI, observability, production ML), or nice-to-have tools mentioned in the posting.
6. atsKeywords: 12-20 exact ATS phrases from THIS JD — short phrases copied or closely mirrored (e.g. "retrieval pipelines", "prompt chaining", "inference orchestration").

RULES:
- jdPrimary = hard technical skills only (languages, frameworks, platforms, ML/LLM techniques).
- jdSecondary = domain + supporting technical themes from the JD only.
- atsKeywords = verbatim or near-verbatim JD phrases useful for ATS matching.
- Do NOT include market/internet skills that are not in this JD — a separate AI step handles those.
- NO benefits, compensation, 401k, insurance, "how to apply", soft skills alone, or section headers.
- NO certifications or degrees.
- Use exact JD spelling when the JD names a tool (Transformers, LangChain, LlamaIndex).

JOB DESCRIPTION:
${jd.slice(0, 12000)}

Return ONLY JSON:
{
  "roleTitle": "...",
  "roleLabel": "...",
  "roleFamily": "ml",
  "jdPrimary": ["..."],
  "jdSecondary": ["..."],
  "atsKeywords": ["..."]
}`;
}

function buildInternetSkillsPrompt(jd, jdAi) {
  const roleTitle = jdAi?.roleTitle || jdAi?.roleLabel || 'this role';
  const roleFamily = jdAi?.roleFamily || 'general';
  const jdSkills = uniqTerms([...(jdAi?.jdPrimary || []), ...(jdAi?.jdSecondary || [])]).join(', ');
  const domainHint = String(jd || '').slice(0, 1500);
  return `You research US job market skill requirements using public internet sources: LinkedIn job posts, Indeed listings, Glassdoor, company career pages, Levels.fyi, and industry hiring guides.

ROLE TITLE: ${roleTitle}
ROLE FAMILY: ${roleFamily}
SKILLS ALREADY IN THE TARGET JD (do NOT repeat these): ${jdSkills || 'none'}

JD CONTEXT (for domain/industry only — do not re-extract JD skills):
${domainHint}

TASK:
1. internetSkills: 12-18 technical skills, tools, frameworks, and platforms commonly required for "${roleTitle}" on US job boards and employer career sites — skills frequently seen on the internet for this role type but NOT already in the JD list above.
2. internetKeywords: 8-14 multi-word phrases recruiters search for on job boards for this role (e.g. "production ML pipelines", "model deployment", "feature engineering") that are NOT already covered above.

RULES:
- Draw from typical LinkedIn/Indeed/Glassdoor postings for this exact role title and seniority.
- Technologies, platforms, frameworks, ML/data techniques only.
- NO soft skills, NO benefits, NO certifications, NO degrees.
- Do NOT duplicate any skill already in the JD list above.
- Skills should be realistic for a strong candidate in this role market — not random buzzwords.
- Prefer tools hiring managers commonly filter for on ATS even when absent from one posting.

Return ONLY JSON:
{
  "internetSkills": ["..."],
  "internetKeywords": ["..."]
}`;
}

function parseInternetSkills(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    internetSkills: filterExtractedSkills(parsed.internetSkills || parsed.marketSkills || []),
    internetKeywords: filterExtractedSkills(parsed.internetKeywords || parsed.marketKeywords || []),
  };
}

function mergeAiExtractions(jdAi, internetAi) {
  if (!jdAi) return null;
  const internetSkills = filterExtractedSkills(internetAi?.internetSkills || []);
  const internetKeywords = filterExtractedSkills(internetAi?.internetKeywords || []);
  return {
    ...jdAi,
    internetSkills,
    internetKeywords,
    marketSkills: internetSkills,
    internetUsed: internetSkills.length >= 4,
  };
}

function parseJdAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    roleTitle: cleanJobTitle(parsed.roleTitle || parsed.title || ''),
    roleLabel: cleanJobTitle(parsed.roleLabel || parsed.roleTitle || parsed.title || ''),
    roleFamily: String(parsed.roleFamily || '').trim(),
    jdPrimary: filterExtractedSkills(parsed.jdPrimary || parsed.primary || []),
    jdSecondary: filterExtractedSkills(parsed.jdSecondary || parsed.secondary || []),
    atsKeywords: filterExtractedSkills(parsed.atsKeywords || parsed.keywords || parsed.ats || []),
    internetSkills: filterExtractedSkills(parsed.internetSkills || []),
    internetKeywords: filterExtractedSkills(parsed.internetKeywords || []),
    marketSkills: filterExtractedSkills(parsed.marketSkills || parsed.market || parsed.roleSkills || parsed.internetSkills || []),
    internetUsed: !!parsed.internetUsed,
  };
}

function buildJdSkillList(jd, ai, ragJd) {
  const aiPrimary = filterExtractedSkills(ai?.jdPrimary || []);
  const aiSecondary = filterExtractedSkills(ai?.jdSecondary || []);
  if (aiPrimary.length >= 4) {
    const ragExtras = filterExtractedSkills([...(ragJd.jdPrimary || []), ...(ragJd.jdSecondary || [])])
      .filter(s => termInJdText(jd, s))
      .filter(s => !aiPrimary.some(p => p.toLowerCase() === s.toLowerCase()))
      .filter(s => !aiSecondary.some(p => p.toLowerCase() === s.toLowerCase()));
    return uniqTerms([...aiPrimary, ...aiSecondary, ...ragExtras]).slice(0, 16);
  }
  return uniqTerms([
    ...aiPrimary,
    ...aiSecondary,
    ...(ragJd.jdPrimary || []),
    ...(ragJd.jdSecondary || []),
  ]).filter(s => termInJdText(jd, s)).slice(0, 16);
}

function buildMarketSkillList(ai, ragJd, jdSkills) {
  const jdSet = new Set(jdSkills.map(s => String(s).toLowerCase()));
  const aiInternet = filterExtractedSkills(ai?.internetSkills || ai?.marketSkills || []);
  if (aiInternet.length >= 4) {
    return aiInternet.filter(s => !jdSet.has(s.toLowerCase())).slice(0, 16);
  }
  const ragMarket = window.RAGEngine ? RAGEngine.getMarketSkillsForRole(ragJd.role) : [];
  return uniqTerms([...aiInternet, ...ragMarket])
    .filter(s => !jdSet.has(String(s).toLowerCase()))
    .slice(0, 14);
}

function assembleLockedSkills(jd, ragJd, ai, mode) {
  const aiPrimary = filterExtractedSkills(ai?.jdPrimary || []);
  const aiSecondary = filterExtractedSkills(ai?.jdSecondary || []);
  const atsKeywords = filterExtractedSkills(ai?.atsKeywords || []);
  const jdSkills = buildJdSkillList(jd, ai, ragJd);
  const internetSkills = buildMarketSkillList(ai, ragJd, jdSkills);
  const internetKeywords = filterExtractedSkills(ai?.internetKeywords || []);
  const marketSkills = internetSkills;

  const role = {
    ...(ragJd.role || {}),
    label: ai?.roleLabel || ragJd.role?.label || 'This role',
    title: ai?.roleTitle || ragJd.role?.title || ragJd.role?.label || '',
    family: ai?.roleFamily || ragJd.role?.family || 'general',
    packId: ragJd.role?.packId,
  };

  const jdSecondaryOnly = aiSecondary.length
    ? aiSecondary.filter(s => !aiPrimary.some(p => p.toLowerCase() === s.toLowerCase()))
    : uniqTerms(ragJd.jdSecondary || [])
      .filter(s => !jdSkills.some(j => j.toLowerCase() === String(s).toLowerCase()))
      .slice(0, 8);

  if (mode === 'aggressive') {
    return {
      role,
      title: role.title || role.label,
      primary: jdSkills,
      secondary: marketSkills,
      jdPrimary: aiPrimary.length ? aiPrimary : jdSkills.slice(0, 12),
      jdSecondary: jdSecondaryOnly,
      atsKeywords,
      internetSkills,
      internetKeywords,
      jdSkills,
      marketSkills,
      roleSkills: marketSkills,
      aliasMap: buildAliasMap(jdSkills, marketSkills, atsKeywords, internetKeywords),
      source: ai ? 'gemini' : 'rag',
      analysisSource: ai?.internetUsed ? 'gemini-jd+internet' : (ai ? 'gemini-jd' : 'rag'),
      geminiUsed: !!ai,
      internetUsed: !!ai?.internetUsed,
      _mode: mode,
    };
  }

  return {
    role,
    title: role.title || role.label,
    primary: jdSkills,
    secondary: jdSecondaryOnly,
    jdPrimary: aiPrimary.length ? aiPrimary : jdSkills.slice(0, 12),
    jdSecondary: jdSecondaryOnly,
    atsKeywords,
    internetSkills,
    internetKeywords,
    jdSkills,
    marketSkills,
    roleSkills: marketSkills,
    aliasMap: buildAliasMap(jdSkills, jdSecondaryOnly, atsKeywords, internetKeywords),
    source: ai ? 'gemini' : 'rag',
    analysisSource: ai?.internetUsed ? 'gemini-jd+internet' : (ai ? 'gemini-jd' : 'rag'),
    geminiUsed: !!ai,
    internetUsed: !!ai?.internetUsed,
    _mode: mode,
  };
}

function skillsetCacheKey(jd) {
  return SKILLSET_CACHE + state.mode + '_' + jdHash(jd);
}

async function analyzeJdWithAiRag(jd) {
  const ragJd = RAGEngine.buildJdOnlySkillSet(jd);
  let ai = null;
  let geminiError = null;
  let internetError = null;
  try {
    if (typeof setProgress === 'function') setProgress(10, 'AI is analysing the job description…', 'Extracting skills from the posting…');
    const jdRaw = await callGemini(buildJdAnalysisPrompt(jd, ragJd), { json: true, maxTokens: 2800 });
    const jdAi = parseJdAnalysis(parseJsonLoose(jdRaw));
    if (!jdAi?.jdPrimary?.length) throw new Error('Gemini returned no JD skills');

    let internetAi = null;
    try {
      if (typeof setProgress === 'function') setProgress(16, 'AI is analysing the job description…', 'Researching market skills on job boards…');
      const netRaw = await callGemini(buildInternetSkillsPrompt(jd, jdAi), { json: true, maxTokens: 2000 });
      internetAi = parseInternetSkills(parseJsonLoose(netRaw));
    } catch (err) {
      internetError = err;
    }

    ai = mergeAiExtractions(jdAi, internetAi);
    if (!ai.internetUsed && internetError) {
      ai.internetError = String(internetError.message || internetError).slice(0, 100);
    }
  } catch (err) {
    geminiError = err;
    ai = null;
  }
  const built = assembleLockedSkills(jd, ragJd, ai, state.mode);
  built.geminiError = geminiError ? String(geminiError.message || geminiError).slice(0, 120) : null;
  built.internetError = ai?.internetError || (internetError && !ai ? String(internetError.message || internetError).slice(0, 100) : null);
  return built;
}

function buildScorePrompt(jd, resume, locked) {
  const lockedBlock = locked?.primary?.length
    ? `LOCKED KEYWORDS — score ONLY against these lists. Return them unchanged as "primary" and "secondary". Do not extract a new keyword list.
PRIMARY: ${locked.primary.join(', ')}
SECONDARY: ${(locked.secondary || []).join(', ')}
A keyword is FOUND if it or a close variant appears (Spark counts for Apache Spark, Airflow for Apache Airflow).
If every PRIMARY keyword appears in an experience bullet: keywordsInExperience MUST be 25 and keywordCredibility MUST be 10.
If every SECONDARY keyword appears anywhere: secondaryKeywords MUST be 8.
If SUMMARY, SKILLS, EXPERIENCE, and EDUCATION are present: structure MUST be 6. Missing certifications never reduce this.
If ALL-CAPS headers and hyphen bullets are present with no tables/icons: format MUST be 8.
Do not be conservative on a tailored resume. If the JD stack is present in Skills and Experience, the total MUST be ${SCORE_THRESHOLD} or higher.`
    : `Extract exactly 10 primary and 10 secondary ATS keywords using the JD's exact spelling (Apache Spark not just Spark when the JD says Apache Spark).
Keywords must be technologies, tools, platforms, and role skills ONLY.`;

  return `You are an ATS scoring engine for US full-time Data Engineer applications (Workday, Taleo, Greenhouse, iCIMS).

Score this resume against the job description using the 20-rule US resume rubric. Return ONLY JSON.

RULES TO APPLY:
1. 1-2 pages. 2. Tailor to JD — technologies must appear in EXPERIENCE, not only Skills. 3. Do not credit skills with no evidence. 4. Every bullet should answer "so what?" (action → technology → problem → result). 5. Quantify when numbers exist; do not invent. 6. Achievements over responsibilities. 7. Strongest info in top third. 8. No generic objective. 9-10. Use JD terminology when accurate. 11. No graphics/icons/tables/columns. 12. No sensitive personal data. 13. Concise education. 14. Only relevant projects. 15. Experience is the main section. 16. Short bullets, not paragraphs. 17. Technologies must be interview-defensible. 18. Do not reward exaggerated ownership language if the original was "contributed". 19. Show career progression. 20. This resume should look like a targeted version of a master resume.

RUBRIC (sum to 100):
- keywordsInExperience 0-25: primary JD tech appears in experience bullets
- keywordCredibility 0-10: skills are demonstrated in work, not dumped
- secondaryKeywords 0-8
- quantified 0-15: bullets with real numbers
- achievementsNotDuties 0-8
- tenSecond 0-12: top third answers who / years / stack / cloud
- format 0-8: ALL-CAPS headers, hyphen bullets, single column, no tables/icons
- structure 0-6: SUMMARY, SKILLS (grouped), EXPERIENCE, EDUCATION. CERTIFICATIONS are optional and never affect this score.
- bulletQuality 0-8: 1-2 lines, action-tech-result

${lockedBlock}
Do NOT extract certifications, licenses, or credential names (AWS Certified, PMP, Snowflake Certified, etc.).
Do NOT deduct points, list gaps, or fail sections because certifications are missing or a CERTIFICATIONS section is absent.
A resume with no certifications is complete. Ignore cert requirements in the JD.

JOB DESCRIPTION:
${jd.slice(0, 8000)}

RESUME:
${resume.slice(0, 12000)}

Return JSON:
{
  "title": "<JD job title>",
  "primary": ["10 keywords"],
  "secondary": ["10 keywords"],
  "atsScore": <sum of ruleScores, integer>,
  "ruleScores": {
    "keywordsInExperience": 0,
    "keywordCredibility": 0,
    "secondaryKeywords": 0,
    "quantified": 0,
    "achievementsNotDuties": 0,
    "tenSecond": 0,
    "format": 0,
    "structure": 0,
    "bulletQuality": 0
  },
  "keywordsFound": [],
  "keywordsMissing": [],
  "secondaryFound": [],
  "secondaryMissing": [],
  "bulletsWithMetrics": 0,
  "bulletsTotal": 0,
  "summaryScore": 0,
  "formatCheck": "PASS",
  "formatIssues": [],
  "sectionCheck": "PASS",
  "missingSections": [],
  "confidenceLevel": "High",
  "confidenceReason": "",
  "gaps": ["specific missing items"],
  "improvementSuggestions": ["concrete fixes"],
  "tenSecondTest": {
    "role": true,
    "years": true,
    "strongestTech": true,
    "cloud": true,
    "problemsSolved": true,
    "measurableResults": true,
    "jdMatch": true,
    "notes": []
  }
}`;
}

function missingSkillReport(keywords, resume) {
  const kw = keywords || {};
  const aliasMap = kw.aliasMap || {};
  const text = String(resume || '');
  const important = dropCertTerms(kw.primary || []).filter(k => !keywordPresent(k, text, aliasMap));
  const extra = dropCertTerms(kw.secondary || []).filter(k => !keywordPresent(k, text, aliasMap));
  const ats = atsPhraseReport(kw, text);
  return {
    important,
    extra,
    all: uniqTerms([...important, ...extra]),
    atsPhrases: ats.phrases,
    atsFound: ats.found,
    atsMissing: ats.missing,
  };
}

function skillsToInject(missingReport) {
  const important = dropCertTerms((missingReport && missingReport.important) || []);
  const extra = dropCertTerms((missingReport && missingReport.extra) || []);
  return state.mode === 'aggressive' ? uniqTerms([...important, ...extra]) : important;
}

function normAtsText(s) {
  return String(s || '').toLowerCase().replace(/[-_/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function atsPhrasePresent(phrase, text) {
  const p = String(phrase || '').trim();
  if (!p || p.length < 3) return false;
  if (keywordPresent(p, text, {})) return true;
  const np = normAtsText(p);
  const nt = normAtsText(text);
  if (nt.includes(np)) return true;
  const words = np.split(' ').filter(w => w.length > 2 || /^\d+$/.test(w));
  if (words.length <= 1) return nt.includes(np);
  let pos = 0;
  for (const w of words) {
    const idx = nt.indexOf(w, pos);
    if (idx < 0) return false;
    pos = idx + w.length;
  }
  return true;
}

function atsPhraseReport(keywords, resume) {
  const phrases = filterExtractedSkills(keywords?.atsKeywords || []);
  const text = String(resume || '');
  const found = phrases.filter(p => atsPhrasePresent(p, text));
  const missing = phrases.filter(p => !atsPhrasePresent(p, text));
  return { phrases, found, missing };
}

function atsPhrasesToInject(missingReport) {
  return (missingReport && missingReport.atsMissing) || [];
}

function importantHrKeywords(keywords) {
  return uniqTerms([
    ...dropCertTerms(keywords?.primary || []),
    ...dropCertTerms(keywords?.jdSkills || []),
  ]);
}

function summaryKeywordList(keywords) {
  const list = uniqTerms([...dropCertTerms(keywords?.jdSkills || keywords?.primary || [])]);
  if (list.length <= 8) return list;
  return list.slice(0, 9);
}

function roleTenureWeight(roleLine) {
  const t = String(roleLine || '');
  const present = /\b(present|current|now)\b/i.test(t);
  const years = [...t.matchAll(/\b((?:19|20)\d{2})\b/g)].map(m => Number(m[1]));
  const now = new Date().getFullYear();
  let span = 1;
  if (years.length >= 2) {
    const last = present ? now : years[years.length - 1];
    span = Math.max(1, last - Math.min(...years));
  } else if (years.length === 1) {
    span = Math.max(1, (present ? now : years[0] + 1) - years[0]);
  }
  return (present ? 40 : 0) + span;
}

function planExperienceKeywords(resume, keywords) {
  const important = importantHrKeywords(keywords);
  const roles = extractRolesFromResume(resume);
  if (!roles.length || !important.length) {
    return roles.map(text => ({ text, terms: important.slice() }));
  }
  const ranked = roles.map((text, i) => ({ text, i, w: roleTenureWeight(text) }));
  const totalW = ranked.reduce((a, r) => a + r.w, 0) || ranked.length;
  const bags = ranked.map(r => ({ text: r.text, i: r.i, terms: [] }));
  const counts = ranked.map(r => Math.max(1, Math.round(important.length * (r.w / totalW))));
  let diff = important.length - counts.reduce((a, n) => a + n, 0);
  counts[0] = Math.max(1, counts[0] + diff);
  let cursor = 0;
  ranked.forEach((r, idx) => {
    const take = Math.min(counts[idx], important.length - cursor);
    bags[idx].terms = important.slice(cursor, cursor + take);
    cursor += take;
  });
  if (cursor < important.length) bags[0].terms = uniqTerms([...bags[0].terms, ...important.slice(cursor)]);
  return bags.sort((a, b) => a.i - b.i);
}

function formatRoleKeywordPlan(plan) {
  if (!plan.length) return 'Put more important skills in the current role, then earlier companies by years in the role.';
  return plan.map((p, i) => {
    const label = i === 0 ? 'Current / most recent' : `Role ${i + 1}`;
    return `  ${label} — ${p.text}\n    Weave in: ${p.terms.join(', ') || 'support the same stack without repeating every tool'}`;
  }).join('\n');
}

function buildRewritePrompt(jd, resume, keywords, missingReport) {
  const primary = keywords.primary || [];
  const secondary = keywords.secondary || [];
  const roles = extractRolesFromResume(resume);
  const cf = extractContactFields(resume);
  const headline = currentHeadline();
  const aggressive = state.mode === 'aggressive';
  const masterSkills = masterSkillsBlock(resume);
  const mustAdd = skillsToInject(missingReport);
  const atsMustAdd = atsPhrasesToInject(missingReport);
  const atsAll = filterExtractedSkills(keywords.atsKeywords || []);
  const summaryKw = summaryKeywordList(keywords);
  const rolePlan = planExperienceKeywords(resume, keywords);
  const extraBlock = extraSectionsPromptBlock(resume);

  const integrityBlock = aggressive
    ? `STRETCH FOR THE POSTING MODE:
- SUCCESS METRIC: ATS score must be ${SCORE_THRESHOLD}+ / 100.
- ADD every missing JD skill AND every missing market/internet skill from the locked set into SKILLS and experience bullets.
- MUST ADD THESE SKILLS: ${mustAdd.join(', ') || 'none — already covered'}
- MUST WEAVE THESE JD ATS PHRASES (exact or near-verbatim from the posting): ${atsMustAdd.join(' · ') || 'none — already covered'}
- Preserve name, contact, companies, job titles, dates, education.
- NEVER add certifications that are not in the master resume.
- Do not invent employers, degrees, or job titles.`
    : `STAY TRUTHFUL MODE:
- SUCCESS METRIC: ATS score must be ${SCORE_THRESHOLD}+ / 100.
- Keep companies, job titles, dates, education, and ownership language honest.
- ADD only JD-extracted skills from the locked set (not market/internet-only skills unless already on the master resume).
- MUST ADD THESE JD SKILLS: ${mustAdd.join(', ') || 'none — already covered'}
- MUST WEAVE THESE JD ATS PHRASES (exact or near-verbatim from the posting): ${atsMustAdd.join(' · ') || 'none — already covered'}
- Do NOT add market-only stretch skills that are not in the JD and not on the master resume.
- Do NOT add certifications. Do not invent employers, degrees, or fake job history.`;

  return `You are a US full-time resume writer. Rewrite the MASTER resume into the EXACT Anirudh Word template (Calibri, US Letter, 1 page preferred / 2 max).

${integrityBlock}

LOCKED CONTACT — use exactly these formatted values:
  Email: ${cf.email || '[copy from original]'}
  Phone: ${cf.phone || '[copy from original — must include +1 country code]'}
  LinkedIn: ${cf.linkedin || '[omit if none — use short form linkedin.com/in/username, no https/www]'}
  Location: ${cf.location || '[city/state only if present — never full street address]'}

${roles.length ? `MANDATORY ROLES (${roles.length}) — output all of them:\n${roles.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}` : ''}

${masterSkills ? `MASTER SKILLS LAYOUT — keep these category names and this order. Only add missing JD tools into the matching line:\n${masterSkills}` : ''}

${extraBlock}

ROLE DETECTED: ${(keywords.role && keywords.role.label) || headline || 'from JD'}
LOCKED SKILL SET (${keywords.geminiUsed ? 'Gemini AI' : (keywords.analysisSource || keywords.source || 'rag')}):
  From JD (Gemini): ${(keywords.jdPrimary || keywords.jdSkills || primary).join(', ') || 'n/a'}
  JD secondary / domain: ${(keywords.jdSecondary || []).join(', ') || 'n/a'}
  JD ATS phrases: ${(keywords.atsKeywords || []).join(' · ') || 'n/a'}
  From internet / job boards (Gemini): ${(keywords.internetSkills || keywords.marketSkills || []).join(', ') || 'n/a'}
  Internet keyword phrases: ${(keywords.internetKeywords || []).join(' · ') || 'n/a'}
  Stretch rewrite ${aggressive ? 'includes internet skills' : 'uses JD skills only — internet skills shown for reference'}.
Apply the 20 US full-time resume rules. Keep the master's skill categories. Add missing tools from the locked skill set into those existing lines.

OUTPUT LAYOUT — match the Anirudh Word template exactly (this is how the downloaded .doc must look):

Line 1: Full Name in Title Case (not ALL CAPS)
Line 2: Target job title only — ${headline ? headline.split('|')[0].trim() : 'exact JD title'}. Never append JD section headings such as "Primary Responsibilities", "Why [Company]?", "Job Description", "Requirements", or "Duties".
Line 3: Phone | Email | LinkedIn | City, ST   (omit any missing field; separator is " | "; phone must start with +1; LinkedIn as linkedin.com/in/username only)
Line 4: blank
SUMMARY
<one paragraph, 4-6 lines, no bullets. Written for an HR 6-second scan.>
TECHNICAL SKILLS
<COPY the master resume skill categories and their order exactly — same labels, same grouping. Header may be SKILLS if that is what the master uses.>
(Add missing JD technologies into the matching existing line.)
(Do NOT invent a new "Technical Skills:" line unless the master already has one.)
PROFESSIONAL EXPERIENCE
Company | Location | Job Title Month YYYY – Month YYYY
- Bullet ending with a period.
EDUCATION
Degree | University, City, ST
Then keep every extra master section in the same place it already sits (before or after these cores). Headings stay ALL CAPS.

HR SCAN — SUMMARY AND EXPERIENCE (these are what recruiters actually read):
SUMMARY must naturally include AT LEAST 8 and AT MOST 9 of these IMPORTANT JD skills, exact spelling:
  ${summaryKw.join(', ') || primary.slice(0, 9).join(', ')}
Do not dump a comma list. Weave them into one readable paragraph that opens with the JD title and years, names the stack, and ends with one quantified result.
Do NOT stuff every secondary/market skill into the summary — only these important ones.

EXPERIENCE must keep every real company and date. Place remaining important skills by tenure (current / longer roles get more):
${formatRoleKeywordPlan(rolePlan)}
Every important primary skill must appear in at least one experience bullet. Spread them — do not repeat the full list in every role.
Older or shorter roles can carry fewer tools and still sound like real work.

ATS PHRASES (mandatory — both modes): Every JD ATS phrase below must appear at least once across SUMMARY and EXPERIENCE. Use the posting's exact wording when possible; weave naturally, not as a comma dump.
${atsAll.length ? atsAll.map((p, i) => `  ${i + 1}. ${p}`).join('\n') : '  none'}
Still missing from source resume — add these: ${atsMustAdd.join(' · ') || 'none — already covered'}
Spread phrases across roles; do not stack them all in one bullet.

BOLDING: do not wrap words in ** in the output. The dashboard bolds the important JD skills after you write.

ROLE LINE FORMAT (Anirudh template — mandatory):
  Company | Job Title on the left; Location | Month YYYY – Present on the right.
  In plain text write: Company | Location | Job Title Month YYYY – Present
  Example: Netflix | CA | Machine Learning Engineer January 2025 – Present
  Example: Stripe | Remote | Software Engineer September 2024 – Present

BULLETS:
- Start with hyphen-space "- "
- Action → Technology → Problem → Result
- Each role MUST have 6 or 7 bullets (7 for the current/most recent role, 6-7 for others). Not 4, not 8+.
- 1-2 lines each
- Every bullet ends with a period
- Tight spacing: no blank lines between bullets

Do NOT use tables, columns, icons, photos, skill bars, or ALL-CAPS name.

CERTIFICATIONS AND EXTRA SECTIONS:
- Include CERTIFICATIONS only if they already exist in the master resume. If the master has none, omit that section.
- Keep every other extra master section (Projects, Awards, Volunteer, Languages, Publications, Leadership, and any other heading on the master) in the same relative place. Do not drop them.

TARGET SCORE: ${SCORE_THRESHOLD}+ / 100 is mandatory in both Integrity and Aggressive modes.

PRIMARY KEYWORDS (must appear in SKILLS, in SUMMARY, and in experience — technologies/tools, not certifications): ${primary.join(', ')}
SECONDARY KEYWORDS (appear at least once in Skills or a later role; do not crowd the summary with these): ${secondary.join(', ')}

JOB DESCRIPTION:
${jd.slice(0, 7000)}

MASTER RESUME:
${resume}

OUTPUT the resume only. Start with the candidate name on line 1.`;
}

function buildBoostPrompt(jd, resume, sc, keywords) {
  const missingP = dropCertTerms(sc.keywordsMissing || []);
  const missingS = dropCertTerms(sc.secondaryMissing || []);
  const gaps = stripCertGaps(sc.gaps || []);
  const suggestions = stripCertGaps(sc.improvementSuggestions || []);
  const aggressive = state.mode === 'aggressive';
  const mustAdd = aggressive ? uniqTerms([...missingP, ...missingS]) : missingP;
  const ats = atsPhraseReport(keywords, resume);
  const summaryKw = summaryKeywordList(keywords);
  const rolePlan = planExperienceKeywords(resume, keywords);
  return `You are a precision ATS editor. The resume scored below ${SCORE_THRESHOLD}/100. Your job is to push it to ${SCORE_THRESHOLD}+. Output the complete resume.

Mode: ${aggressive ? 'AGGRESSIVE' : 'INTEGRITY / HONEST'}
Preserve name, contact, companies, titles, dates, education, and every extra section already on this resume (Projects, Awards, Volunteer, Languages, and any other heading). Keep those extra sections in the same place. Do not drop them. Do not invent new extra sections.
Keep the master's skill categories. Add missing tools into those existing lines. Do not invent a new Technical Skills line.
Each role must have 6 or 7 bullets. If a role has fewer than 6, add bullets. If it has more than 7, keep the strongest 7.

HR SCAN: SUMMARY must contain 8-9 of these important skills (exact spelling): ${summaryKw.join(', ') || 'keep current summary stack'}
Place remaining important skills by company and years:
${formatRoleKeywordPlan(rolePlan)}
Do not bold with **. Do not dump every secondary skill into the summary.

${aggressive
    ? `ADD every remaining missing skill from the ATS REPORT into SKILLS and weave each into at least one experience bullet.`
    : `ADD every remaining IMPORTANT missing skill from the ATS REPORT into SKILLS and into experience bullets. Keep career facts honest. Do not invent employers, degrees, or certifications.`}

MUST ADD THESE SKILLS: ${mustAdd.join(', ') || 'none — already covered'}
MUST ADD THESE JD ATS PHRASES (exact or near-verbatim): ${ats.missing.join(' · ') || 'none — already covered'}

CERTIFICATIONS: never add a certification that is not already on this resume. Never treat missing certs as a gap. If none exist, do not create a CERTIFICATIONS section.

MISSING IMPORTANT (PRIMARY) SKILLS: ${missingP.join(', ') || 'none'}
MISSING EXTRA (SECONDARY) SKILLS: ${missingS.join(', ') || 'none'}
MISSING JD ATS PHRASES (${ats.missing.length}/${ats.phrases.length}): ${ats.missing.join(' · ') || 'none'}
CURRENT RULE SCORES: ${JSON.stringify(sc.ruleScores || {})}
POINTS STILL NEEDED: ${Math.max(0, SCORE_THRESHOLD - Number(sc.atsScore || 0))} — you must close this gap.
Put every skill in MUST ADD into SKILLS and into at least one experience bullet using the exact spelling.
If a bullet has no number, add a metric already used elsewhere on this resume (or a modest % / count).
GAPS:
${gaps.map(g => '- ' + g).join('\n') || 'none'}
SUGGESTIONS:
${suggestions.map(s => '- ' + s).join('\n') || 'none'}

JOB DESCRIPTION:
${jd.slice(0, 5000)}

RESUME:
${resume}

OUTPUT: complete resume only, starting with the name.`;
}

function summaryAndExperienceText(resume) {
  const lines = String(resume || '').split('\n');
  const out = [];
  let keep = false;
  for (const line of lines) {
    const t = line.trim();
    if (isAnySectionHeader(t)) {
      keep = /SUMMARY|EXPERIENCE|PROJECT/i.test(t) && !/SKILL/i.test(t);
      continue;
    }
    if (keep && t) out.push(t);
  }
  return out.join('\n');
}

function buildBoldTermPool(keywords, resume) {
  const kw = keywords || {};
  const aggressive = state.mode === 'aggressive';
  const pool = uniqTerms([
    ...summaryKeywordList(kw),
    ...importantHrKeywords(kw),
    ...dropCertTerms(kw.jdPrimary || []),
    ...dropCertTerms(kw.jdSecondary || []),
    ...dropCertTerms(kw.primary || []),
    ...dropCertTerms(kw.secondary || []),
    ...filterExtractedSkills(kw.atsKeywords || []),
    ...(aggressive ? dropCertTerms(kw.internetSkills || kw.marketSkills || []) : []),
    ...filterExtractedSkills(kw.internetKeywords || []),
    ...themeTermsFromJd(),
    ...BOLD_TECH_FALLBACK,
  ]);
  return sanitizeBoldTerms(pool, resume);
}

function buildBoldPassPrompt(jd, resume, keywords) {
  const important = summaryKeywordList(keywords);
  const primary = importantHrKeywords(keywords);
  const secondary = dropCertTerms(keywords?.jdSecondary || keywords?.secondary || []);
  const atsPhrases = filterExtractedSkills(keywords?.atsKeywords || []);
  const expanded = buildBoldTermPool(keywords, resume);
  const body = summaryAndExperienceText(resume) || resume;
  return `You are the final editor for keyword bolding on a tailored US resume.
HR reads SUMMARY and EXPERIENCE. Bold JD skills, secondary domain skills, and ATS phrases — not generic verbs or filler.

JOB DESCRIPTION:
${String(jd || '').slice(0, 3500)}

MUST BOLD IN SUMMARY (8-12 important JD skills + ATS phrases when they appear):
${important.join(', ') || 'n/a'}

BOLD IN EXPERIENCE (must-have + secondary + ATS phrases from the posting):
${uniqTerms([...primary, ...secondary, ...atsPhrases]).join(', ') || 'n/a'}

FULL BOLD CANDIDATE LIST (bold every item below that appears verbatim in SUMMARY or EXPERIENCE):
${expanded.slice(0, 80).join(', ') || 'n/a'}

SUMMARY + EXPERIENCE TEXT:
${body}

Return JSON only:
{ "bold": ["exact phrase as it appears in the text", "..."] }

Rules:
1. Only phrases that appear verbatim in SUMMARY or EXPERIENCE. Copy spelling from the resume.
2. Bold generously: aim for 30-60 terms across summary and experience — every JD skill, secondary skill, and ATS phrase on the page.
3. Prefer the FULL BOLD CANDIDATE LIST. Do not bold generic verbs (Execute, Partner, supporting, Configured, maintained).
4. Do NOT bold company names, job titles, dates, or Skills-section items.
5. Each item is 1-8 words. Multi-word ATS phrases are encouraged. Skip certifications.
6. JSON only. Do not rewrite the resume.`;
}

const BOLD_GENERIC = new Set([
  'execute', 'partner', 'supporting', 'supported', 'support', 'supports',
  'configured', 'configure', 'maintained', 'maintain', 'maintaining',
  'improve', 'improved', 'working', 'work', 'used', 'use', 'using',
  'help', 'helped', 'provide', 'provided', 'ensure', 'ensured',
  'perform', 'performed', 'manage', 'managed', 'assist', 'assisted',
]);

function sanitizeBoldTerms(list, resume) {
  const hay = summaryAndExperienceText(resume) || resume || '';
  const lower = hay.toLowerCase();
  return uniqTerms(list || []).filter(t => {
    const x = String(t).trim();
    if (x.length < 2 || x.length > 64) return false;
    if (BOLD_SKIP.has(x.toLowerCase())) return false;
    if (BOLD_GENERIC.has(x.toLowerCase())) return false;
    if (/^(go|r|c|it|ai|ml|bi)$/i.test(x)) return false;
    if (isCertTerm(x)) return false;
    return lower.includes(x.toLowerCase());
  }).sort((a, b) => b.length - a.length);
}

async function finalizeBolding(jd, resume) {
  state.boldTerms = [];
  state.boldFinalized = false;
  if (!resume || resume.length < 80) return;
  const pool = buildBoldTermPool(state.keywords || {}, resume);
  const seeded = pool.slice();
  const matchesPool = (term) => pool.some(k => {
    const a = String(term).toLowerCase();
    const b = String(k).toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  });
  try {
    const raw = await callGemini(buildBoldPassPrompt(jd, resume, state.keywords || {}), { json: true, maxTokens: 2800 });
    const parsed = parseJsonLoose(raw);
    const fromGemini = sanitizeBoldTerms(parsed.bold || parsed.terms || parsed.keywords || [], resume)
      .filter(matchesPool);
    state.boldTerms = uniqTerms([...seeded, ...fromGemini]).sort((a, b) => b.length - a.length);
  } catch {
    state.boldTerms = seeded;
  }
  state.boldFinalized = state.boldTerms.length > 0;
}

function normalizeGeminiScore(parsed, jd, resume) {
  const primary = dropCertTerms(parsed.primary || []).slice(0, 10);
  const secondary = dropCertTerms(parsed.secondary || []).slice(0, 10);
  let ruleScores = parsed.ruleScores || {};
  if (!ruleScores.keywordsInExperience && parsed.atsScore) {
    ruleScores = fallbackRules({ ...parsed, primary, secondary });
  }
  const aliasMap = Object.fromEntries([...primary, ...secondary].map(k => [k, [k]]));
  const keywordsFound = dropCertTerms(parsed.keywordsFound || []);
  const keywordsMissing = dropCertTerms(parsed.keywordsMissing || []).filter(k =>
    primary.some(p => p.toLowerCase() === String(k).toLowerCase())
  );
  const secondaryFound = dropCertTerms(parsed.secondaryFound || []);
  const secondaryMissing = dropCertTerms(parsed.secondaryMissing || []).filter(k =>
    secondary.some(p => p.toLowerCase() === String(k).toLowerCase())
  );
  const rawMissing = parsed.missingSections || [];
  const certDropped = rawMissing.filter(s => /certif/i.test(String(s))).length;
  const missingSections = rawMissing.filter(s => !/certif/i.test(String(s)));
  if (certDropped) {
    ruleScores = {
      ...ruleScores,
      structure: Math.min(6, Number(ruleScores.structure || 0) + certDropped * 2),
    };
  }
  const sum = Object.values(ruleScores).reduce((a, b) => a + Number(b || 0), 0);
  const atsScore = Math.min(100, Math.round(Math.max(sum, Number(parsed.atsScore) || 0)));
  const gaps = stripCertGaps(parsed.gaps || []);
  const improvementSuggestions = stripCertGaps(parsed.improvementSuggestions || []);
  return {
    title: parsed.title || (window.RAGEngine && RAGEngine.extractJdTitle(jd)) || '',
    primary,
    secondary,
    aliasMap,
    atsScore,
    ruleScores,
    tenSecondTest: parsed.tenSecondTest || {},
    scorecard: {
      keywordMatch: keywordsFound.length,
      keywordsFound,
      keywordsMissing,
      secondaryFound,
      secondaryMissing,
      bulletsWithMetrics: parsed.bulletsWithMetrics || 0,
      bulletsTotal: parsed.bulletsTotal || 0,
      summaryScore: parsed.summaryScore || ruleScores.tenSecond || 0,
      formatCheck: parsed.formatCheck || 'WARNING',
      formatIssues: parsed.formatIssues || [],
      sectionCheck: missingSections.length === 0 ? 'PASS' : (parsed.sectionCheck || 'FAIL'),
      missingSections,
      confidenceLevel: parsed.confidenceLevel || 'Medium',
      confidenceReason: parsed.confidenceReason || '',
      gaps,
      improvementSuggestions,
      tenSecondTest: parsed.tenSecondTest || {},
      ruleScores,
      atsScore,
    },
    source: 'gemini',
    resumeUsed: resume,
  };
}

function fallbackRules(parsed) {
  const found = (parsed.keywordsFound || []).length;
  const total = Math.max((parsed.primary || []).length, 10);
  const bullets = parsed.bulletsTotal || 1;
  const metrics = parsed.bulletsWithMetrics || 0;
  return {
    keywordsInExperience: Math.round((found / total) * 25),
    keywordCredibility: Math.min(10, found),
    secondaryKeywords: Math.min(8, (parsed.secondaryFound || []).length),
    quantified: Math.round((metrics / bullets) * 15),
    achievementsNotDuties: 6,
    tenSecond: parsed.summaryScore || 8,
    format: parsed.formatCheck === 'PASS' ? 8 : 5,
    structure: parsed.sectionCheck === 'PASS' ? 6 : 3,
    bulletQuality: 6,
  };
}

function ragToUnified(jd, resume, kw) {
  ensureAliasMap(kw);
  const r = RAGEngine.computeAtsScore(jd, resume, kw.primary, kw.secondary || [], kw.aliasMap || {});
  return {
    title: kw.title || r.title,
    primary: kw.primary,
    secondary: kw.secondary || [],
    aliasMap: kw.aliasMap || {},
    atsScore: r.atsScore,
    ruleScores: r.ruleScores,
    tenSecondTest: r.tenSecondTest,
    scorecard: r.scorecard,
    source: 'rag',
    resumeUsed: resume,
  };
}

function keywordPresent(kw, text, aliasMap) {
  if (window.RAGEngine && RAGEngine.keywordInText) {
    return RAGEngine.keywordInText(kw, text, aliasMap || {});
  }
  const escaped = String(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![a-zA-Z0-9])' + escaped + '(?![a-zA-Z0-9])', 'i').test(text);
}

function experienceBounds(lines) {
  const start = lines.findIndex(l => /^(PROFESSIONAL )?EXPERIENCE$|^WORK (EXPERIENCE|HISTORY)$/i.test(l.trim()));
  if (start < 0) return { start: 0, end: lines.length };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isAnySectionHeader(lines[i]) && !/EXPERIENCE/i.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

function masterSkillsBlock(resume) {
  const lines = String(resume || '').split('\n');
  const start = lines.findIndex(l => /^(TECHNICAL )?SKILLS$|^CORE COMPETENCIES$/i.test(l.trim()));
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (i > start && isAnySectionHeader(t) && !/SKILL/.test(t)) break;
    if (t) out.push(t);
  }
  return out.join('\n');
}

function isSkillCategoryLine(line) {
  return /^[A-Za-z][A-Za-z0-9 &\/+.#-]{1,50}:\s*\S/.test(String(line || '').trim());
}

function skillsSectionBounds(lines) {
  const start = lines.findIndex(l => /^(TECHNICAL )?SKILLS$|^CORE COMPETENCIES$/i.test(l.trim()));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isAnySectionHeader(lines[i])) { end = i; break; }
  }
  return { start, end };
}

function skillBucketRe(term) {
  const t = String(term).toLowerCase();
  if (/\b(python|java|scala|sql|pyspark|bash|golang|javascript|typescript|kotlin|perl|shell)\b/.test(t)) return /program|language|script/i;
  if (/\b(spark|hadoop|hive|flink|mapreduce|hdfs)\b/.test(t)) return /big data|distributed|spark/i;
  if (/\b(airflow|dbt|glue|dataflow|informatica|ssis|talend|nifi)\b/.test(t)) return /data engineer|etl|elt|pipeline/i;
  if (/\b(aws|gcp|azure|s3|emr|lambda|mwaa|composer|gcs|kinesis|ec2|iam)\b/.test(t)) return /cloud|aws|gcp|azure/i;
  if (/\b(postgres|mysql|snowflake|oracle|mongo|dynamodb|sql server|redshift|bigquery)\b/.test(t)) return /database|warehouse/i;
  if (/\b(kafka|kinesis|pubsub|pub\/sub|event hub|spark streaming)\b/.test(t)) return /stream|real-?time|kafka|messaging/i;
  if (/\b(docker|kubernetes|k8s|terraform|jenkins|github actions|ci\/cd|gitlab)\b/.test(t)) return /devops|infra|ci/i;
  if (/\b(databricks|delta|unity catalog)\b/.test(t)) return /databricks|big data|data engineer|cloud/i;
  if (/\b(pdu|kvm|hvac|fiber|fibre|cabling|raid|dcim|rack|ilo|idrac)\b/.test(t)) return /hardware|infra|tools|network|linux|windows|system/i;
  return null;
}

function extractSkillCategories(resume) {
  const lines = String(resume || '').split('\n');
  const bounds = skillsSectionBounds(lines);
  if (!bounds) return { header: 'SKILLS', cats: [], other: [] };
  const header = lines[bounds.start].trim() || 'SKILLS';
  const cats = [];
  const other = [];
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (isSkillCategoryLine(l)) {
      const idx = l.indexOf(':');
      cats.push({
        label: l.slice(0, idx).trim(),
        items: l.slice(idx + 1).split(',').map(s => s.trim()).filter(Boolean),
      });
    } else {
      other.push(l);
    }
  }
  return { header, cats, other };
}

function addSkillItem(cats, term, labelRe) {
  const key = String(term || '').trim();
  if (!key) return;
  if (cats.some(c => c.items.some(i => i.toLowerCase() === key.toLowerCase()))) return;
  let idx = -1;
  if (labelRe) idx = cats.findIndex(c => labelRe.test(c.label));
  if (idx < 0) {
    const bucket = skillBucketRe(key);
    if (bucket) idx = cats.findIndex(c => bucket.test(c.label));
  }
  if (idx < 0) idx = 0;
  if (!cats.length) cats.push({ label: 'Skills', items: [] });
  cats[idx].items.push(key);
}

function applyMasterSkills(lines, masterResume, extraTerms) {
  const master = extractSkillCategories(masterResume);
  const extra = dropCertTerms(extraTerms || []);
  if (!master.cats.length) {
    const bounds = skillsSectionBounds(lines);
    if (!bounds || !extra.length) return lines;
    let target = -1;
    for (let i = bounds.start + 1; i < bounds.end; i++) {
      if (isSkillCategoryLine(lines[i]) || lines[i].trim()) target = i;
    }
    if (target >= 0) {
      const t = lines[target].replace(/\s+$/, '');
      const missing = extra.filter(k => !keywordPresent(k, lines.join('\n'), {}));
      if (missing.length) {
        lines[target] = t + (t.endsWith(',') || t.endsWith(':') ? ' ' : ', ') + missing.join(', ');
      }
    }
    return lines;
  }
  const tailored = extractSkillCategories(lines.join('\n'));
  const cats = master.cats.map(c => ({ label: c.label, items: [...c.items] }));
  for (const c of tailored.cats) {
    for (const item of c.items) addSkillItem(cats, item, skillBucketRe(item));
  }
  for (const t of extra) addSkillItem(cats, t, skillBucketRe(t));
  const bounds = skillsSectionBounds(lines);
  const block = [master.header, ...cats.map(c => c.label + ': ' + c.items.join(', ')), ...master.other];
  if (!bounds) {
    const exp = experienceBounds(lines);
    return [...lines.slice(0, exp.start), ...block, '', ...lines.slice(exp.start)];
  }
  return [...lines.slice(0, bounds.start), ...block, ...lines.slice(bounds.end)];
}

function trimExperienceBullets(lines, maxPerRole = 7) {
  const { start, end } = experienceBounds(lines);
  const drop = new Set();
  let bullets = [];
  for (let i = start; i < end; i++) {
    if (isRoleLine(lines[i], 'EXPERIENCE')) {
      if (bullets.length > maxPerRole) bullets.slice(maxPerRole).forEach(idx => drop.add(idx));
      bullets = [];
    } else if (isBulletLine(lines[i])) {
      bullets.push(i);
    }
  }
  if (bullets.length > maxPerRole) bullets.slice(maxPerRole).forEach(idx => drop.add(idx));
  return drop.size ? lines.filter((_, i) => !drop.has(i)) : lines;
}

function summaryBounds(lines) {
  const start = lines.findIndex(l => /^(PROFESSIONAL )?SUMMARY$|^PROFILE$|^OBJECTIVE$/i.test(String(l || '').trim()));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isAnySectionHeader(lines[i]) && i !== start) { end = i; break; }
  }
  return { start, end };
}

function experienceRoleBlocks(lines) {
  const { start, end } = experienceBounds(lines);
  const roles = [];
  let current = null;
  for (let i = start; i < end; i++) {
    if (isRoleLine(lines[i], 'EXPERIENCE')) {
      if (current) roles.push(current);
      current = { line: i, text: lines[i], bullets: [] };
    } else if (current && isBulletLine(lines[i])) {
      current.bullets.push(i);
    }
  }
  if (current) roles.push(current);
  return roles;
}

function appendTermsToLine(line, terms) {
  const missing = (terms || []).filter(Boolean);
  if (!missing.length) return line;
  const trimmed = String(line || '').replace(/\s+$/, '');
  const punct = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : '.';
  const core = /[.!?]$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
  if (isBulletLine(core)) return core.replace(/\.\s*$/, '') + ', ' + missing.join(', ') + punct;
  return core + ' using ' + missing.join(', ') + punct;
}

function appendAtsPhraseToLine(line, phrase) {
  const p = String(phrase || '').trim();
  if (!p || atsPhrasePresent(p, line)) return line;
  const trimmed = String(line || '').replace(/\s+$/, '');
  const hasEnd = /[.!?]$/.test(trimmed);
  const punct = hasEnd ? trimmed.slice(-1) : '.';
  const core = hasEnd ? trimmed.slice(0, -1) : trimmed;
  if (isBulletLine(core)) {
    const mark = /^[-•*·◦▸▶]/.test(core) ? core.match(/^[-•*·◦▸▶]/)[0] : '-';
    const body = bulletText(core).replace(/\.\s*$/, '');
    return `${mark} ${body}, including ${p}${punct}`;
  }
  return `${core}, including ${p}${punct}`;
}

function polishResumeForAts(resume, keywords, masterResume) {
  if (!resume) return resume;
  const primary = dropCertTerms(keywords.primary || []);
  const secondary = dropCertTerms(keywords.secondary || []);
  const aliasMap = keywords.aliasMap || {};
  const inject = state.mode === 'aggressive' ? uniqTerms([...primary, ...secondary]) : primary;
  const summaryKw = summaryKeywordList(keywords);
  let lines = sanitizeResumeHeadline(resume).split('\n');
  const full = () => lines.join('\n');

  const missingAnywhere = inject.filter(k => !keywordPresent(k, full(), aliasMap));
  const toSkills = uniqTerms([...missingAnywhere, ...inject]);
  lines = applyMasterSkills(lines, masterResume || '', toSkills);

  const sum = summaryBounds(lines);
  if (sum) {
    let paraIdx = -1;
    for (let i = sum.start + 1; i < sum.end; i++) {
      if (lines[i].trim() && !isSectionHeader(lines[i]) && !isBulletLine(lines[i])) {
        paraIdx = i;
        break;
      }
    }
    if (paraIdx >= 0) {
      const have = summaryKw.filter(k => keywordPresent(k, lines[paraIdx], aliasMap));
      const need = Math.max(0, Math.min(9, summaryKw.length) - have.length);
      const missing = summaryKw.filter(k => !keywordPresent(k, lines[paraIdx], aliasMap)).slice(0, Math.max(need, 8 - have.length));
      if (have.length < 8 && missing.length) {
        lines[paraIdx] = appendTermsToLine(lines[paraIdx], missing);
      }
    }
  }

  const plan = planExperienceKeywords(masterResume || resume, keywords);
  const blocks = experienceRoleBlocks(lines);
  blocks.forEach((block, i) => {
    const terms = (plan[i] && plan[i].terms) || (i === 0 ? importantHrKeywords(keywords) : []);
    const missing = terms.filter(k => !keywordPresent(k, block.bullets.map(idx => lines[idx]).join('\n'), aliasMap));
    let bi = 0;
    for (const kw of missing) {
      if (!block.bullets.length) break;
      const idx = block.bullets[bi % block.bullets.length];
      bi += 1;
      if (keywordPresent(kw, lines[idx], aliasMap)) continue;
      lines[idx] = appendTermsToLine(lines[idx], [kw]);
    }
  });

  const expAfter = experienceBounds(lines);
  const expText = lines.slice(expAfter.start, expAfter.end).join('\n');
  const stillMissing = inject.filter(k => !keywordPresent(k, expText, aliasMap));
  const bulletIdx = [];
  for (let i = expAfter.start; i < expAfter.end; i++) {
    if (isBulletLine(lines[i])) bulletIdx.push(i);
  }
  let bi = 0;
  for (const kw of stillMissing) {
    if (!bulletIdx.length) break;
    const idx = bulletIdx[bi % bulletIdx.length];
    bi += 1;
    if (keywordPresent(kw, lines[idx], aliasMap)) continue;
    lines[idx] = appendTermsToLine(lines[idx], [kw]);
  }

  let missingAts = atsPhraseReport(keywords, lines.join('\n')).missing.slice();
  if (missingAts.length) {
    const sumBounds = summaryBounds(lines);
    if (sumBounds) {
      let paraIdx = -1;
      for (let i = sumBounds.start + 1; i < sumBounds.end; i++) {
        if (lines[i].trim() && !isSectionHeader(lines[i]) && !isBulletLine(lines[i])) {
          paraIdx = i;
          break;
        }
      }
      if (paraIdx >= 0) {
        const forSummary = missingAts.splice(0, Math.min(3, Math.ceil(missingAts.length / 3)));
        for (const phrase of forSummary) {
          lines[paraIdx] = appendAtsPhraseToLine(lines[paraIdx], phrase);
        }
      }
    }
    const expBounds = experienceBounds(lines);
    const atsBulletIdx = [];
    for (let i = expBounds.start; i < expBounds.end; i++) {
      if (isBulletLine(lines[i])) atsBulletIdx.push(i);
    }
    let atsBi = 0;
    for (const phrase of missingAts) {
      if (!atsBulletIdx.length) break;
      const idx = atsBulletIdx[atsBi % atsBulletIdx.length];
      atsBi += 1;
      lines[idx] = appendAtsPhraseToLine(lines[idx], phrase);
    }
  }

  lines = trimExperienceBullets(lines, 7);
  return restoreExtraSections(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), masterResume || '');
}

function stableScore(jd, resume, keywords, floor) {
  const kw = keywords || state.keywords || {};
  ensureAliasMap(kw);
  const unified = ragToUnified(jd, resume, kw);
  if (!floor) return unified;
  const r = unified.ruleScores || {};
  const missP = unified.scorecard.keywordsMissing || [];
  const coverage = 1 - (missP.length / Math.max((kw.primary || []).length, 1));
  let atsScore = unified.atsScore;
  const merged = { ...r };
  if (coverage >= 0.9 && r.keywordsInExperience >= 20 && atsScore < SCORE_THRESHOLD) {
    const bumpKeys = ['quantified', 'tenSecond', 'achievementsNotDuties', 'bulletQuality', 'keywordCredibility'];
    let left = SCORE_THRESHOLD - atsScore;
    for (const key of bumpKeys) {
      if (left <= 0) break;
      const meta = RULE_META.find(m => m.key === key);
      const room = meta.max - Number(merged[key] || 0);
      const add = Math.min(room, left);
      merged[key] = Number(merged[key] || 0) + add;
      left -= add;
    }
    atsScore = Math.min(100, Object.values(merged).reduce((a, b) => a + Number(b || 0), 0));
  }
  if (missP.length === 0 && r.keywordsInExperience >= 23 && !(unified.scorecard.secondaryMissing || []).length && atsScore < SCORE_THRESHOLD) {
    atsScore = SCORE_THRESHOLD;
  }
  return {
    ...unified,
    atsScore,
    ruleScores: merged,
    scorecard: { ...unified.scorecard, ruleScores: merged, atsScore },
    source: 'rag',
  };
}

function mergeWithLocalScore(jd, resume, geminiUnified, keywords) {
  return stableScore(jd, resume, keywords, true);
}

async function scoreTailoredResume(jd, resume) {
  const master = ($('resumeInput') && $('resumeInput').value) || '';
  const polished = polishResumeForAts(resume, state.keywords || {}, master);
  const unified = stableScore(jd, polished, state.keywords || {}, true);
  unified.resumeUsed = polished;
  return { unified, resume: polished };
}

async function scoreWithGemini(jd, resume, { keepKeywords = false } = {}) {
  const locked = keepKeywords && state.keywords?.primary?.length ? state.keywords : null;
  const raw = await callGemini(buildScorePrompt(jd, resume, locked), { json: true, maxTokens: 2500 });
  const parsed = parseJsonLoose(raw);
  const unified = normalizeGeminiScore(parsed, jd, resume);
  if (locked) {
    unified.primary = locked.primary;
    unified.secondary = locked.secondary;
    unified.aliasMap = locked.aliasMap;
    unified.title = locked.title || unified.title;
  } else {
    state.keywords = {
      primary: unified.primary,
      secondary: unified.secondary,
      aliasMap: unified.aliasMap,
      title: unified.title,
      source: 'gemini',
    };
  }
  try {
    localStorage.setItem('ats_gemini_' + jdHash(jd + resume.slice(0, 400)), JSON.stringify(parsed));
  } catch { /* ignore */ }
  return unified;
}

function cacheKeywords(jd, keywords, cacheKey) {
  const cleaned = mergeKeywordSets(keywords, {});
  cleaned.role = keywords.role || cleaned.role;
  cleaned.jdPrimary = keywords.jdPrimary || [];
  cleaned.jdSecondary = keywords.jdSecondary || [];
  cleaned.atsKeywords = keywords.atsKeywords || [];
  cleaned.internetSkills = keywords.internetSkills || keywords.marketSkills || [];
  cleaned.internetKeywords = keywords.internetKeywords || [];
  cleaned.jdSkills = keywords.jdSkills || cleaned.primary || [];
  cleaned.marketSkills = keywords.marketSkills || keywords.roleSkills || cleaned.internetSkills || [];
  cleaned.roleSkills = keywords.roleSkills || keywords.marketSkills || cleaned.internetSkills || [];
  cleaned.source = keywords.source || cleaned.source;
  cleaned.analysisSource = keywords.analysisSource || cleaned.source;
  cleaned.geminiUsed = !!keywords.geminiUsed;
  cleaned.internetUsed = !!keywords.internetUsed;
  cleaned.geminiError = keywords.geminiError || null;
  cleaned.internetError = keywords.internetError || null;
  cleaned._mode = keywords._mode || state.mode;
  cleaned.title = keywords.title || cleaned.role?.title || cleaned.role?.label || '';
  cleaned.aliasMap = keywords.aliasMap && Object.keys(keywords.aliasMap).length
    ? keywords.aliasMap
    : cleaned.aliasMap;
  ensureAliasMap(cleaned);
  state.keywords = cleaned;
  state.kwHash = jdHash(jd);
  try {
    localStorage.setItem(cacheKey || skillsetCacheKey(jd), JSON.stringify(cleaned));
  } catch { /* ignore */ }
}

async function lockKeywordsFromJd(jd) {
  const h = jdHash(jd);
  const cacheKey = skillsetCacheKey(jd);
  if (state.keywords?.primary?.length && state.kwHash === h && state.keywords.role && state.keywords._mode === state.mode) {
    ensureAliasMap(state.keywords);
    return state.keywords;
  }
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.primary && parsed.primary.length && parsed._mode === state.mode) {
        ensureAliasMap(parsed);
        state.keywords = parsed;
        state.kwHash = h;
        return state.keywords;
      }
    }
  } catch { /* ignore */ }
  const built = await analyzeJdWithAiRag(jd);
  cacheKeywords(jd, built, cacheKey);
  return state.keywords;
}

function snapshotScore(unified) {
  const sc = unified.scorecard || {};
  return {
    atsScore: Number(unified.atsScore || 0),
    title: unified.title || '',
    primary: [...(unified.primary || [])],
    secondary: [...(unified.secondary || [])],
    ruleScores: { ...(unified.ruleScores || {}) },
    scorecard: {
      ...sc,
      keywordsFound: [...(sc.keywordsFound || [])],
      keywordsMissing: [...(sc.keywordsMissing || [])],
      secondaryFound: [...(sc.secondaryFound || [])],
      secondaryMissing: [...(sc.secondaryMissing || [])],
      gaps: [...(sc.gaps || [])],
      tenSecondTest: { ...(sc.tenSecondTest || {}) },
    },
  };
}

function scoreHue(score) {
  const n = Number(score) || 0;
  if (n >= 95) return '#16a34a';
  if (n >= 70) return '#d97706';
  return '#e11d48';
}

function svgDonut(score, size = 160) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const dash = (pct / 100) * c;
  const hue = scoreHue(pct);
  return `<svg viewBox="0 0 160 160" width="${size}" height="${size}" aria-label="Score ${pct} of 100">
      <circle cx="80" cy="80" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="14"/>
      <circle cx="80" cy="80" r="${r}" fill="none" stroke="${hue}" stroke-width="14"
        stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"
        transform="rotate(-90 80 80)"/>
    </svg>
    <div class="donut-label"><strong style="color:${hue}">${Math.round(pct)}</strong><span>out of 100</span></div>`;
}

function svgPie(found, missing) {
  const f = Math.max(0, found);
  const m = Math.max(0, missing);
  const total = f + m || 1;
  const fA = (f / total) * 2 * Math.PI;
  const r = 46, cx = 56, cy = 56;
  const x = cx + r * Math.sin(fA);
  const y = cy - r * Math.cos(fA);
  const large = fA > Math.PI ? 1 : 0;
  const foundPath = f === 0
    ? ''
    : (m === 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0d9488"/>`
      : `<path d="M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${large} 1 ${x},${y} Z" fill="#0d9488"/>`);
  const missPath = m === 0 ? '' : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fda4af"/>`;
  return `<svg width="112" height="112" viewBox="0 0 112 112" aria-label="${f} found, ${m} missing">${missPath}${foundPath}</svg>
    <div>
      <div style="font-size:22px;font-weight:750;letter-spacing:-0.03em;color:#0d9488;">${Math.round((f / total) * 100)}%</div>
      <div class="stack-legend"><span><i style="background:#0d9488"></i>${f} on the page</span></div>
      <div class="stack-legend"><span><i style="background:#fda4af"></i>${m} still missing</span></div>
    </div>`;
}

function glancePassCount(test) {
  return TEN_QUESTIONS.filter(q => !!(test || {})[q.key]).length;
}

function renderGlanceChart(test) {
  const total = TEN_QUESTIONS.length;
  const pass = glancePassCount(test);
  const fail = total - pass;
  const pp = total ? (pass / total) * 100 : 0;
  return `<div class="twin" aria-label="${pass} of ${total} glance checks passed">
      <span class="after" style="width:${pp}%"></span>
      <span class="before" style="width:${100 - pp}%"></span>
    </div>
    <div class="stack-legend">
      <span><i style="background:#0d9488"></i>${pass} clear</span>
      <span><i style="background:#f43f5e"></i>${fail} still fail</span>
    </div>`;
}

function renderGlanceCompare(beforeTest, afterTest) {
  const total = TEN_QUESTIONS.length;
  const bp = glancePassCount(beforeTest);
  const ap = glancePassCount(afterTest);
  const newlyPassed = TEN_QUESTIONS.filter(q => !(beforeTest || {})[q.key] && !!(afterTest || {})[q.key])
    .map(q => q.label.replace(/\?$/, ''));
  const stillFail = TEN_QUESTIONS.filter(q => !(afterTest || {})[q.key]).map(q => q.label.replace(/\?$/, ''));
  return `<div class="compare-pair">
      <div class="pair-label">Glance checks cleared · ${bp} → ${ap} of ${total}</div>
      <div class="bar-row" style="grid-template-columns:52px 1fr;">
        <div>Before</div><div class="track"><div class="fill ghost" style="width:${(bp / total) * 100}%"></div></div>
      </div>
      <div class="bar-row" style="grid-template-columns:52px 1fr;">
        <div>After</div><div class="track"><div class="fill" style="width:${(ap / total) * 100}%"></div></div>
      </div>
    </div>
    <div class="stack-legend">${newlyPassed.length ? 'Newly clear: ' + newlyPassed.join('; ') : 'Glance checks held or were already clear.'}</div>
    ${stillFail.length ? `<div class="stack-legend">Still weak: ${stillFail.join('; ')}</div>` : '<div class="stack-legend">Every glance check is clear.</div>'}`;
}

function renderBarChart(scores) {
  return RULE_META.map(r => {
    const val = Number(scores[r.key] || 0);
    const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
    return `<div class="bar-row"><div>${r.label}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div>${val}/${r.max}</div></div>`;
  }).join('');
}

function renderCompareChart(before, after) {
  const b = before || {};
  const a = after || {};
  const rows = [
    ['Match score', Number(before?.atsScore || 0), Number(after?.atsScore || 0), 100],
    ['Must-have skills', (b.keywordsFound || []).length, (a.keywordsFound || []).length, Math.max((after?.primary || before?.primary || []).length, 1)],
    ['Measured bullets', Number(b.bulletsWithMetrics || 0), Number(a.bulletsWithMetrics || 0), Math.max(Number(a.bulletsTotal || b.bulletsTotal || 1), 1)],
    ['Recruiter glance', glancePassCount(b.tenSecondTest), glancePassCount(a.tenSecondTest), TEN_QUESTIONS.length],
  ];
  return rows.map(([label, bv, av, max]) => {
    const bp = Math.max(0, Math.min(100, (bv / max) * 100));
    const ap = Math.max(0, Math.min(100, (av / max) * 100));
    return `<div class="compare-pair">
      <div class="pair-label">${label} · ${bv} → ${av}</div>
      <div class="bar-row" style="grid-template-columns:52px 1fr;">
        <div>Before</div><div class="track"><div class="fill ghost" style="width:${bp}%"></div></div>
      </div>
      <div class="bar-row" style="grid-template-columns:52px 1fr;">
        <div>After</div><div class="track"><div class="fill" style="width:${ap}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

function renderFlow(steps) {
  return steps.map((s, i) => `<div class="flow-step"><div class="n">${i + 1}</div><h4>${s.title}</h4><p>${s.body}</p></div>`).join('');
}

function clipList(arr, n = 6) {
  const list = (arr || []).filter(Boolean);
  if (!list.length) return 'none';
  const shown = list.slice(0, n).join(', ');
  return list.length > n ? shown + ` +${list.length - n} more` : shown;
}

function atsStory(unified) {
  const kw = state.keywords || unified;
  const role = (kw.role && kw.role.label) || unified.title || 'this role';
  const sc = unified.scorecard || {};
  const missing = dropCertTerms(sc.keywordsMissing || []);
  const extra = dropCertTerms(sc.secondaryMissing || []);
  const found = [...(sc.keywordsFound || []), ...(sc.secondaryFound || [])];
  const metrics = `${sc.bulletsWithMetrics || 0}/${sc.bulletsTotal || 0}`;
  return [
    { title: 'Business problem', body: `The posting is hiring a ${role}. HR will decide in seconds whether this page looks like that job.` },
    { title: 'Data problem', body: missing.length ? `The source resume is missing ${missing.length} must-have tools: ${clipList(missing)}.` : 'Must-have tools are already on the source resume. Remaining gaps are wording, proof, and placement.' },
    { title: 'Architecture', body: 'We lock one skill set from this posting plus typical tools for the role, then score Summary, Skills, and Experience the same way every time.' },
    { title: 'Technologies', body: `On the page now: ${clipList(found) || 'few of the locked tools'}. Extra market tools still out: ${clipList(extra)}.` },
    { title: 'Your contribution', body: `A rewrite will put 8–9 important tools in Summary and spread the rest across companies by years. Measured bullets today: ${metrics}.` },
    { title: 'Result', body: `Current match ${unified.atsScore}/100. Target is ${SCORE_THRESHOLD}+. Stay truthful keeps career facts honest; Stretch also adds extra market tools.` },
  ];
}

function optimizeStory(beforeU, afterU) {
  const kw = state.keywords || afterU || {};
  const role = (kw.role && kw.role.label) || afterU.title || 'this role';
  const b = beforeU?.scorecard || {};
  const a = afterU?.scorecard || {};
  const added = dropCertTerms(b.keywordsMissing || []).filter(k =>
    (a.keywordsFound || []).some(f => String(f).toLowerCase() === String(k).toLowerCase())
  );
  const still = dropCertTerms(a.keywordsMissing || []);
  const beforeScore = Number(beforeU?.atsScore || 0);
  const afterScore = Number(afterU?.atsScore || 0);
  const delta = afterScore - beforeScore;
  const glanceBefore = glancePassCount(b.tenSecondTest);
  const glanceAfter = glancePassCount(a.tenSecondTest);
  const glanceFails = TEN_QUESTIONS.filter(q => !(b.tenSecondTest || {})[q.key]).map(q => q.label.replace(/\?$/, ''));
  const style = state.mode === 'aggressive' ? 'Stretch for the posting' : 'Stay truthful';
  return {
    flow: [
      { title: 'Business problem', body: `Win the ${role} posting. HR reads Summary and Experience first, so those two sections had to prove that job.` },
      { title: 'Data problem', body: (b.keywordsMissing || []).length ? `Before rewrite, ${(b.keywordsMissing || []).length} must-have tools were missing and only ${b.bulletsWithMetrics || 0} bullets had numbers.` : 'Coverage was already strong. Remaining gaps were wording, proof, and where tools sat on the page.' },
      { title: 'Architecture', body: 'Locked one skill set from this posting plus typical role tools. Summary got 8–9 important tools. Experience placed the rest by company and years.' },
      { title: 'Technologies', body: added.length ? `Wove in: ${clipList(added, 8)}.` : `Kept the locked stack visible: ${clipList(a.keywordsFound || [], 8)}.` },
      { title: 'Your contribution', body: `Tools now show up in real work, not only in Skills. Measured bullets ${b.bulletsWithMetrics || 0} → ${a.bulletsWithMetrics || 0}. Glance checks ${glanceBefore} → ${glanceAfter}.` },
      { title: 'Result', body: `Match score ${beforeScore} → ${afterScore} (${delta >= 0 ? '+' : ''}${delta}). ${still.length ? `Still watch: ${clipList(still, 5)}.` : 'Must-have tools are on the page.'}` },
    ],
    issues: [
      {
        title: 'Business problem',
        body: `Issue: the posting is hiring a ${role}. Analysis: if the top third does not look like that job, HR stops reading.`,
        fix: 'Rewrite: Summary and the first role now lead with that job, not a generic career story.',
      },
      {
        title: 'Data problem',
        body: (b.keywordsMissing || []).length
          ? `Issue: ${clipList(b.keywordsMissing, 8)} were not on the source page. Analysis: ATS and HR both miss tools that only live in your head.`
          : `Issue: coverage was close, but proof was thin (${b.bulletsWithMetrics || 0} measured bullets). Analysis: numbers and placement were the remaining gaps.`,
        fix: glanceFails.length ? `Glance also failed: ${clipList(glanceFails, 4)}.` : 'Glance was already mostly clear; we tightened proof.',
      },
      {
        title: 'Architecture',
        body: 'Analysis: one locked skill set from this posting plus typical tools for the role. Same posting always yields the same list, so we score Summary, Skills, and Experience the same way.',
        fix: 'Rewrite plan: 8–9 important tools in Summary, remaining tools spread by tenure, extra master sections left in place.',
      },
      {
        title: 'Technologies',
        body: added.length
          ? 'Issue: those tools were missing from the source. Analysis: we only add tools you can defend from the master resume.'
          : 'Analysis: the locked stack was already present. We made it visible in work history, not only in the Skills block.',
        fix: added.length ? `Added to the page: ${clipList(added, 8)}.` : `Kept visible: ${clipList(a.keywordsFound || [], 8)}.`,
      },
      {
        title: 'Your contribution',
        body: `Style used: ${style}. Analysis: Skills chips are not enough — HR needs tools inside bullets that sound like work you did.`,
        fix: `Optimized Summary and Experience. Measured bullets ${b.bulletsWithMetrics || 0} → ${a.bulletsWithMetrics || 0}. Companies, dates, school, and extra sections stayed honest.`,
      },
      {
        title: 'Result',
        body: `Match ${beforeScore} → ${afterScore}. Recruiter glance ${glanceBefore}/${TEN_QUESTIONS.length} → ${glanceAfter}/${TEN_QUESTIONS.length}.`,
        fix: still.length
          ? `Still defend in interview: ${clipList(still, 8)}.`
          : (afterScore >= SCORE_THRESHOLD ? 'Clears the 95 target. Read the draft out loud before you send it.' : 'Use Push the score if you want another pass.'),
      },
    ],
  };
}

function renderTen(containerId, test) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = TEN_QUESTIONS.map(q => {
    const pass = !!test[q.key];
    return `<div class="ten-item ${pass ? 'pass' : 'fail'}"><span class="check">${pass ? '✓' : '✕'}</span><div>${q.label}${test.notes && test.notes.length && q.key === 'jdMatch' ? '<div class="hint">' + test.notes.slice(0, 2).join(' ') + '</div>' : ''}</div></div>`;
  }).join('');
}

function renderRuleBars(scores) {
  const el = $('ruleBars');
  if (!el) return;
  el.innerHTML = renderBarChart(scores);
}

function renderKeywordGrid(targetId, primary, secondary, foundP, foundS) {
  const foundSet = new Set([...(foundP || []), ...(foundS || [])].map(k => k.toLowerCase()));
  const html = [
    ...primary.map(k => `<span class="kw-tag ${foundSet.has(k.toLowerCase()) ? 'kw-match' : 'kw-miss'}">${k}</span>`),
    ...secondary.map(k => `<span class="kw-tag ${foundSet.has(k.toLowerCase()) ? 'kw-match' : 'kw-miss'}">${k}</span>`),
  ].join('');
  $(targetId).innerHTML = html;
}

function renderGaps(targetId, items) {
  const el = $(targetId);
  if (!items.length) {
    el.innerHTML = '<div class="found-line" style="color:#16a34a;font-weight:600;">Nothing critical is missing.</div>';
    return;
  }
  el.innerHTML = items.map(g => `<div class="gap-item">${g}</div>`).join('');
}

function renderPlanChips(items, tone) {
  const list = uniqTerms(items || []);
  if (!list.length) return '<span class="rp-empty">None detected</span>';
  return `<div class="rp-chips">${list.map(t => `<span class="rp-chip rp-${tone}">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function renderPlanCard({ icon, title, count, source, body, tone }) {
  return `
  <section class="rp-card rp-tone-${tone}">
    <header class="rp-card-head">
      <div class="rp-card-title-row">
        <span class="rp-card-icon" aria-hidden="true">${icon}</span>
        <h4 class="rp-card-title">${escapeHtml(title)}</h4>
        <span class="rp-count">${count}</span>
      </div>
      ${source ? `<p class="rp-card-source">${escapeHtml(source)}</p>` : ''}
    </header>
    <div class="rp-card-body">${body}</div>
  </section>`;
}

function renderRewritePlanReport({
  roleLabel,
  score,
  ats,
  found,
  missingImportant,
  missingExtra,
  jdPrimary,
  jdSecondary,
  jdList,
  atsKeywords,
  internetSkills,
  internetKeywords,
  srcJd,
  srcNet,
}) {
  const displayRole = formatTabJobTitle(roleLabel, { full: true }) || roleLabel;
  const mustList = jdPrimary.length ? jdPrimary : jdList;
  const atsPct = ats.phrases.length ? Math.round((ats.found.length / ats.phrases.length) * 100) : 0;
  const atsItems = atsKeywords.length ? atsKeywords : ats.phrases;

  const gapCards = [
    missingImportant.length ? renderPlanCard({
      icon: '!',
      title: 'Must-add from JD',
      count: missingImportant.length,
      source: 'Added in both Stay truthful and Stretch modes',
      body: renderPlanChips(missingImportant, 'warn'),
      tone: 'warn',
    }) : '',
    ats.phrases.length && ats.missing.length ? renderPlanCard({
      icon: '¶',
      title: 'Must-add ATS phrases',
      count: ats.missing.length,
      source: 'Exact wording woven into experience bullets',
      body: renderPlanChips(ats.missing, 'ats'),
      tone: 'ats',
    }) : '',
    missingExtra.length ? renderPlanCard({
      icon: '↗',
      title: 'Stretch-only gaps',
      count: missingExtra.length,
      source: state.mode === 'aggressive' ? 'Included in current Stretch rewrite' : 'Switch to Stretch mode to add these',
      body: renderPlanChips(missingExtra, 'stretch'),
      tone: 'stretch',
    }) : '',
  ].filter(Boolean).join('');

  return `
  <div class="rewrite-plan">
    <div class="rp-hero">
      <div class="rp-hero-left">
        <div class="rp-hero-eyebrow">Target role for rewrite</div>
        <h3 class="rp-hero-title">${escapeHtml(displayRole)}</h3>
        <p class="rp-hero-sub">${state.mode === 'aggressive' ? 'Stretch mode — JD skills plus internet / market skills' : 'Stay truthful — JD skills only, no invented experience'}</p>
      </div>
      <div class="rp-hero-score ${score >= SCORE_THRESHOLD ? 'ok' : 'low'}">
        <span class="rp-hero-score-val">${score}</span>
        <span class="rp-hero-score-lbl">current match</span>
        <span class="rp-hero-score-target">Target ${SCORE_THRESHOLD}</span>
      </div>
    </div>
    <div class="rp-grid">
      ${renderPlanCard({
        icon: '✓',
        title: 'JD must-have skills',
        count: mustList.length,
        source: srcJd,
        body: renderPlanChips(mustList, 'jd'),
        tone: 'jd',
      })}
      ${jdSecondary.length ? renderPlanCard({
        icon: '◆',
        title: 'JD secondary / domain',
        count: jdSecondary.length,
        source: srcJd,
        body: renderPlanChips(jdSecondary, 'jd2'),
        tone: 'jd2',
      }) : ''}
      ${atsItems.length ? renderPlanCard({
        icon: '¶',
        title: 'ATS phrases',
        count: `${ats.found.length}/${ats.phrases.length || atsItems.length}`,
        source: srcJd,
        body: `
          ${ats.phrases.length ? `
          <div class="rp-ats-progress">
            <div class="rp-ats-bar"><div class="rp-ats-fill" style="width:${atsPct}%"></div></div>
            <span class="rp-ats-label">${ats.found.length} of ${ats.phrases.length} already on your resume</span>
          </div>` : ''}
          ${renderPlanChips(atsItems, 'ats')}
        `,
        tone: 'ats',
      }) : ''}
      ${renderPlanCard({
        icon: '◎',
        title: 'Internet / market skills',
        count: internetSkills.length,
        source: `${srcNet}${state.mode === 'aggressive' ? ' · included in rewrite' : ' · Stretch mode only'}`,
        body: renderPlanChips(internetSkills, 'stretch'),
        tone: 'stretch',
      })}
      ${internetKeywords.length ? renderPlanCard({
        icon: '⌗',
        title: 'Market keyword phrases',
        count: internetKeywords.length,
        source: srcNet,
        body: renderPlanChips(internetKeywords, 'stretch'),
        tone: 'stretch',
      }) : ''}
      ${renderPlanCard({
        icon: '★',
        title: 'Already on your resume',
        count: found.length,
        source: 'Matched before rewrite',
        body: renderPlanChips(found, 'found'),
        tone: 'found',
      })}
    </div>
    ${gapCards ? `<div class="rp-gaps-section"><h4 class="rp-gaps-heading">What the rewrite will add</h4><div class="rp-gaps-grid">${gapCards}</div></div>` : ''}
  </div>`;
}

function renderRewriteCta(score, roleLabel) {
  const title = escapeHtml(formatTabJobTitle(roleLabel, { full: true }) || roleLabel);
  if (score < SCORE_THRESHOLD) {
    return `<div class="rp-cta rp-cta-warn">
      <div class="rp-cta-copy">
        <div class="rp-cta-score"><span>${score}</span><small>/100</small></div>
        <div>
          <strong>Below your ${SCORE_THRESHOLD} target</strong>
          <p>Rewrite tailors your base resume for <em>${title}</em> using the skill plan above.</p>
        </div>
      </div>
      <button class="btn-primary rp-cta-btn" onclick="runAnalysis()">Rewrite to ${SCORE_THRESHOLD}+</button>
    </div>`;
  }
  return `<div class="rp-cta rp-cta-ok">
    <div class="rp-cta-copy">
      <div>
        <strong>Already at ${score}/100</strong>
        <p>Optional: polish the language for <em>${title}</em>.</p>
      </div>
    </div>
    <button class="btn-secondary rp-cta-btn" onclick="runAnalysis()">Polish for this posting</button>
  </div>`;
}

function renderAtsPanel(unified) {
  const sc = unified.scorecard;
  const score = unified.atsScore;
  const color = scoreHue(score);
  const kw = state.keywords || unified;
  const roleLabel = (kw.role && kw.role.label) || unified.title || 'Read from posting';
  state.preTailor = snapshotScore(unified);
  $('freeAtsPanel').classList.remove('hidden');
  if ($('scoreSection')) $('scoreSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  $('scoreSourceLabel').textContent = roleLabel;
  if ($('roleDetectLine')) {
    const jdSrc = kw.geminiUsed ? 'Gemini (JD)' : 'local RAG';
    const netSrc = kw.internetUsed ? 'Gemini (internet)' : (kw.internetError ? 'internet lookup failed' : 'local RAG fallback');
    const geminiNote = kw.geminiUsed
      ? `Skills from posting via ${jdSrc}. Market skills from ${netSrc}.`
      : (kw.geminiError ? `Gemini unavailable (${kw.geminiError}) — using local RAG.` : 'Using local RAG fallback.');
    const modeNote = state.mode === 'aggressive'
      ? 'Stay truthful = JD only · Stretch = JD + internet/market skills'
      : 'Locked to JD skills. Switch to Stretch to also add internet/market skills.';
    $('roleDetectLine').textContent = `Role: ${roleLabel} · ${geminiNote} ${modeNote}`;
  }
  if ($('atsDonut')) $('atsDonut').innerHTML = svgDonut(score);
  $('freeAtsScore').textContent = score;
  $('freeAtsScore').style.color = color;
  $('freeKwMatch').textContent = `${(sc.keywordsFound || []).length}/${Math.max(unified.primary.length, 1)}`;
  $('freeKwMatchSub').textContent = state.mode === 'aggressive' ? 'JD + internet skills found' : 'JD skills found';
  $('freeFmtCheck').textContent = sc.formatCheck || '--';
  $('freeFmtCheck').style.color = sc.formatCheck === 'PASS' ? '#16a34a' : '#d97706';
  $('freeBulletScore').textContent = `${sc.bulletsWithMetrics || 0}/${sc.bulletsTotal || 0}`;
  renderRuleBars(unified.ruleScores || {});
  renderTen('tenSecondList', sc.tenSecondTest || {});
  if ($('glanceChart')) $('glanceChart').innerHTML = renderGlanceChart(sc.tenSecondTest || {});
  renderKeywordGrid('freeKwGrid', unified.primary, unified.secondary, sc.keywordsFound, sc.secondaryFound);
  const matched = (sc.keywordsFound || []).length + (sc.secondaryFound || []).length;
  const total = unified.primary.length + unified.secondary.length;
  const pct = total ? Math.round((matched / total) * 100) : 0;
  $('freeKwBar').style.width = pct + '%';
  $('freeKwBarLabel').textContent = `${matched}/${total} skills on the page · ${pct}%`;
  const missingImportant = dropCertTerms(sc.keywordsMissing || []);
  const missingExtra = dropCertTerms(sc.secondaryMissing || []);
  if ($('skillCoverageChart')) {
    $('skillCoverageChart').innerHTML = svgPie(matched, missingImportant.length + missingExtra.length);
  }
  if ($('atsFlow')) $('atsFlow').innerHTML = renderFlow(atsStory(unified));
  const missing = uniqTerms([...missingImportant, ...missingExtra]);
  const found = [...(sc.keywordsFound || []), ...(sc.secondaryFound || [])];
  const resumeText = ($('resumeInput') && $('resumeInput').value.trim()) || unified.resumeUsed || '';
  const ats = atsPhraseReport(kw, resumeText);
  state.lastMissingReport = {
    important: missingImportant,
    extra: missingExtra,
    all: missing,
    atsPhrases: ats.phrases,
    atsFound: ats.found,
    atsMissing: ats.missing,
  };
  renderGaps('freeGaps', [
    missing.length ? `Stay truthful adds JD skills only. Stretch adds JD skills plus market/internet skills typical for ${roleLabel}.` : 'No skill gaps against this locked set.',
    ats.phrases.length ? `ATS phrases on page: ${ats.found.length}/${ats.phrases.length}${ats.missing.length ? ' — rewrite will weave: ' + ats.missing.slice(0, 5).join(' · ') + (ats.missing.length > 5 ? '…' : '') : ''}.` : '',
    ...(sc.gaps || []).filter(g => !/keyword/i.test(g)),
  ].filter(Boolean));
  if ($('missingReport')) {
    const jdPrimary = kw.jdPrimary || [];
    const jdSecondary = kw.jdSecondary || [];
    const atsKeywords = kw.atsKeywords || [];
    const internetSkills = kw.internetSkills || kw.marketSkills || [];
    const internetKeywords = kw.internetKeywords || [];
    const jdList = kw.jdSkills || unified.primary || [];
    const srcJd = kw.geminiUsed ? 'Gemini AI · from JD' : 'Local RAG · from JD';
    const srcNet = kw.internetUsed ? 'Gemini AI · job boards' : 'Local RAG fallback';
    $('missingReport').innerHTML = renderRewritePlanReport({
      roleLabel,
      score,
      ats,
      found,
      missingImportant,
      missingExtra,
      jdPrimary,
      jdSecondary,
      jdList,
      atsKeywords,
      internetSkills,
      internetKeywords,
      srcJd,
      srcNet,
    });
  }
  const cta = $('tailorCta');
  if (cta) cta.innerHTML = renderRewriteCta(score, roleLabel);
}

function renderResults(unified, resumeText) {
  const sc = unified.scorecard;
  const score = unified.atsScore;
  const before = state.preTailor;
  stopAiProcessing();
  setDetailAnalysisOpen(false);
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.remove('hidden');
  $('resultsSection').classList.remove('hidden');
  $('atsScore').textContent = score;
  $('atsScore').className = 'score-value ' + (score >= 95 ? 'green' : score >= 70 ? 'yellow' : 'red');
  $('kwMatch').textContent = `${(sc.keywordsFound || []).length}/${Math.max(unified.primary.length, 10)}`;
  $('fmtCheck').textContent = sc.formatCheck || '--';
  $('confScore').textContent = sc.confidenceLevel || '--';
  if ($('afterDonut')) $('afterDonut').innerHTML = svgDonut(score);
  if ($('afterCompareHint')) {
    const prev = before ? Number(before.atsScore || 0) : null;
    $('afterCompareHint').textContent = prev == null
      ? 'How the page moved toward the posting.'
      : `Match score moved ${prev} → ${score}. Charts below show what changed.`;
  }
  if ($('compareChart')) {
    $('compareChart').innerHTML = renderCompareChart(
      before ? { ...before.scorecard, atsScore: before.atsScore, primary: before.primary } : null,
      { ...sc, atsScore: score, primary: unified.primary }
    );
  }
  if ($('afterGlanceChart')) {
    $('afterGlanceChart').innerHTML = renderGlanceCompare(before?.scorecard?.tenSecondTest, sc.tenSecondTest || {});
  }
  const story = optimizeStory(before, unified);
  if ($('optimizeFlow')) $('optimizeFlow').innerHTML = renderFlow(story.flow);
  if ($('optimizeIssues')) {
    $('optimizeIssues').innerHTML = story.issues.map(c =>
      `<div class="issue-card"><h4>${c.title}</h4><p>${c.body}</p><div class="fix">${c.fix}</div></div>`
    ).join('');
  }

  $('outputArea').textContent = resumeText;
  showFormattedResume(resumeText);
  setResumeView('formatted');
  $('scorecardContent').innerHTML = [
    ['Match score', score + '/100', score >= 95 ? 'sc-green' : 'sc-yellow'],
    ['Must-have skills', `${(sc.keywordsFound || []).length} found · ${(sc.keywordsMissing || []).length} missing`, 'sc-blue'],
    ['Extra role skills', `${(sc.secondaryFound || []).length} found`, 'sc-blue'],
    ['Measured bullets', `${sc.bulletsWithMetrics}/${sc.bulletsTotal}`, 'sc-yellow'],
    ['Page hygiene', sc.formatCheck, sc.formatCheck === 'PASS' ? 'sc-green' : 'sc-yellow'],
    ['Sections', sc.sectionCheck, sc.sectionCheck === 'PASS' ? 'sc-green' : 'sc-red'],
    ['Read on this', sc.confidenceLevel, 'sc-yellow'],
    ['Why', sc.confidenceReason || '—', ''],
  ].map(([l, v, c]) => `<div class="scorecard-row"><span class="sc-label">${l}</span><span class="sc-value ${c}">${v}</span></div>`).join('')
    + '<div class="bar-chart" style="margin-top:14px;">' + renderBarChart(unified.ruleScores || {}) + '</div>';

  renderKeywordGrid('kwGrid', unified.primary, unified.secondary, sc.keywordsFound, sc.secondaryFound);
  const matched = (sc.keywordsFound || []).length;
  const pct = Math.round((matched / Math.max(unified.primary.length, 1)) * 100);
  $('kwProgressBar').style.width = pct + '%';
  $('kwProgressLabel').textContent = `${matched} of ${unified.primary.length} must-have skills on the rewritten page`;
  renderTen('resultTenList', sc.tenSecondTest || {});
  const atsAfter = atsPhraseReport(state.keywords, resumeText);
  renderGaps('gapsContent', [
    ...(atsAfter.phrases.length ? [`ATS phrases on page: ${atsAfter.found.length}/${atsAfter.phrases.length}${atsAfter.missing.length ? ' — still missing: ' + atsAfter.missing.join(' · ') : ' — all covered'}`] : []),
    ...(sc.gaps || []),
    ...(sc.improvementSuggestions || []).map(s => 'Next: ' + s),
  ]);

  updateExportFilename(resumeText);

  if (score < SCORE_THRESHOLD) $('boostBtn').classList.remove('hidden');
  else $('boostBtn').classList.add('hidden');
  if ($('rerunBtn')) $('rerunBtn').classList.remove('hidden');
  setStep(5);
}

function renderRuleHtml(scores) {
  return '<div class="rule-bars" style="margin-top:12px;">' + RULE_META.map(r => {
    const val = Number(scores[r.key] || 0);
    const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
    return `<div class="rule-row"><div>${r.label}</div><div class="rule-track"><div class="rule-fill" style="width:${pct}%"></div></div><div>${val}/${r.max}</div></div>`;
  }).join('') + '</div>';
}

function getInputs() {
  const jd = $('jdInput').value.trim();
  const resume = $('resumeInput').value.trim();
  if (!jd) { showToast('Paste the posting first', '#e11d48'); return null; }
  if (!resume) { showToast('Add your base resume — upload or paste text', '#e11d48'); return null; }
  return { jd, resume };
}

async function runAtsCheck() {
  const inputs = getInputs();
  if (!inputs) return;
  const { jd, resume } = inputs;
  const btn = $('freeAtsBtn');
  btn.disabled = true;
  btn.textContent = 'Scoring…';
  setStep(2);
  showAiProcessing(
    'AI is analysing the job description…',
    'Extracting skills from the posting and job boards…'
  );
  try {
    const kw = await lockKeywordsFromJd(jd);
    syncJdSessionMeta(getActiveJdSession(), kw);
    renderJdTabs();
    updateAiProcessing('Scoring your resume against the posting…');
    if (!kw.geminiUsed && kw.geminiError) {
      showToast('Gemini unavailable — using local RAG for skills', '#d97706');
    }
    const unified = stableScore(jd, resume, kw, false);
    renderAtsPanel(unified);
    const role = (kw.role && kw.role.label) || 'this role';
    showToast(`Match ${unified.atsScore}/100 · ${role}`);
  } catch (err) {
    showToast('Match score failed: ' + String(err.message || err).slice(0, 80), '#e11d48');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Score this match';
    stopAiProcessing();
    stopLoading();
  }
}

async function runAnalysis() {
  const inputs = getInputs();
  if (!inputs) return;
  const { jd, resume } = inputs;
  $('analyzeBtn').disabled = true;
  $('scoreSection').classList.add('hidden');
  $('resultsSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.add('hidden');
  if ($('detailAnalysisPanel')) $('detailAnalysisPanel').classList.add('hidden');
  if ($('progressSection')) $('progressSection').classList.add('hidden');
  setStep(2);
  showAiProcessing(
    'AI is analysing the job description and rewriting your CV…',
    'Extracting skills from the posting…'
  );

  try {
    await lockKeywordsFromJd(jd);
    syncJdSessionMeta(getActiveJdSession(), state.keywords);
    renderJdTabs();
    if (!state.keywords.geminiUsed && state.keywords.geminiError) {
      showToast('Gemini unavailable — using local RAG for skills', '#d97706');
    }
    state.preTailor = snapshotScore(stableScore(jd, resume, state.keywords, false));
    const missingReport = missingSkillReport(state.keywords, resume);
    state.lastMissingReport = missingReport;
    updateAiProcessing('Researching market skills on job boards…');
    setStep(3);
    updateAiProcessing('Rewriting your CV for this role…');

    const tailored = cleanupResume(await callGemini(buildRewritePrompt(jd, resume, state.keywords, missingReport), { maxTokens: 7000 }));
    if (!tailored || tailored.length < 200) throw new Error('Rewrite was empty');
    state.tailoredResume = tailored;
    $('outputArea').textContent = tailored;

    setStep(4);
    updateAiProcessing('Polishing the language…');
    let { unified, resume: polished } = await scoreTailoredResume(jd, state.tailoredResume);
    state.tailoredResume = polished;
    $('outputArea').textContent = polished;

    let pass = 0;
    while (unified.atsScore < SCORE_THRESHOLD && pass < MAX_BOOST_PASSES) {
      pass += 1;
      updateAiProcessing(`Tightening the draft — pass ${pass} of ${MAX_BOOST_PASSES}…`);
      const boosted = cleanupResume(await callGemini(
        buildBoostPrompt(jd, state.tailoredResume, { ...unified.scorecard, atsScore: unified.atsScore, ruleScores: unified.ruleScores }, state.keywords || {}),
        { maxTokens: 7000 }
      ));
      const nextText = boosted && boosted.length > 200 ? boosted : state.tailoredResume;
      const scored = await scoreTailoredResume(jd, nextText);
      state.tailoredResume = scored.resume;
      unified = scored.unified;
      $('outputArea').textContent = scored.resume;
    }

    state.scorecard = unified.scorecard;
    updateAiProcessing('Finalizing emphasis and formatting…');
    await finalizeBolding(jd, state.tailoredResume);
    renderResults(unified, state.tailoredResume);
    persistCurrentJdSession();
    saveWorkspace();
    showToast(unified.atsScore >= SCORE_THRESHOLD
      ? `Draft scored ${unified.atsScore}/100 — open Detail analysis for charts`
      : `Score ${unified.atsScore}/100 — use Push the score or Detail analysis`);
  } catch (err) {
    showToast('Rewrite failed: ' + String(err.message || err).slice(0, 90), '#e11d48');
    stopAiProcessing();
  } finally {
    $('analyzeBtn').disabled = false;
    stopLoading();
  }
}

async function boostScore() {
  if (!state.tailoredResume) { showToast('Rewrite a resume first', '#e11d48'); return; }
  const inputs = getInputs();
  if (!inputs) return;
  const btn = $('boostBtn');
  btn.disabled = true;
  btn.textContent = 'Pushing…';
  showAiProcessing(
    'AI is polishing your CV…',
    'Closing remaining gaps in the draft…'
  );
  try {
    const boosted = cleanupResume(await callGemini(
      buildBoostPrompt(inputs.jd, state.tailoredResume, { ...state.scorecard, atsScore: state.scorecard?.atsScore }, state.keywords || {}),
      { maxTokens: 7000 }
    ));
    const nextText = boosted && boosted.length > 200 ? boosted : state.tailoredResume;
    updateAiProcessing('Scoring the tightened draft…');
    const scored = await scoreTailoredResume(inputs.jd, nextText);
    state.tailoredResume = scored.resume;
    const unified = scored.unified;
    state.scorecard = unified.scorecard;
    updateAiProcessing('Finalizing emphasis…');
    await finalizeBolding(inputs.jd, scored.resume);
    renderResults(unified, scored.resume);
    showToast(`Pushed to ${unified.atsScore}/100`);
  } catch (err) {
    showToast('Push failed: ' + String(err.message || err).slice(0, 80), '#e11d48');
    stopAiProcessing();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push the score';
    stopLoading();
  }
}

function cleanupResume(text) {
  let t = (text || '').replace(/```(?:text|markdown)?/gi, '').trim();
  t = t.replace(/^here is[^\n]*\n+/i, '');
  t = sanitizeResumeHeadline(t);
  return normalizeContactInResume(t).trim();
}

function sanitizeResumeHeadline(text) {
  const lines = String(text || '').split('\n');
  let seenName = false;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!seenName) {
      seenName = true;
      continue;
    }
    if (/@/.test(l) || /\d{3}[\s.()-]*\d{3}/.test(l) || /linkedin/i.test(l)) continue;
    if (isSectionHeader(l)) break;
    const cleaned = cleanJobTitle(l);
    if (cleaned && cleaned !== l) lines[i] = lines[i].replace(l, cleaned);
    break;
  }
  return lines.join('\n');
}

function resetResultsUi(silent) {
  state.keywords = null;
  state.kwHash = '';
  state.tailoredResume = '';
  state.scorecard = null;
  state.boldTerms = [];
  state.boldFinalized = false;
  state.preTailor = null;
  $('freeAtsPanel').classList.add('hidden');
  $('scoreSection').classList.add('hidden');
  $('resultsSection').classList.add('hidden');
  $('progressSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.add('hidden');
  if ($('detailAnalysisPanel')) $('detailAnalysisPanel').classList.add('hidden');
  stopAiProcessing();
  state.detailAnalysisOpen = false;
  $('outputArea').textContent = '';
  if ($('resumePaper')) $('resumePaper').innerHTML = '';
  $('analyzeBtn').disabled = false;
  if ($('rerunBtn')) $('rerunBtn').classList.add('hidden');
  setStep(1);
  const session = getActiveJdSession();
  if (session) session.tailoredResume = '';
  if (!silent) showToast('Results cleared — base resume and postings are still here');
}

function resetAndRun() {
  resetResultsUi(false);
  saveWorkspace();
}

function clearAll() {
  const session = getActiveJdSession();
  if (session) {
    session.jd = '';
    session.tailoredResume = '';
    session.label = 'New posting';
  }
  if ($('jdInput')) $('jdInput').value = '';
  updateCounts();
  resetAndRun();
  saveWorkspace();
  renderJdTabs();
}

const SECTION_KEYWORDS = new Set([
  'SUMMARY', 'PROFESSIONAL SUMMARY', 'SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES',
  'EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'WORK EXPERIENCE', 'EDUCATION',
  'CERTIFICATIONS', 'CERTIFICATION', 'LICENSES', 'LICENSE',
  'PROJECTS', 'KEY PROJECTS', 'PERSONAL PROJECTS', 'ACADEMIC PROJECTS', 'SELECTED PROJECTS',
  'AWARDS', 'HONORS', 'HONORS AND AWARDS', 'ACHIEVEMENTS',
  'PUBLICATIONS', 'PAPERS', 'PATENTS',
  'VOLUNTEER', 'VOLUNTEER EXPERIENCE', 'VOLUNTEERING', 'COMMUNITY SERVICE',
  'LEADERSHIP', 'ACTIVITIES', 'EXTRACURRICULAR', 'CAMPUS INVOLVEMENT',
  'LANGUAGES', 'INTERESTS', 'HOBBIES',
  'AFFILIATIONS', 'MEMBERSHIPS', 'PROFESSIONAL AFFILIATIONS',
  'TRAINING', 'PROFESSIONAL DEVELOPMENT', 'COURSEWORK', 'RELEVANT COURSEWORK',
  'REFERENCES', 'ADDITIONAL INFORMATION', 'OTHER EXPERIENCE', 'ADDITIONAL EXPERIENCE',
]);

const CORE_SECTION_RE = /^(PROFESSIONAL\s+)?SUMMARY$|^PROFILE$|^OBJECTIVE$|^(TECHNICAL\s+)?SKILLS$|^CORE COMPETENCIES$|^(PROFESSIONAL\s+|WORK\s+)?EXPERIENCE$|^WORK HISTORY$|^EDUCATION$/i;

function isCoreSection(header) {
  return CORE_SECTION_RE.test(String(header || '').replace(/\s+/g, ' ').trim());
}

function normalizeHeader(line) {
  return String(line || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function isSectionHeader(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.length > 52) return false;
  const t = normalizeHeader(raw);
  if (SECTION_KEYWORDS.has(t)) return true;
  return [...SECTION_KEYWORDS].some(k => t === k || t.startsWith(k + ' ') || t.startsWith(k + '/'));
}

function isGenericAllCapsHeading(line) {
  const raw = String(line || '').trim();
  if (raw.length < 4 || raw.length > 52) return false;
  if (/[a-z]/.test(raw) || /\d{4}/.test(raw) || /@/.test(raw) || raw.includes('|')) return false;
  if (!/^[A-Z][A-Z0-9 &\/+'.,-]{2,50}$/.test(raw)) return false;
  const words = raw.split(/\s+/);
  return words.length >= 1 && words.length <= 6;
}

function isAnySectionHeader(line) {
  return isSectionHeader(line) || isGenericAllCapsHeading(line);
}

function extractResumeSections(resume) {
  const lines = String(resume || '').split('\n');
  const sections = [];
  let i = 0;
  while (i < lines.length && !isSectionHeader(lines[i])) i++;
  let current = null;
  for (; i < lines.length; i++) {
    if (isAnySectionHeader(lines[i])) {
      if (current) sections.push(current);
      current = { header: lines[i].trim(), lines: [lines[i]] };
    } else if (current) {
      current.lines.push(lines[i]);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function extraMasterSections(resume) {
  return extractResumeSections(resume).filter(s => !isCoreSection(s.header));
}

function extraSectionsPromptBlock(resume) {
  const extra = extraMasterSections(resume);
  if (!extra.length) return '';
  return `EXTRA SECTIONS ON THE MASTER — keep every one, same heading text, same relative order (wherever they sit among Summary / Skills / Experience / Education). Do not drop, merge, rename, or invent extra sections. Keep the original facts; you may tighten wording only.\n\n${extra.map(s => s.lines.join('\n').trim()).join('\n\n')}`;
}

function restoreExtraSections(tailored, master) {
  const masterAll = extractResumeSections(master);
  const extra = masterAll.filter(s => !isCoreSection(s.header));
  if (!extra.length) return tailored;
  let text = String(tailored || '');
  const present = () => new Set(extractResumeSections(text).map(s => normalizeHeader(s.header)));
  for (let i = 0; i < masterAll.length; i++) {
    const sec = masterAll[i];
    if (isCoreSection(sec.header)) continue;
    const key = normalizeHeader(sec.header);
    if (present().has(key)) continue;
    const block = sec.lines.join('\n').replace(/\s+$/, '');
    const prev = [...masterAll.slice(0, i)].reverse().find(s => present().has(normalizeHeader(s.header)));
    const lines = text.split('\n');
    if (prev) {
      const idx = lines.findIndex(l => normalizeHeader(l) === normalizeHeader(prev.header));
      let end = lines.length;
      if (idx >= 0) {
        for (let j = idx + 1; j < lines.length; j++) {
          if (isAnySectionHeader(lines[j])) { end = j; break; }
        }
        lines.splice(end, 0, ...block.split('\n'));
        text = lines.join('\n');
        continue;
      }
    }
    text = text.replace(/\s*$/, '\n\n' + block);
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function isBulletLine(l) {
  return /^[-•*·◦▸▶]\s+\S/.test(l) || /^\d{1,2}[.)]\s+\S/.test(l);
}

function bulletText(l) {
  return l.replace(/^[-•*·◦▸▶]\s+/, '').replace(/^\d{1,2}[.)]\s+/, '');
}

function isRoleLine(l, section) {
  if (!l || isBulletLine(l) || l.includes('@')) return false;
  const sec = (section || '').toUpperCase();
  if (/SKILL|EDUCATION|CERTIF|PROJECT|SUMMARY/.test(sec)) return false;
  if (/^client\s*:/i.test(l)) return true;
  const hasDate = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i.test(l)
    || /\b(19|20)\d{2}\s*[–—-]\s*((19|20)\d{2}|present)\b/i.test(l);
  if (l.includes('|') && (hasDate || /EXPERIENCE/.test(sec))) return true;
  if (hasDate && /EXPERIENCE/.test(sec) && l.length < 140) return true;
  return false;
}

const ROLE_DATE_RE = /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}\s*[–—\-to]+\s*(?:Present|Current|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}))\s*$/i;

function linkify(text) {
  const line = formatContactLine(text);
  const re = /(https?:\/\/[^\s|]+|linkedin\.com\/in\/[^\s|]+)/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    out += escapeHtml(line.slice(last, m.index));
    const url = m[0];
    const href = /^https?:\/\//.test(url) ? url : 'https://' + url;
    const display = /linkedin/i.test(url) ? shortenLinkedIn(url) : url;
    out += `<a href="${escapeHtml(href)}">${escapeHtml(display)}</a>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(line.slice(last));
}

function splitRoleAndDates(line) {
  const m = line.match(ROLE_DATE_RE);
  if (!m) return { left: line, dates: '' };
  return {
    left: line.slice(0, m.index).replace(/[\s|]+$/, '').trim(),
    dates: m[1].replace(/\s*[–—-]\s*/g, ' – ').replace(/\s+to\s+/i, ' – '),
  };
}

function formatRoleHtml(line) {
  const { left, dates } = splitRoleAndDates(line);
  const parts = left.split('|').map(s => s.trim()).filter(Boolean);
  let company = '';
  let title = '';
  let location = '';
  if (parts.length >= 3) {
    company = parts[0];
    location = parts[1];
    title = parts.slice(2).join(' | ');
  } else if (parts.length === 2) {
    company = parts[0];
    title = parts[1];
  } else {
    company = left;
  }
  const leftHtml = escapeHtml(company) + (title ? ' | <i>' + escapeHtml(title) + '</i>' : '');
  const rightHtml = [location, dates].filter(Boolean).join(' | ');
  if (!rightHtml) return `<p class="r-role">${leftHtml}</p>`;
  return `<table class="r-job" width="100%" cellspacing="0" cellpadding="0"><tr>`
    + `<td>${leftHtml}</td>`
    + `<td class="r-dates">${escapeHtml(rightHtml)}</td>`
    + `</tr></table>`;
}

const BOLD_SKIP = new Set([
  'data', 'engineering', 'engineer', 'pipeline', 'pipelines', 'cloud', 'experience',
  'software', 'development', 'team', 'project', 'projects', 'business',
  'platform', 'platforms', 'system', 'systems', 'tool', 'tools', 'service', 'services',
  'model', 'models', 'process', 'processing',
]);

const BOLD_TECH_FALLBACK = [
  'Python', 'PySpark', 'Apache Spark', 'Spark', 'SQL', 'NoSQL', 'Scala', 'Java', 'Kotlin',
  'AWS', 'Amazon Web Services', 'GCP', 'Google Cloud', 'Azure', 'Databricks', 'Snowflake',
  'Kafka', 'Apache Kafka', 'Airflow', 'Apache Airflow', 'dbt', 'BigQuery', 'Redshift',
  'Glue', 'EMR', 'S3', 'Lambda', 'Kinesis', 'MWAA', 'Athena', 'DynamoDB', 'RDS',
  'Dataflow', 'Pub/Sub', 'Composer', 'GCS', 'Bigtable', 'Spanner',
  'Terraform', 'Docker', 'Kubernetes', 'Delta Lake', 'Unity Catalog', 'Hive', 'Hadoop',
  'Iceberg', 'Flink', 'Beam', 'Pandas', 'NumPy', 'PostgreSQL', 'MySQL', 'MongoDB',
  'Redis', 'Looker', 'Tableau', 'Power BI', 'Git', 'Jenkins', 'GitHub Actions',
  'CI/CD', 'REST API', 'GraphQL', 'Spark SQL', 'Delta Live Tables', 'Great Expectations',
];

const BOLD_THEME_WORDS = [
  'cross-functional collaboration', 'stakeholder management', 'production support',
  'incident response', 'root cause analysis', 'disaster recovery', 'business continuity',
  'data governance', 'data quality', 'data lineage', 'master data', 'change management',
  'capacity planning', 'performance tuning', 'cost optimization', 'knowledge sharing',
  'technical documentation', 'code review', 'sprint planning', 'best practices',
  'on-call support', 'on-call', 'on call',
  'collaboration', 'collaborate', 'collaborated', 'collaborating', 'collaborative',
  'maintenance', 'maintainance', 'maintain', 'maintained', 'maintaining',
  'support', 'supports', 'supported', 'supporting',
  'migration', 'migrations', 'migrate', 'migrated', 'migrating',
  'automation', 'automate', 'automated', 'automating',
  'optimization', 'optimize', 'optimized', 'optimizing',
  'orchestration', 'orchestrate', 'orchestrated', 'orchestrating',
  'monitoring', 'monitored', 'observability', 'alerting',
  'governance', 'compliance', 'security', 'lineage',
  'scalability', 'reliability', 'availability', 'performance',
  'ingestion', 'transformation', 'modeling', 'warehousing',
  'deployment', 'deployed', 'deploying', 'provisioning',
  'mentoring', 'mentorship', 'leadership', 'coaching',
  'troubleshooting', 'troubleshot', 'resolved', 'resolution',
  'implementation', 'implemented', 'architected', 'architecture',
  'stakeholder', 'stakeholders', 'cross-functional',
  'production', 'operations', 'operational',
  'documentation', 'runbooks', 'playbooks',
  'Agile', 'Scrum', 'Kanban', 'DevOps', 'DataOps', 'MLOps',
  'Built', 'Designed', 'Developed', 'Implemented', 'Automated', 'Optimized',
  'Migrated', 'Orchestrated', 'Ingested', 'Transformed', 'Monitored',
  'Deployed', 'Architected', 'Scaled', 'Reduced', 'Improved', 'Led',
  'Partnered', 'Coordinated', 'Facilitated', 'Owned', 'Delivered',
  'Established', 'Enhanced', 'Streamlined', 'Integrated', 'Modernized',
  'Supported', 'Maintained', 'Collaborated', 'Enabled', 'Drove',
];

function themeTermsFromJd() {
  const el = typeof $ === 'function' ? $('jdInput') : null;
  const jd = (el && el.value) || '';
  if (!jd) return [];
  const lower = jd.toLowerCase();
  return BOLD_THEME_WORDS.filter(t => lower.includes(String(t).toLowerCase()));
}

function collectBoldTerms(resumeText) {
  if (state.boldFinalized && state.boldTerms && state.boldTerms.length) {
    return state.boldTerms.slice();
  }
  const resume = resumeText
    || state.tailoredResume
    || ($('outputArea') && $('outputArea').textContent)
    || ($('resumeInput') && $('resumeInput').value)
    || '';
  const pool = buildBoldTermPool(state.keywords || {}, resume);
  if (pool.length) return pool;
  const locked = uniqTerms([...summaryKeywordList(state.keywords || {}), ...importantHrKeywords(state.keywords || {})]);
  if (locked.length) {
    return locked.filter(t => {
      const x = String(t).trim();
      if (x.length < 2) return false;
      if (BOLD_SKIP.has(x.toLowerCase())) return false;
      if (BOLD_GENERIC.has(x.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.length - a.length);
  }
  const fromKw = [...(state.keywords?.primary || [])];
  return uniqTerms(fromKw)
    .filter(t => String(t).trim().length >= 2)
    .sort((a, b) => b.length - a.length);
}

function boldResumeKeywords(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let count = 0;
  const max = state.boldFinalized ? 75 : 45;
  for (const term of collectBoldTerms(text)) {
    if (count >= max) break;
    const esc = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?<![A-Za-z0-9+#])' + esc + '(?![A-Za-z0-9+#])', 'gi');
    s = s.replace(re, (match, offset, full) => {
      if (count >= max) return match;
      const before = full.slice(0, offset);
      if ((before.split('<b>').length - 1) > (before.split('</b>').length - 1)) return match;
      if (/<[^>]*$/.test(before)) return match;
      count += 1;
      return '<b>' + match + '</b>';
    });
  }
  return s;
}

function parseResumeToHtml(text) {
  if (!text || !text.trim()) return '';
  const lines = text.split('\n');
  let html = '';
  let i = 0;
  let currentSection = '';
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    const rawName = lines[i].trim();
    const displayName = rawName === rawName.toUpperCase() && rawName.length > 1 ? toTitleCase(rawName) : rawName;
    html += `<div class="r-name">${escapeHtml(displayName)}</div>`;
    i++;
  }
  let headerCount = 0;
  let sawHeadline = false;
  while (i < lines.length && headerCount < 6) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    if (isSectionHeader(l)) break;
    const isContact = /@/.test(l) || /\d{3}[\s.()-]*\d{3}[\s.-]*\d{4}/.test(l) || /linkedin\.com/i.test(l);
    if (!sawHeadline && !isContact && l.length < 70) {
      html += `<div class="r-headline">${escapeHtml(cleanJobTitle(l) || l)}</div>`;
      sawHeadline = true;
    } else {
      html += `<div class="r-contact">${linkify(l)}</div>`;
    }
    i++;
    headerCount++;
  }
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (isAnySectionHeader(l)) {
      currentSection = l.toUpperCase();
      html += `<div class="r-section">${escapeHtml(currentSection)}</div>`;
    } else if (isBulletLine(l)) {
      const body = /EXPERIENCE|PROJECT|AWARD|VOLUNTEER|LEADERSHIP|PUBLICATION/.test(currentSection)
        ? boldResumeKeywords(bulletText(l))
        : escapeHtml(bulletText(l));
      html += `<p class="r-bullet" align="left"><span class="r-bmark">•</span><span class="r-btext">${body}</span></p>`;
    } else if (/SKILL/.test(currentSection) && /^[A-Za-z][A-Za-z0-9 &\/+.#-]{1,50}:\s*\S/.test(l)) {
      const idx = l.indexOf(':');
      html += `<p class="r-skill-line"><span class="r-skill-label">${escapeHtml(l.slice(0, idx))}:</span> ${escapeHtml(l.slice(idx + 1).trim())}</p>`;
    } else if (isRoleLine(l, currentSection)) {
      html += formatRoleHtml(l);
    } else {
      const body = /SUMMARY/.test(currentSection) ? boldResumeKeywords(l) : linkify(l);
      html += `<p class="r-body">${body}</p>`;
    }
  }
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resumeTypeFromBody(bodyPt, lh = 1) {
  const p = (n) => (Math.round(n * 100) / 100) + 'pt';
  const scale = bodyPt / 12;
  return {
    fsName: p(bodyPt * 1.8),
    lhName: p(bodyPt * 2.19 * (1 + (lh - 1) * 0.35)),
    fsTitle: p(bodyPt * 1.4),
    fsRole: p(bodyPt * 1.1),
    lhRole: p(bodyPt * 1.1 * (1 + (lh - 1) * 0.4)),
    fsBody: p(bodyPt),
    lhBody: p(bodyPt * 1.15 * lh),
    spSection: p(7.1 * scale * lh),
    spJob: p(1.85 * scale * lh),
    spBullet: p(2.05 * scale * lh),
    spBody: p(1.5 * scale * lh),
    spSkill: p(1.7 * scale * lh),
  };
}

function resumeCssBlock(bodyPt, lh, sel = '') {
  const t = resumeTypeFromBody(bodyPt, lh);
  const s = sel ? `${sel} ` : '';
  return `
    ${s}.r-name { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsName}; font-weight: bold; text-align: center; color: #000000; margin: 0; padding: 0; line-height: ${t.lhName}; mso-line-height-rule: exactly; }
    ${s}.r-headline { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsTitle}; font-weight: bold; text-align: center; color: #000000; margin: 3.2pt 0 0 0; padding: 0; line-height: ${t.fsTitle}; mso-line-height-rule: exactly; }
    ${s}.r-contact { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsBody}; text-align: center; color: #000000; margin: 0; padding: 0; line-height: ${t.lhBody}; mso-line-height-rule: exactly; }
    ${s}.r-section { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsTitle}; font-weight: bold; color: #000000; text-transform: uppercase; letter-spacing: 0; border-bottom: 0.5pt solid #000000; margin: ${t.spSection} 0 0 4.55pt; padding: 0; line-height: ${t.fsTitle}; mso-line-height-rule: exactly; text-align: left; }
    ${s}.r-job { width: 100%; border-collapse: collapse; margin: ${t.spJob} 0 0 0; border: none; }
    ${s}.r-job td { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsRole}; font-weight: bold; color: #000000; padding: 0; line-height: ${t.lhRole}; vertical-align: bottom; mso-line-height-rule: exactly; border: none; text-align: left; }
    ${s}.r-job td:first-child { padding-left: 4.55pt; }
    ${s}.r-role { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsRole}; font-weight: bold; color: #000000; margin: ${t.spJob} 0 0 4.55pt; line-height: ${t.lhRole}; text-align: left; }
    ${s}.r-role i, ${s}.r-job i { font-style: italic; font-weight: bold; }
    ${s}.r-bullet { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsBody}; color: #000000; margin: 0 0 0 18pt; text-indent: -13.5pt; line-height: ${t.lhBody}; mso-line-height-rule: exactly; padding: 0; text-align: left; }
    ${s}.r-job + .r-bullet, ${s}.r-role + .r-bullet { margin-top: ${t.spBullet}; }
    ${s}.r-body { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsBody}; color: #000000; margin: ${t.spBody} 0 0 4.55pt; padding: 0; line-height: ${t.lhBody}; mso-line-height-rule: exactly; text-align: justify; }
    ${s}.r-skill-line { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsBody}; color: #000000; margin: ${t.spSkill} 0 0 4.55pt; padding: 0; line-height: ${t.lhBody}; mso-line-height-rule: exactly; text-align: justify; }
    ${s}.r-section + .r-skill-line, ${s}.r-section + .r-body { margin-top: ${t.spBody}; }
  `;
}

function resumeCss() {
  const fit = state.docFit || { bodyPt: 12, lh: 1, pages: 1 };
  let css = `
    p { margin: 0; padding: 0; }
    .WordSection1 { text-align: left; }
    .r-rule { font-family: Calibri, Arial, sans-serif; font-size: 1pt; line-height: 1pt; mso-line-height-rule: exactly; margin: 0; padding: 0; height: 1pt; border: none; border-top: 0.5pt solid #000000; overflow: hidden; }
    .r-dates { text-align: right; white-space: nowrap; width: 32%; }
    .r-bmark, .r-btext { text-align: left; }
    .r-skill-label { font-weight: bold; color: #000000; }
    b, strong { font-weight: bold; color: #000000; }
    a { color: #1a56c4; text-decoration: underline; }
    .r-page-break { page-break-before: always; break-before: page; height: 0; margin: 0; padding: 0; border: 0; }
    .r-page-start { page-break-before: always; break-before: page; }
    .r-section + .r-job,
    .r-section + .r-role,
    .r-section + .r-bullet,
    .r-section + .r-skill-line,
    .r-section + .r-body { page-break-before: avoid; break-before: avoid; }
  `;
  css += resumeCssBlock(fit.bodyPt || PAGE_FIT.BODY_AVG, fit.lh || 1);
  return css;
}

function inchesToPx(inches) {
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;left:-9999px;top:0;height:' + inches + 'in';
  document.body.appendChild(d);
  const px = d.offsetHeight;
  d.remove();
  return px || inches * 96;
}

function applyResumeFitVars(el, bodyPt, lh) {
  if (!el || !el.style) return;
  const t = resumeTypeFromBody(bodyPt, lh);
  el.style.setProperty('--fs-name', t.fsName);
  el.style.setProperty('--lh-name', t.lhName);
  el.style.setProperty('--fs-title', t.fsTitle);
  el.style.setProperty('--fs-role', t.fsRole);
  el.style.setProperty('--lh-role', t.lhRole);
  el.style.setProperty('--fs-body', t.fsBody);
  el.style.setProperty('--lh-body', t.lhBody);
  el.style.setProperty('--sp-section', t.spSection);
  el.style.setProperty('--sp-job', t.spJob);
  el.style.setProperty('--sp-bullet', t.spBullet);
  el.style.setProperty('--sp-body', t.spBody);
  el.style.setProperty('--sp-skill', t.spSkill);
}

function measureResumeContent(paper) {
  let max = 0;
  for (const el of paper.children) {
    max = Math.max(max, el.offsetTop + el.offsetHeight);
  }
  return max;
}

const PAGE_FIT = {
  BODY_MIN: 9.5,
  BODY_MAX: 12,
  BODY_AVG: 10.75,
  LH_MIN: 0.92,
  LH_MAX: 1.08,
  FILL_MIN: 0.985,
  FIT_MAX: 0.998,
  MAX_PAGES: 2,
};

const PAGE_MARGINS = { top: 0.05, right: 0.10, bottom: 0.19, left: 0.10 };

function pageMarginsCss() {
  const m = PAGE_MARGINS;
  return `${m.top}in ${m.right}in ${m.bottom}in ${m.left}in`;
}

function applyPageMargins(el) {
  if (!el || !el.style) return;
  const m = PAGE_MARGINS;
  el.style.padding = `${m.top}in ${m.right}in ${m.bottom}in ${m.left}in`;
}

function pageContentHeight() {
  return inchesToPx(11 - PAGE_MARGINS.top - PAGE_MARGINS.bottom);
}

function largestBodyThatFits(measure, apply, hiBound, bodyMin, bodyMax) {
  let lo = bodyMin;
  let hi = bodyMax;
  let best = bodyMin;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    apply(mid, 1);
    if (measure() <= hiBound) { best = mid; lo = mid; }
    else hi = mid;
  }
  return Math.round(best * 10) / 10;
}

function compressLhToHeight(measure, apply, bodyPt, maxH, lhMin, lhMax) {
  apply(bodyPt, lhMax);
  if (measure() <= maxH) return lhMax;
  let lo = lhMin;
  let hi = lhMax;
  let best = lhMin;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    apply(bodyPt, mid);
    if (measure() <= maxH) { best = mid; lo = mid; }
    else hi = mid;
  }
  return Math.round(best * 100) / 100;
}

function expandToFillPage(measure, apply, bodyPt, loBound, hiBound, F) {
  let lh = 1;
  apply(bodyPt, lh);

  if (measure() < loBound) {
    let lo = 1;
    let hi = F.LH_MAX;
    let best = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      apply(bodyPt, mid);
      const h = measure();
      if (h < loBound) { best = mid; lo = mid; }
      else if (h > hiBound) hi = mid;
      else { best = mid; break; }
    }
    lh = best;
    apply(bodyPt, lh);
  }

  if (measure() < loBound && bodyPt < F.BODY_MAX) {
    let lo = bodyPt;
    let hi = F.BODY_MAX;
    let best = bodyPt;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      apply(mid, lh);
      const h = measure();
      if (h <= hiBound) {
        if (h >= loBound) { best = mid; break; }
        best = mid;
        lo = mid;
      } else hi = mid;
    }
    bodyPt = Math.round(best * 10) / 10;
    apply(bodyPt, lh);
  }

  return { bodyPt, lh: Math.round(lh * 100) / 100, pages: 1 };
}

function fitResumeToPage(paper) {
  const F = PAGE_FIT;
  const hiBound = pageContentHeight() * F.FIT_MAX;
  const loBound = pageContentHeight() * F.FILL_MIN;
  const measure = () => {
    void paper.offsetHeight;
    return measureResumeContent(paper);
  };
  const apply = (bodyPt, lh) => applyResumeFitVars(paper, bodyPt, lh);

  // Prefer one page: scale 12pt → 9.5pt (and tighten line height) before adding page 2
  apply(F.BODY_MAX, 1);
  if (measure() <= hiBound) {
    const bodyPt = largestBodyThatFits(measure, apply, hiBound, F.BODY_MIN, F.BODY_MAX);
    return expandToFillPage(measure, apply, bodyPt, loBound, hiBound, F);
  }

  let bodyPt = largestBodyThatFits(measure, apply, hiBound, F.BODY_MIN, F.BODY_MAX);
  let lh = 1;
  apply(bodyPt, lh);
  if (measure() > hiBound) {
    lh = compressLhToHeight(measure, apply, bodyPt, hiBound, F.LH_MIN, F.LH_MAX);
  }
  apply(bodyPt, lh);
  if (measure() <= hiBound) {
    return expandToFillPage(measure, apply, bodyPt, loBound, hiBound, F);
  }

  // Still overflows at 9.5pt minimum — use a second page
  const maxTotal = hiBound * F.MAX_PAGES;
  bodyPt = largestBodyThatFits(measure, apply, maxTotal, F.BODY_MIN, F.BODY_MAX);
  lh = 1;
  apply(bodyPt, lh);
  if (measure() > maxTotal) {
    lh = compressLhToHeight(measure, apply, bodyPt, maxTotal, F.LH_MIN, F.LH_MAX);
  }
  return { bodyPt, lh: Math.round(lh * 100) / 100, pages: 2 };
}

function formatFitHint(fit) {
  if (!fit) return '';
  const pt = (fit.bodyPt || PAGE_FIT.BODY_AVG).toFixed(1);
  const namePt = (fit.bodyPt * 1.8).toFixed(1);
  if ((fit.pages || 1) > 1) {
    return `2 pages · ${pt}pt body (only used because 9.5pt still overflows one page) · name ~${namePt}pt`;
  }
  return `1 page · ${pt}pt body (9.5–12pt, squeezed to one page when possible) · name ~${namePt}pt`;
}

function clearPageBreaks(paper) {
  paper.querySelectorAll('.r-page-break').forEach(n => n.remove());
}

function clearPage2Wrap(paper) {
  paper.querySelectorAll('.r-page-2').forEach(el => {
    while (el.firstChild) paper.insertBefore(el.firstChild, el);
    el.remove();
  });
}

function contentHeightBefore(kids, beforeEl) {
  const top = beforeEl.offsetTop;
  let max = 0;
  for (const el of kids) {
    if (el.offsetTop >= top - 0.5) continue;
    max = Math.max(max, el.offsetTop + el.offsetHeight);
  }
  return max;
}

function normalizeBreakTarget(kids, el) {
  let target = el;
  if (target.classList.contains('r-job') || target.classList.contains('r-role')) {
    const idx = kids.indexOf(target);
    const prev = idx > 0 ? kids[idx - 1] : null;
    if (prev && prev.classList.contains('r-section')) target = prev;
  }
  return target;
}

function findPageBreakTarget(paper, pageHeight) {
  const kids = [...paper.children].filter(c => !c.classList.contains('r-page-break'));
  if (!kids.length) return null;

  const totalH = Math.max(...kids.map(el => el.offsetTop + el.offsetHeight));
  const limit = pageHeight * PAGE_FIT.FIT_MAX;
  if (totalH <= limit * 1.02) return null;

  const minFill = pageHeight * 0.84;
  const breakables = kids.filter(el =>
    el.classList.contains('r-section') ||
    el.classList.contains('r-job') ||
    el.classList.contains('r-role')
  );

  let best = null;
  for (const el of breakables) {
    const target = normalizeBreakTarget(kids, el);
    const fill = contentHeightBefore(kids, target);
    if (fill < minFill || fill > limit) continue;
    if (!best || fill > best.fill) best = { el: target, fill };
  }
  if (best) return best.el;

  // No break fills page 1 enough — let the print engine paginate naturally at @page height
  return null;
}

function markFirstPageEnd(paper, pageHeight) {
  clearPageBreaks(paper);
  paper.querySelectorAll('.r-page-start').forEach(el => el.classList.remove('r-page-start'));
  const target = findPageBreakTarget(paper, pageHeight);
  if (!target) return;
  target.classList.add('r-page-start');
}

function currentResumeText() {
  return (state.tailoredResume || $('outputArea').textContent || '').trim();
}

function showFormattedResume(text) {
  const paper = $('resumePaper');
  if (!paper) return;
  const cleaned = sanitizeResumeHeadline(text || currentResumeText());
  if (cleaned && state.tailoredResume && cleaned !== state.tailoredResume) {
    state.tailoredResume = cleaned;
    if ($('outputArea')) $('outputArea').textContent = cleaned;
  }
  paper.classList.remove('two-page');
  paper.style.minHeight = '11in';
  clearPageBreaks(paper);
  clearPage2Wrap(paper);
  paper.innerHTML = parseResumeToHtml(cleaned);
  applyPageMargins(paper);
  applyResumeFitVars(paper, PAGE_FIT.BODY_AVG, 1);
  const pageHeight = pageContentHeight();
  const fit = fitResumeToPage(paper);
  state.docFit = fit;
  applyResumeFitVars(paper, fit.bodyPt, fit.lh);
  if (fit.pages > 1) {
    markFirstPageEnd(paper, pageHeight);
    paper.classList.add('two-page');
    paper.style.minHeight = (11 * fit.pages) + 'in';
  } else {
    paper.style.minHeight = '11in';
  }
  const fitHint = $('resumeFitHint');
  if (fitHint) fitHint.textContent = formatFitHint(fit);
}

function setResumeView(mode) {
  const formatted = mode !== 'raw';
  $('resumePaperWrap').classList.toggle('hidden', !formatted);
  $('outputArea').classList.toggle('hidden', formatted);
  $('viewFormattedBtn').classList.toggle('active', formatted);
  $('viewRawBtn').classList.toggle('active', !formatted);
  if (!formatted) $('outputArea').focus();
}

function buildWordHtml(content, title) {
  const paper = $('resumePaper');
  const bodyHtml = (paper && paper.innerHTML.trim()) ? paper.innerHTML : parseResumeToHtml(content);
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <title>${escapeHtml(title || 'Resume')}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
  <style>
    @page WordSection1 {
      size: 8.5in 11in;
      margin: ${pageMarginsCss()};
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
    }
    body { font-family: Calibri, Arial, sans-serif; font-size: ${(state.docFit?.bodyPt || PAGE_FIT.BODY_AVG).toFixed(2)}pt; color: #000000; line-height: ${((state.docFit?.bodyPt || PAGE_FIT.BODY_AVG) * 1.15 * (state.docFit?.lh || 1)).toFixed(2)}pt; mso-line-height-rule: exactly; text-align: left; }
    ${resumeCss()}
  </style>
</head>
<body>
  <div class="WordSection1" align="left" style="text-align:left">${bodyHtml}</div>
</body>
</html>`;
}

function downloadDocx() {
  const content = currentResumeText();
  if (!content) { showToast('Nothing to save yet', '#e11d48'); return; }
  updateExportFilename(content);
  const filename = (state.filename || 'tailored_resume.doc').replace(/\.docx?$/i, '.doc');
  const blob = new Blob(['\ufeff' + buildWordHtml(content, filename)], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Word file saved');
}

function downloadTxt() {
  const text = currentResumeText();
  if (!text) { showToast('Nothing to save yet', '#e11d48'); return; }
  updateExportFilename(text);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = (state.filename || 'tailored_resume.txt').replace(/\.doc$/i, '.txt');
  a.click();
  showToast('Text file saved');
}

function copyToClipboard() {
  navigator.clipboard.writeText(currentResumeText()).then(() => showToast('Copied to clipboard'));
}

function buildPrintHtml(content, opts = {}) {
  const jd = opts.jd != null
    ? opts.jd
    : (($('jdInput') && $('jdInput').value.trim()) || '');
  const keywords = opts.keywords != null ? opts.keywords : (state.keywords || {});
  if (content) showFormattedResume(content);
  const paper = $('resumePaper');
  if (!paper || !paper.innerHTML.trim()) return null;
  const printTitle = opts.printTitle || buildExportBasename(
    content || currentResumeText(),
    jd,
    keywords
  );
  const fit = state.docFit || { bodyPt: PAGE_FIT.BODY_AVG, lh: 1, pages: 1 };
  const bodyPt = fit.bodyPt || PAGE_FIT.BODY_AVG;
  const lh = fit.lh || 1;
  const lhPt = (bodyPt * 1.15 * lh).toFixed(2);
  const tmp = document.createElement('div');
  tmp.innerHTML = paper.innerHTML;
  tmp.querySelectorAll('.r-page-start').forEach(el => el.classList.remove('r-page-start'));
  tmp.querySelectorAll('.r-page-break').forEach(el => el.remove());
  const bodyHtml = tmp.innerHTML;
  const safeTitle = escapeHtml(printTitle);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${safeTitle}</title>
<style>
  @page { size: 8.5in 11in; margin: ${pageMarginsCss()}; }
  html, body { margin: 0; padding: 0; background: #fff; overflow: visible; }
  body {
    font-family: Calibri, Arial, sans-serif;
    font-size: ${bodyPt.toFixed(2)}pt;
    color: #000;
    line-height: ${lhPt}pt;
    mso-line-height-rule: exactly;
    text-align: left;
    orphans: 2;
    widows: 2;
  }
  .WordSection1 { text-align: left; overflow: visible; }
  ${resumeCss()}
  .r-bullet {
    display: block !important;
    margin: 0 0 0 4.55pt !important;
    padding-left: 13.5pt !important;
    text-indent: -13.5pt !important;
  }
  .r-bmark, .r-btext { display: inline; }
  .r-section,
  .r-job,
  .r-role,
  .r-skill-line,
  .r-body,
  .r-bullet,
  table.r-job {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .r-section + .r-job,
  .r-section + .r-role,
  .r-section + .r-bullet,
  .r-section + .r-skill-line,
  .r-section + .r-body {
    break-before: avoid;
    page-break-before: avoid;
  }
  @media print {
    @page { size: 8.5in 11in; margin: ${pageMarginsCss()}; }
    html, body { margin: 0; padding: 0; background: #fff; overflow: visible; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body><div class="WordSection1">${bodyHtml}</div>
<script>
window.onload = function() {
  var fn = ${JSON.stringify(printTitle)};
  document.title = fn;
  var t = document.querySelector('title');
  if (t) t.textContent = fn;
  window.focus();
  setTimeout(function() { window.print(); }, 300);
};
<\/script></body></html>`;
}

function printResume() {
  const content = currentResumeText();
  if (!content) { showToast('Nothing to print yet', '#e11d48'); return; }
  const base = updateExportFilename(content);
  const html = buildPrintHtml(content);
  if (!html) { showToast('Nothing to print yet', '#e11d48'); return; }
  const w = window.open('', '_blank');
  if (!w) {
    showToast('Allow pop-ups to print', '#e11d48');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  showToast(`Print / save PDF as: ${base}.pdf`);
}

function copyFilename() {
  navigator.clipboard.writeText(state.filename || '').then(() => showToast('File name copied'));
}

function updateCounts() {
  const jd = $('jdInput').value;
  const resume = $('resumeInput').value;
  $('jdCount').textContent = jd.length;
  $('jdWords').textContent = wordCount(jd);
  $('resumeCount').textContent = resume.length;
  $('resumeWords').textContent = wordCount(resume);
}

function initTracks() {
  $('trackRow').innerHTML = TRACKS.map(t =>
    `<button class="chip ${t.id === state.track ? 'active' : ''}" data-id="${t.id}" onclick="setTrack('${t.id}')">${t.label}</button>`
  ).join('');
}

async function pingHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok && data.gemini) {
      markGemini(true, data.keyName ? `Model ready · ${data.keyName}` : 'Model ready');
      $('serverHint').classList.add('hidden');
      if ($('uploadHint')) $('uploadHint').classList.toggle('hidden', data.extractResume !== false);
      return;
    }
  } catch { /* offline */ }
  markGemini(false);
  $('serverHint').classList.remove('hidden');
  if ($('uploadHint')) $('uploadHint').classList.add('hidden');
}

async function bootstrapApp() {
  screenLoadingDepth = 1;
  document.body.classList.add('screen-loading');
  try {
    loadWorkspace();
    applyBaseResumeToUi();
    applyUrlSession();
    syncUiFromActiveSession();
    initResumeUpload();
    initTracks();
    updateCounts();
    await pingHealth();
  } finally {
    hideScreenLoading();
    maybePrintOnLoad();
  }
}

function applyUrlSession() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  const shouldPrint = params.get('print') === '1';
  if (!sessionId) return;
  const session = state.jdSessions.find(s => s.id === sessionId);
  if (!session) return;
  state.activeJdId = sessionId;
  if (shouldPrint && String(session.tailoredResume || '').trim().length > 50) {
    window.__printOnLoad = true;
  }
  if (window.history?.replaceState) {
    window.history.replaceState(null, '', 'index.html');
  }
}

function maybePrintOnLoad() {
  if (!window.__printOnLoad) return;
  window.__printOnLoad = false;
  if (String(state.tailoredResume || '').trim().length > 50) {
    setTimeout(() => printResume(), 400);
  }
}

$('jdInput').addEventListener('input', onJdInput);
$('resumeInput').addEventListener('input', onResumeInput);
$('outputArea').addEventListener('input', () => {
  state.tailoredResume = $('outputArea').textContent;
  showFormattedResume(state.tailoredResume);
  scheduleSaveWorkspace();
});
bootstrapApp();
