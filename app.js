/* Jobilly.AI Resume Dashboard */
const SCORE_THRESHOLD = 95;
const MAX_BOOST_PASSES = 6;
const SKILLSET_CACHE = 'ats_skillset_v4_';
const CERT_TERM_RE = /certif(?:y|ied|ication|ications)?|\baws certified\b|\bazure certified\b|\bgoogle cloud certified\b|\bsnowflake certified\b|\bdatabricks certified\b|\bpmp\b|\bcissp\b|\bcspo\b|\bcsm\b|\bcka\b|\bckad\b|\bcomptia\b|\bscrum master\b|\bprofessional cloud architect\b|\bsolutions architect associate\b|\bdata engineer associate\b/i;

function isCertTerm(term) {
  return CERT_TERM_RE.test(String(term || ''));
}

function dropCertTerms(list) {
  return (list || []).filter(t => t && !isCertTerm(t));
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
  docFit: { fs: 1, lh: 1, pages: 1 },
  boldTerms: [],
  boldFinalized: false,
  preTailor: null,
};

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
  $('progressSection').classList.remove('hidden');
  $('progressBar').style.width = pct + '%';
  $('progressLabel').textContent = label;
  $('progressSub').textContent = sub;
}

function setLoading(text) {
  $('loadingIndicator').classList.remove('hidden');
  $('loadingText').textContent = text;
}

function stopLoading() {
  $('loadingIndicator').classList.add('hidden');
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  $('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

function setMode(mode) {
  state.mode = mode;
  $('modeIntegrity').classList.toggle('active', mode === 'integrity');
  $('modeAggressive').classList.toggle('active', mode === 'aggressive');
}

function setTrack(id) {
  state.track = id;
  document.querySelectorAll('#trackRow .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.id === id);
  });
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

function markGemini(ok, label) {
  const badge = $('apiBadge');
  badge.classList.toggle('ok', !!ok);
  badge.classList.toggle('err', !ok);
  badge.innerHTML = `<div class="api-dot"></div> ${label || (ok ? 'Model ready' : 'Model offline · local scoring still works')}`;
}

function extractContactFields(resumeText) {
  const text = resumeText || '';
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const phone = (text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [])[0] || '';
  const linkedin = (text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?/i) || [])[0] || '';
  const locLine = text.split('\n').slice(0, 8).find(l =>
    /\b([A-Z][a-z]+,\s*[A-Z]{2}|Remote|USA|United States)\b/.test(l) && !l.includes('@')
  );
  return { email, phone, linkedin, location: locLine ? locLine.trim() : '' };
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
  return { important, extra, all: uniqTerms([...important, ...extra]) };
}

function skillsToInject(missingReport) {
  const important = dropCertTerms((missingReport && missingReport.important) || []);
  const extra = dropCertTerms((missingReport && missingReport.extra) || []);
  return state.mode === 'aggressive' ? uniqTerms([...important, ...extra]) : important;
}

function importantHrKeywords(keywords) {
  return uniqTerms([
    ...dropCertTerms(keywords?.primary || []),
    ...dropCertTerms(keywords?.jdSkills || []),
  ]);
}

function summaryKeywordList(keywords) {
  const primary = importantHrKeywords(keywords);
  const fill = dropCertTerms(keywords?.secondary || []);
  const list = uniqTerms([...primary, ...fill]);
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
  const summaryKw = summaryKeywordList(keywords);
  const rolePlan = planExperienceKeywords(resume, keywords);
  const extraBlock = extraSectionsPromptBlock(resume);

  const integrityBlock = aggressive
    ? `AGGRESSIVE ATS MODE:
- SUCCESS METRIC: ATS score must be ${SCORE_THRESHOLD}+ / 100.
- ADD every missing skill from the ATS REPORT into SKILLS (matching master categories) AND weave each into at least one experience bullet.
- MUST ADD THESE SKILLS: ${mustAdd.join(', ') || 'none — already covered'}
- Preserve name, contact, companies, job titles, dates, education.
- NEVER add certifications that are not in the master resume. If the master has no certifications, omit the CERTIFICATIONS section entirely.
- Do not invent employers, degrees, or job titles.`
    : `INTEGRITY / HONEST MODE:
- SUCCESS METRIC: ATS score must be ${SCORE_THRESHOLD}+ / 100.
- Keep companies, job titles, dates, education, and ownership language honest.
- ADD every IMPORTANT missing skill from the ATS REPORT into the existing Skills section and into experience bullets (tools/hardware only — never certifications).
- MUST ADD THESE IMPORTANT SKILLS: ${mustAdd.join(', ') || 'none — already covered'}
- Do NOT add certifications. If a JD certification is missing from the master resume, leave it out.
- Do not invent employers, degrees, or fake job history.`;

  return `You are a US full-time resume writer. Rewrite the MASTER resume into the EXACT Anirudh Word template (Calibri, US Letter, 1 page preferred / 2 max).

${integrityBlock}

LOCKED CONTACT — copy character-for-character:
  Email: ${cf.email || '[copy from original]'}
  Phone: ${cf.phone || '[copy from original]'}
  LinkedIn: ${cf.linkedin || '[omit if none]'}
  Location: ${cf.location || '[city/state only if present — never full street address]'}

${roles.length ? `MANDATORY ROLES (${roles.length}) — output all of them:\n${roles.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}` : ''}

${masterSkills ? `MASTER SKILLS LAYOUT — keep these category names and this order. Only add missing JD tools into the matching line:\n${masterSkills}` : ''}

${extraBlock}

ROLE DETECTED: ${(keywords.role && keywords.role.label) || headline || 'from JD'}
LOCKED SKILL SET (same every time for this JD):
  From this JD: ${(keywords.jdSkills || primary).join(', ') || 'n/a'}
  Typical for this role (market): ${(keywords.roleSkills || secondary).join(', ') || 'n/a'}
Apply the 20 US full-time resume rules. Keep the master's skill categories. Add missing tools from the locked skill set into those existing lines.

OUTPUT LAYOUT — match the Anirudh Word template exactly (this is how the downloaded .doc must look):

Line 1: Full Name in Title Case (not ALL CAPS)
Line 2: Target job title only — ${headline ? headline.split('|')[0].trim() : 'exact JD title'}. Never append JD section headings such as "Primary Responsibilities", "Why [Company]?", "Job Description", "Requirements", or "Duties".
Line 3: Phone | Email | LinkedIn | City, ST   (omit any missing field; separator is " | ")
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

CERTIFICATIONS: never add a certification that is not already on this resume. Never treat missing certs as a gap. If none exist, do not create a CERTIFICATIONS section.

MISSING IMPORTANT (PRIMARY) SKILLS: ${missingP.join(', ') || 'none'}
MISSING EXTRA (SECONDARY) SKILLS: ${missingS.join(', ') || 'none'}
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

function buildBoldPassPrompt(jd, resume, keywords) {
  const important = summaryKeywordList(keywords);
  const primary = importantHrKeywords(keywords);
  const body = summaryAndExperienceText(resume) || resume;
  return `You are the final editor for keyword bolding on a tailored US resume.
HR reads SUMMARY and EXPERIENCE. Bold only IMPORTANT JD skills — not every tool, not verbs.

JOB DESCRIPTION:
${String(jd || '').slice(0, 3500)}

MUST BOLD IN SUMMARY (8-9 important skills if they appear):
${important.join(', ') || 'n/a'}

ALSO BOLD IN EXPERIENCE when they appear (same important set, not secondary filler):
${primary.join(', ') || 'n/a'}

SUMMARY + EXPERIENCE TEXT:
${body}

Return JSON only:
{ "bold": ["exact phrase as it appears in the text", "..."] }

Rules:
1. Only phrases that appear verbatim in SUMMARY or EXPERIENCE. Copy spelling from the resume.
2. Prefer the MUST BOLD list. Do not bold generic verbs (Execute, Partner, supporting, Configured, maintained).
3. Do NOT bold company names, titles, dates, or Skills-section items.
4. Each item is 1-5 words. Skip certifications.
5. JSON only. Do not rewrite the resume.`;
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
    if (x.length < 2 || x.length > 48) return false;
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
  const locked = uniqTerms([...summaryKeywordList(state.keywords || {}), ...importantHrKeywords(state.keywords || {})]);
  const seeded = sanitizeBoldTerms(locked, resume);
  try {
    const raw = await callGemini(buildBoldPassPrompt(jd, resume, state.keywords || {}), { json: true, maxTokens: 1500 });
    const parsed = parseJsonLoose(raw);
    const fromGemini = sanitizeBoldTerms(parsed.bold || parsed.terms || parsed.keywords || [], resume)
      .filter(t => locked.some(k => {
        const a = String(t).toLowerCase();
        const b = String(k).toLowerCase();
        return a === b || a.includes(b) || b.includes(a);
      }));
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

  lines = trimExperienceBullets(lines, 7);
  return restoreExtraSections(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), masterResume || '');
}

function stableScore(jd, resume, keywords, floor) {
  const kw = keywords || state.keywords || {};
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

function cacheKeywords(jd, keywords) {
  const cleaned = mergeKeywordSets(keywords, {});
  cleaned.role = keywords.role || cleaned.role;
  cleaned.jdSkills = keywords.jdSkills || [];
  cleaned.roleSkills = keywords.roleSkills || [];
  cleaned.source = keywords.source || cleaned.source;
  state.keywords = cleaned;
  state.kwHash = jdHash(jd);
  try { localStorage.setItem(SKILLSET_CACHE + jdHash(jd), JSON.stringify(cleaned)); } catch { /* ignore */ }
}

function lockKeywordsFromJd(jd) {
  const h = jdHash(jd);
  if (state.keywords?.primary?.length && state.kwHash === h && state.keywords.role) return state.keywords;
  try {
    const raw = localStorage.getItem(SKILLSET_CACHE + h);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.primary && parsed.primary.length) {
        state.keywords = parsed;
        state.kwHash = h;
        return state.keywords;
      }
    }
  } catch { /* ignore */ }
  const built = RAGEngine.buildRoleSkillSet(jd);
  cacheKeywords(jd, built);
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
    $('roleDetectLine').textContent = `Detected role: ${roleLabel}. Skill set = this posting + typical tools for that role. Same posting → same list.`;
  }
  if ($('atsDonut')) $('atsDonut').innerHTML = svgDonut(score);
  $('freeAtsScore').textContent = score;
  $('freeAtsScore').style.color = color;
  $('freeKwMatch').textContent = `${(sc.keywordsFound || []).length}/${Math.max(unified.primary.length, 1)}`;
  $('freeKwMatchSub').textContent = 'JD + role skills found';
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
  state.lastMissingReport = { important: missingImportant, extra: missingExtra, all: missing };
  if ($('missingReport')) {
    $('missingReport').innerHTML = [
      `<div class="found-line">This report is for <strong>${roleLabel}</strong>.</div>`,
      `<div class="found-line">Already on the source resume (${found.length}): <span style="color:#0d9488">${found.join(', ') || 'none'}</span></div>`,
      `<div class="found-line">Must-add tools — both rewrite styles add these (${missingImportant.length}): <span style="color:#ea580c">${missingImportant.join(', ') || 'none'}</span></div>`,
      `<div class="found-line">Stretch tools — only Stretch for the posting adds these (${missingExtra.length}): <span style="color:#7c3aed">${missingExtra.join(', ') || 'none'}</span></div>`,
    ].join('');
  }
  renderGaps('freeGaps', [
    missing.length ? `The rewrite will drop missing tools into the existing Skills lines and into work-history bullets. Stay truthful: important only. Stretch: important + extra.` : 'No skill gaps against this locked set.',
    ...(sc.gaps || []).filter(g => !/keyword/i.test(g)),
  ].filter(Boolean));

  const cta = $('tailorCta');
  if (score < SCORE_THRESHOLD) {
    cta.innerHTML = `<div class="cta-box">
      <div class="found-line" style="color:#ea580c;margin-bottom:10px;">Score ${score}/100 is below ${SCORE_THRESHOLD}. Rewrite uses this role report.</div>
      <button class="btn-primary" onclick="runAnalysis()">Rewrite to ${SCORE_THRESHOLD}+</button>
    </div>`;
  } else {
    cta.innerHTML = `<div class="cta-box found-line" style="color:#16a34a;font-weight:600;">This already clears the 95 target. Optional: rewrite to tighten the language for this posting.</div>`;
  }
}

function renderResults(unified, resumeText) {
  const sc = unified.scorecard;
  const score = unified.atsScore;
  const before = state.preTailor;
  $('scoreSection').classList.remove('hidden');
  $('resultsSection').classList.remove('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.remove('hidden');
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
  renderGaps('gapsContent', [...(sc.gaps || []), ...(sc.improvementSuggestions || []).map(s => 'Next: ' + s)]);

  const name = (resumeText.split('\n').find(l => l.trim()) || 'Resume').trim().replace(/\s+/g, '_');
  const title = (unified.title || 'Data_Engineer').replace(/[^\w]+/g, '_');
  state.filename = `${name}_${title}.doc`;
  $('suggestedFilename').textContent = state.filename;
  $('filenameReason').textContent = 'Built from the candidate name and the posting title. Use this when you upload so recruiters can find the file.';

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
  if (!resume) { showToast('Paste the source resume first', '#e11d48'); return null; }
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
  setLoading('Scoring the match…');
  try {
    const kw = lockKeywordsFromJd(jd);
    const unified = stableScore(jd, resume, kw, false);
    renderAtsPanel(unified);
    const role = (kw.role && kw.role.label) || 'this role';
    showToast(`Match ${unified.atsScore}/100 · ${role}`);
  } catch (err) {
    showToast('Match score failed: ' + String(err.message || err).slice(0, 80), '#e11d48');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Score this match';
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
  setLoading('Talking to the model…');
  setStep(2);
  setProgress(8, 'Scoring the source resume…', 'local match rubric');

  try {
    lockKeywordsFromJd(jd);
    state.preTailor = snapshotScore(stableScore(jd, resume, state.keywords, false));
    const missingReport = missingSkillReport(state.keywords, resume);
    state.lastMissingReport = missingReport;
    setProgress(28, `Skill set locked: ${(state.keywords.primary || []).slice(0, 4).join(', ')}…`, 'posting + role tools');
    setStep(3);
    setLoading('Rewriting the page…');
    setProgress(40, 'Rewriting the resume for this posting…', state.mode === 'aggressive' ? 'Stretch for the posting' : 'Stay truthful');

    const tailored = cleanupResume(await callGemini(buildRewritePrompt(jd, resume, state.keywords, missingReport), { maxTokens: 7000 }));
    if (!tailored || tailored.length < 200) throw new Error('Rewrite was empty');
    state.tailoredResume = tailored;
    $('outputArea').textContent = tailored;

    setStep(4);
    setProgress(78, 'Scoring the rewritten page…', `Target ${SCORE_THRESHOLD}+`);
    setLoading('Scoring the draft…');
    let { unified, resume: polished } = await scoreTailoredResume(jd, state.tailoredResume);
    state.tailoredResume = polished;
    $('outputArea').textContent = polished;

    let pass = 0;
    while (unified.atsScore < SCORE_THRESHOLD && pass < MAX_BOOST_PASSES) {
      pass += 1;
      setProgress(80 + pass * 3, `Score ${unified.atsScore}/100 — tightening pass ${pass}/${MAX_BOOST_PASSES} toward ${SCORE_THRESHOLD}+…`, state.mode === 'aggressive' ? 'Stretch' : 'Truthful');
      setLoading(`Tightening pass ${pass}…`);
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
    setProgress(96, 'Choosing bold words in Summary and Experience…', 'emphasis pass');
    setLoading('Finalizing emphasis…');
    await finalizeBolding(jd, state.tailoredResume);
    renderResults(unified, state.tailoredResume);
    setProgress(100, `Done — match ${unified.atsScore}/100`, state.lastModel || unified.source);
    showToast(unified.atsScore >= SCORE_THRESHOLD
      ? `Draft scored ${unified.atsScore}/100`
      : `Score ${unified.atsScore}/100 — use Push the score for another pass`);
  } catch (err) {
    showToast('Rewrite failed: ' + String(err.message || err).slice(0, 90), '#e11d48');
    $('progressSection').classList.add('hidden');
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
  setProgress(15, 'Closing remaining gaps…', 'surgical edit');
  setLoading('Tightening the draft…');
  try {
    const boosted = cleanupResume(await callGemini(
      buildBoostPrompt(inputs.jd, state.tailoredResume, { ...state.scorecard, atsScore: state.scorecard?.atsScore }, state.keywords || {}),
      { maxTokens: 7000 }
    ));
    const nextText = boosted && boosted.length > 200 ? boosted : state.tailoredResume;
    setProgress(70, 'Scoring the tightened draft…', '');
    const scored = await scoreTailoredResume(inputs.jd, nextText);
    state.tailoredResume = scored.resume;
    const unified = scored.unified;
    state.scorecard = unified.scorecard;
    setProgress(90, 'Choosing bold words in Summary and Experience…', 'emphasis pass');
    await finalizeBolding(inputs.jd, scored.resume);
    renderResults(unified, scored.resume);
    setProgress(100, `Done — match ${unified.atsScore}/100`, '');
    showToast(`Pushed to ${unified.atsScore}/100`);
  } catch (err) {
    showToast('Push failed: ' + String(err.message || err).slice(0, 80), '#e11d48');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push the score';
    stopLoading();
  }
}

function cleanupResume(text) {
  let t = (text || '').replace(/```(?:text|markdown)?/gi, '').trim();
  t = t.replace(/^here is[^\n]*\n+/i, '');
  return sanitizeResumeHeadline(t).trim();
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

function resetAndRun() {
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
  $('outputArea').textContent = '';
  if ($('resumePaper')) $('resumePaper').innerHTML = '';
  $('analyzeBtn').disabled = false;
  if ($('rerunBtn')) $('rerunBtn').classList.add('hidden');
  setStep(1);
  showToast('Results cleared — your posting and source resume are still here');
}

function clearAll() {
  $('jdInput').value = '';
  $('resumeInput').value = '';
  updateCounts();
  resetAndRun();
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
  return escapeHtml(text).replace(/(https?:\/\/[^\s|]+|linkedin\.com\/[^\s|]+)/gi, url => {
    const href = /^https?:\/\//.test(url) ? url : 'https://' + url;
    return `<a href="${href}">${url}</a>`;
  });
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

function collectBoldTerms() {
  if (state.boldFinalized && state.boldTerms && state.boldTerms.length) {
    return state.boldTerms.slice();
  }
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
  const max = state.boldFinalized ? 40 : 22;
  for (const term of collectBoldTerms()) {
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

function resumeCss() {
  const { fs, lh } = state.docFit || { fs: 1, lh: 1 };
  const p = (n) => (Math.round(n * 100) / 100) + 'pt';
  const fsName = p(18 * fs);
  const lhName = p(21.9 * fs * (1 + (lh - 1) * 0.35));
  const fsTitle = p(14 * fs);
  const fsRole = p(11 * fs);
  const lhRole = p(11 * fs * (1 + (lh - 1) * 0.4));
  const fsBody = p(10 * fs);
  const lhBody = p(11.5 * fs * lh);
  const spSection = p(7.1 * lh);
  const spJob = p(1.85 * lh);
  const spBullet = p(2.05 * lh);
  const spBody = p(1.5 * lh);
  const spSkill = p(1.7 * lh);
  return `
    p { margin: 0; padding: 0; }
    .WordSection1 { text-align: left; }
    .r-name { font-family: Calibri, Arial, sans-serif; font-size: ${fsName}; font-weight: bold; text-align: center; color: #000000; margin: 0; padding: 0; line-height: ${lhName}; mso-line-height-rule: exactly; }
    .r-headline { font-family: Calibri, Arial, sans-serif; font-size: ${fsTitle}; font-weight: bold; text-align: center; color: #000000; margin: 3.2pt 0 0 0; padding: 0; line-height: ${fsTitle}; mso-line-height-rule: exactly; }
    .r-contact { font-family: Calibri, Arial, sans-serif; font-size: ${fsBody}; text-align: center; color: #000000; margin: 0; padding: 0; line-height: ${lhBody}; mso-line-height-rule: exactly; }
    .r-rule { font-family: Calibri, Arial, sans-serif; font-size: 1pt; line-height: 1pt; mso-line-height-rule: exactly; margin: 0; padding: 0; height: 1pt; border: none; border-top: 0.5pt solid #000000; overflow: hidden; }
    .r-section { font-family: Calibri, Arial, sans-serif; font-size: ${fsTitle}; font-weight: bold; color: #000000; text-transform: uppercase; letter-spacing: 0; border-bottom: 0.5pt solid #000000; margin: ${spSection} 0 0 4.55pt; padding: 0; line-height: ${fsTitle}; mso-line-height-rule: exactly; text-align: left; }
    .r-job { width: 100%; border-collapse: collapse; margin: ${spJob} 0 0 0; border: none; }
    .r-job td { font-family: Calibri, Arial, sans-serif; font-size: ${fsRole}; font-weight: bold; color: #000000; padding: 0; line-height: ${lhRole}; vertical-align: bottom; mso-line-height-rule: exactly; border: none; text-align: left; }
    .r-job td:first-child { padding-left: 4.55pt; }
    .r-dates { text-align: right; white-space: nowrap; width: 32%; }
    .r-role { font-family: Calibri, Arial, sans-serif; font-size: ${fsRole}; font-weight: bold; color: #000000; margin: ${spJob} 0 0 4.55pt; line-height: ${lhRole}; text-align: left; }
    .r-role i, .r-job i { font-style: italic; font-weight: bold; }
    .r-bullet { font-family: Calibri, Arial, sans-serif; font-size: ${fsBody}; color: #000000; margin: 0 0 0 18pt; text-indent: -13.5pt; line-height: ${lhBody}; mso-line-height-rule: exactly; padding: 0; text-align: left; }
    .r-bmark, .r-btext { text-align: left; }
    .r-job + .r-bullet, .r-role + .r-bullet { margin-top: ${spBullet}; }
    .r-body { font-family: Calibri, Arial, sans-serif; font-size: ${fsBody}; color: #000000; margin: ${spBody} 0 0 4.55pt; padding: 0; line-height: ${lhBody}; mso-line-height-rule: exactly; text-align: justify; }
    .r-skill-line { font-family: Calibri, Arial, sans-serif; font-size: ${fsBody}; color: #000000; margin: ${spSkill} 0 0 4.55pt; padding: 0; line-height: ${lhBody}; mso-line-height-rule: exactly; text-align: justify; }
    .r-section + .r-skill-line, .r-section + .r-body { margin-top: ${spBody}; }
    .r-skill-label { font-weight: bold; color: #000000; }
    b, strong { font-weight: bold; color: #000000; }
    a { color: #1a56c4; text-decoration: underline; }
  `;
}

function inchesToPx(inches) {
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;left:-9999px;top:0;height:' + inches + 'in';
  document.body.appendChild(d);
  const px = d.offsetHeight;
  d.remove();
  return px || inches * 96;
}

function applyResumeFitVars(el, fs, lh) {
  if (!el || !el.style) return;
  const pt = (n) => (Math.round(n * 100) / 100) + 'pt';
  el.style.setProperty('--fs-name', pt(18 * fs));
  el.style.setProperty('--lh-name', pt(21.9 * fs * (1 + (lh - 1) * 0.35)));
  el.style.setProperty('--fs-title', pt(14 * fs));
  el.style.setProperty('--fs-role', pt(11 * fs));
  el.style.setProperty('--lh-role', pt(11 * fs * (1 + (lh - 1) * 0.4)));
  el.style.setProperty('--fs-body', pt(10 * fs));
  el.style.setProperty('--lh-body', pt(11.5 * fs * lh));
  el.style.setProperty('--sp-section', pt(7.1 * lh));
  el.style.setProperty('--sp-job', pt(1.85 * lh));
  el.style.setProperty('--sp-bullet', pt(2.05 * lh));
  el.style.setProperty('--sp-body', pt(1.5 * lh));
  el.style.setProperty('--sp-skill', pt(1.7 * lh));
}

function measureResumeContent(paper) {
  let max = 0;
  for (const el of paper.children) {
    max = Math.max(max, el.offsetTop + el.offsetHeight);
  }
  return max;
}

function fitResumeToPage(paper) {
  const FS_MIN = 0.92;
  const FS_MAX = 1.2;
  const LH_MIN = 0.88;
  const LH_MAX = 1.55;
  const target = inchesToPx(11 - 0.11 - 0.19);
  const loBound = target * 0.96;
  const hiBound = target * 0.995;
  const measure = () => {
    void paper.offsetHeight;
    return measureResumeContent(paper);
  };
  const apply = (fs, lh) => applyResumeFitVars(paper, fs, lh);

  let fs = 1;
  let lh = 1;
  apply(1, 1);
  let h = measure();

  if (h > hiBound) {
    let lo = LH_MIN;
    let hi = 1;
    let best = LH_MIN;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      apply(1, mid);
      if (measure() <= hiBound) { best = mid; lo = mid; }
      else hi = mid;
    }
    lh = best;
    apply(fs, lh);
    h = measure();
    if (h > hiBound) {
      let flo = FS_MIN;
      let fhi = 1;
      let fbest = FS_MIN;
      for (let i = 0; i < 12; i++) {
        const mid = (flo + fhi) / 2;
        apply(mid, lh);
        if (measure() <= hiBound) { fbest = mid; flo = mid; }
        else fhi = mid;
      }
      fs = fbest;
      apply(fs, lh);
      h = measure();
    }
    if (h > hiBound * 1.01) {
      fs = FS_MIN;
      lh = LH_MIN;
      apply(fs, lh);
      return { fs, lh, pages: 2 };
    }
    return { fs, lh, pages: 1 };
  }

  if (h < loBound) {
    let lo = 1;
    let hi = LH_MAX;
    let best = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      apply(1, mid);
      const ch = measure();
      if (ch < loBound) { best = mid; lo = mid; }
      else if (ch > hiBound) hi = mid;
      else { best = mid; break; }
    }
    lh = best;
    apply(fs, lh);
    h = measure();
    if (h < loBound) {
      let flo = 1;
      let fhi = FS_MAX;
      let fbest = 1;
      for (let i = 0; i < 12; i++) {
        const mid = (flo + fhi) / 2;
        apply(mid, lh);
        const ch = measure();
        if (ch < loBound) { fbest = mid; flo = mid; }
        else if (ch > hiBound) fhi = mid;
        else { fbest = mid; break; }
      }
      fs = fbest;
      apply(fs, lh);
    }
  }
  return { fs, lh, pages: 1 };
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
  paper.innerHTML = parseResumeToHtml(cleaned);
  applyResumeFitVars(paper, 1, 1);
  const fit = fitResumeToPage(paper);
  state.docFit = fit;
  applyResumeFitVars(paper, fit.fs, fit.lh);
  if (fit.pages > 1) {
    paper.classList.add('two-page');
    paper.style.minHeight = (11 * fit.pages) + 'in';
  } else {
    paper.style.minHeight = '11in';
  }
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
      margin: 0.11in 0.10in 0.19in 0.10in;
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
    }
    body { font-family: Calibri, Arial, sans-serif; font-size: ${(10 * (state.docFit?.fs || 1)).toFixed(2)}pt; color: #000000; line-height: ${(11.5 * (state.docFit?.fs || 1) * (state.docFit?.lh || 1)).toFixed(2)}pt; mso-line-height-rule: exactly; text-align: left; }
    ${resumeCss()}
  </style>
</head>
<body>
  <div class="WordSection1" align="left" style="text-align:left">${parseResumeToHtml(content)}</div>
</body>
</html>`;
}

function downloadDocx() {
  const content = currentResumeText();
  if (!content) { showToast('Nothing to save yet', '#e11d48'); return; }
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = (state.filename || 'tailored_resume.txt').replace(/\.doc$/i, '.txt');
  a.click();
  showToast('Text file saved');
}

function copyToClipboard() {
  navigator.clipboard.writeText(currentResumeText()).then(() => showToast('Copied to clipboard'));
}

function resumePaperLayoutCss() {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .resume-paper {
      background: #fff;
      color: #000;
      width: 8.5in;
      min-height: 11in;
      max-width: none;
      margin: 0;
      box-sizing: border-box;
      position: relative;
      padding: 0.11in 0.10in 0.19in 0.10in;
      box-shadow: none;
      font-family: Calibri, Arial, sans-serif;
      font-size: var(--fs-body, 10pt);
      line-height: var(--lh-body, 11.5pt);
    }
    .resume-paper.two-page { min-height: auto; background-image: none; }
    .resume-paper .r-name {
      font-size: var(--fs-name, 18pt); font-weight: 700; text-align: center; color: #000;
      margin: 0; padding: 0; line-height: var(--lh-name, 21.9pt);
    }
    .resume-paper .r-headline {
      font-size: var(--fs-title, 14pt); font-weight: 700; text-align: center; color: #000;
      margin: 3.2pt 0 0 0; padding: 0; line-height: var(--fs-title, 14pt);
    }
    .resume-paper .r-contact {
      font-size: var(--fs-body, 10pt); text-align: center; color: #000;
      margin: 0; padding: 0; line-height: var(--lh-body, 11.5pt);
    }
    .resume-paper .r-rule {
      font-size: 1pt; line-height: 1pt; margin: 0; padding: 0; height: 1pt;
      border: 0; border-top: 0.5pt solid #000; overflow: hidden;
    }
    .resume-paper .r-section {
      font-size: var(--fs-title, 14pt); font-weight: 700; text-transform: uppercase; letter-spacing: 0;
      border-bottom: 0.5pt solid #000; margin: var(--sp-section, 7.1pt) 0 0 4.55pt; padding: 0;
      color: #000; line-height: var(--fs-title, 14pt); text-align: left;
    }
    .resume-paper .r-job { width: 100%; border-collapse: collapse; margin: var(--sp-job, 1.85pt) 0 0 0; }
    .resume-paper .r-job td {
      font-size: var(--fs-role, 11pt); font-weight: 700; color: #000; padding: 0; line-height: var(--lh-role, 11pt);
      vertical-align: bottom; font-family: Calibri, Arial, sans-serif; text-align: left;
    }
    .resume-paper .r-job td:first-child { padding-left: 4.55pt; }
    .resume-paper .r-dates { text-align: right; white-space: nowrap; width: 32%; }
    .resume-paper .r-role {
      font-size: var(--fs-role, 11pt); font-weight: 700; color: #000;
      margin: var(--sp-job, 1.85pt) 0 0 4.55pt; line-height: var(--lh-role, 11pt); text-align: left;
    }
    .resume-paper .r-role i, .resume-paper .r-job i { font-style: italic; font-weight: 700; }
    .resume-paper .r-bullet {
      display: flex; align-items: flex-start; gap: 0;
      font-size: var(--fs-body, 10pt); color: #000;
      margin: 0 0 0 4.55pt; padding: 0; text-indent: 0; text-align: left;
      line-height: var(--lh-body, 11.5pt);
    }
    .resume-paper .r-bmark { flex: 0 0 12pt; width: 12pt; text-align: left; line-height: inherit; }
    .resume-paper .r-btext { flex: 1 1 auto; min-width: 0; text-align: left; text-indent: 0; }
    .resume-paper .r-job + .r-bullet, .resume-paper .r-role + .r-bullet { margin-top: var(--sp-bullet, 2.05pt); }
    .resume-paper .r-body {
      font-size: var(--fs-body, 10pt); color: #000; margin: var(--sp-body, 1.5pt) 0 0 4.55pt; padding: 0;
      line-height: var(--lh-body, 11.5pt); text-align: justify;
    }
    .resume-paper .r-skill-line {
      font-size: var(--fs-body, 10pt); color: #000; margin: var(--sp-skill, 1.7pt) 0 0 4.55pt; padding: 0;
      line-height: var(--lh-body, 11.5pt); text-align: justify;
    }
    .resume-paper .r-section + .r-skill-line, .resume-paper .r-section + .r-body { margin-top: var(--sp-body, 1.5pt); }
    .resume-paper .r-skill-label { font-weight: 700; color: #000; }
    .resume-paper b, .resume-paper strong { font-weight: 700; color: #000; }
    .resume-paper a { color: #1a56c4; text-decoration: underline; }
    @page { size: letter portrait; margin: 0; }
    @media print {
      html, body { margin: 0; background: #fff; }
      .resume-paper { width: 8.5in; min-height: auto; box-shadow: none; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function printResume() {
  const content = currentResumeText();
  if (!content) { showToast('Nothing to print yet', '#e11d48'); return; }
  const paper = $('resumePaper');
  if (!paper || !paper.innerHTML.trim()) showFormattedResume(content);
  const live = $('resumePaper');
  if (!live || !live.innerHTML.trim()) { showToast('Nothing to print yet', '#e11d48'); return; }
  const clone = live.cloneNode(true);
  clone.classList.remove('two-page');
  clone.style.minHeight = 'auto';
  clone.style.boxShadow = 'none';
  clone.style.margin = '0';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title>
    <style>${resumePaperLayoutCss()}</style>
  </head><body>${clone.outerHTML}
  <script>window.onload=function(){window.focus();setTimeout(function(){window.print();},200);}<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) showToast('Allow pop-ups to print', '#e11d48');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
      return;
    }
  } catch { /* offline */ }
  markGemini(false);
  $('serverHint').classList.remove('hidden');
}

$('jdInput').addEventListener('input', updateCounts);
$('resumeInput').addEventListener('input', updateCounts);
$('outputArea').addEventListener('input', () => {
  state.tailoredResume = $('outputArea').textContent;
  showFormattedResume(state.tailoredResume);
});
initTracks();
pingHealth();
updateCounts();
