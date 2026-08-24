/* ATS Resume Studio — Gemini scoring + tailoring */
const SCORE_THRESHOLD = 95;
const MAX_BOOST_PASSES = 6;
const SKILLSET_CACHE = 'ats_skillset_v3_';
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
  { id: 'auto', label: 'Auto from JD (any role)', headline: '' },
  { id: 'sde', label: 'Senior Data Engineer', headline: 'Senior Data Engineer | Python | SQL | Spark | AWS | GCP | Databricks' },
  { id: 'cloud', label: 'Cloud Data Engineer', headline: 'Cloud Data Engineer | AWS | GCP | Spark | Airflow | Kafka' },
  { id: 'dbx', label: 'Databricks Engineer', headline: 'Databricks Engineer | PySpark | Delta Lake | Unity Catalog | Spark' },
  { id: 'gcp', label: 'GCP Data Engineer', headline: 'GCP Data Engineer | BigQuery | Dataflow | Pub/Sub | Composer | GCS' },
  { id: 'aws', label: 'AWS Data Engineer', headline: 'AWS Data Engineer | Glue | Redshift | EMR | S3 | Kinesis | MWAA' },
  { id: 'dc', label: 'Data Center Technician', headline: 'Data Center Technician | Linux | Cabling | TCP/IP | PDU | HVAC' },
];

const TEN_QUESTIONS = [
  { key: 'role', label: 'What role is this person targeting?' },
  { key: 'years', label: 'How many years of experience are visible?' },
  { key: 'strongestTech', label: 'What are the strongest technologies?' },
  { key: 'cloud', label: 'Which cloud platforms are demonstrated?' },
  { key: 'problemsSolved', label: 'What kinds of problems have they solved?' },
  { key: 'measurableResults', label: 'Are there measurable results?' },
  { key: 'jdMatch', label: 'Does experience match this JD?' },
];

const RULE_META = [
  { key: 'keywordsInExperience', label: 'Keywords in experience', max: 25 },
  { key: 'keywordCredibility', label: 'Skills backed by work', max: 10 },
  { key: 'secondaryKeywords', label: 'Secondary keywords', max: 8 },
  { key: 'quantified', label: 'Quantified bullets', max: 15 },
  { key: 'achievementsNotDuties', label: 'Achievements, not duties', max: 8 },
  { key: 'tenSecond', label: '10-second top third', max: 12 },
  { key: 'format', label: 'ATS-safe format', max: 8 },
  { key: 'structure', label: 'Section structure', max: 6 },
  { key: 'bulletQuality', label: 'Bullet quality', max: 8 },
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
};

function $(id) { return document.getElementById(id); }

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function wordCount(s) { return s.trim() ? s.trim().split(/\s+/).length : 0; }

function jdHash(str) {
  return window.RAGEngine ? RAGEngine.jdHash(str) : String(str.length);
}

function showToast(msg, color = '#22c55e') {
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

function currentHeadline() {
  const track = TRACKS.find(t => t.id === state.track) || TRACKS[0];
  if (track.headline) return track.headline;
  const role = state.keywords && state.keywords.role;
  if (role) return role.title || role.label || '';
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
  badge.innerHTML = `<div class="api-dot"></div> ${label || (ok ? 'Gemini connected' : 'Gemini offline · RAG fallback')}`;
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
  const STOP = /^(EDUCATION|CERTIF|PROJECT|SKILLS|SUMMARY|OBJECTIVE|PROFILE)/i;
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

function buildRewritePrompt(jd, resume, keywords, missingReport) {
  const primary = keywords.primary || [];
  const secondary = keywords.secondary || [];
  const roles = extractRolesFromResume(resume);
  const cf = extractContactFields(resume);
  const headline = currentHeadline();
  const aggressive = state.mode === 'aggressive';
  const masterSkills = masterSkillsBlock(resume);
  const mustAdd = skillsToInject(missingReport);

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

  return `You are a US full-time resume writer. Rewrite the MASTER resume for this JD into the EXACT layout used by professional US staffing support resumes (Calibri, 1 page preferred / 2 max).

${integrityBlock}

LOCKED CONTACT — copy character-for-character:
  Email: ${cf.email || '[copy from original]'}
  Phone: ${cf.phone || '[copy from original]'}
  LinkedIn: ${cf.linkedin || '[omit if none]'}
  Location: ${cf.location || '[city/state only if present — never full street address]'}

${roles.length ? `MANDATORY ROLES (${roles.length}) — output all of them:\n${roles.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}` : ''}

${masterSkills ? `MASTER SKILLS LAYOUT — keep these category names and this order. Only add missing JD tools into the matching line:\n${masterSkills}` : ''}

ROLE DETECTED: ${(keywords.role && keywords.role.label) || headline || 'from JD'}
LOCKED SKILL SET (same every time for this JD):
  From this JD: ${(keywords.jdSkills || primary).join(', ') || 'n/a'}
  Typical for this role (market): ${(keywords.roleSkills || secondary).join(', ') || 'n/a'}
Apply the 20 US full-time resume rules. Keep the master's skill categories. Add missing tools from the locked skill set into those existing lines.

OUTPUT LAYOUT — match this structure exactly (this is how the downloaded .doc must look):

Line 1: Full Name in Title Case (not ALL CAPS)
Line 2: Target job title only — ${headline ? headline.split('|')[0].trim() : 'exact JD title'}
Line 3: Phone | Email | LinkedIn | City, ST   (omit any missing field; separator is " | ")
Line 4: blank
SUMMARY
<one paragraph, 4-6 lines, no bullets. Open with the JD title and years. Include stack, cloud, and one quantified result.>
SKILLS
<COPY the master resume skill categories and their order exactly — same labels, same grouping>
(Add missing JD technologies into the matching existing line. Example: Python → Programming, Glue → Cloud, Kafka → Streaming.)
(Do NOT invent a new "Technical Skills:" line unless the master already has one.)
(Do NOT replace the master's skill layout with a different template.)
PROFESSIONAL EXPERIENCE
Company | Location | Job Title Month YYYY – Month YYYY
- Bullet ending with a period.
- Bullet ending with a period.
EDUCATION
Degree, University, City, ST

CERTIFICATIONS RULE (non-negotiable):
- Include CERTIFICATIONS only if they already exist in the master resume.
- If a JD asks for a certification the master does not have, leave it out. Do not add, suggest, or mention it.
- If the master has no certifications, omit the CERTIFICATIONS section entirely.

TARGET SCORE: ${SCORE_THRESHOLD}+ / 100 is mandatory in both Integrity and Aggressive modes.

ROLE LINE FORMAT (mandatory — same as the model resumes):
  Palantir | NY | Data Engineer May 2024 – Present
  Company | Location | Title then the dates on the SAME line, no extra pipes around dates.
  Example: Stripe | Remote | Software Engineer September 2024 – Present

BULLETS:
- Start with hyphen-space "- "
- Action → Technology → Problem → Result
- Each role MUST have 6 or 7 bullets (7 for the current/most recent role, 6-7 for others). Not 4, not 8+.
- 1-2 lines each
- Every bullet ends with a period

Do NOT use tables, columns, icons, photos, skill bars, or ALL-CAPS name.

PRIMARY KEYWORDS (must appear in SKILLS and in experience — these are technologies/tools, not certifications): ${primary.join(', ')}
SECONDARY KEYWORDS (appear at least once): ${secondary.join(', ')}

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
  return `You are a precision ATS editor. The resume scored below ${SCORE_THRESHOLD}/100. Your job is to push it to ${SCORE_THRESHOLD}+. Output the complete resume.

Mode: ${aggressive ? 'AGGRESSIVE' : 'INTEGRITY / HONEST'}
Preserve name, contact, companies, titles, dates, education.
Keep the SAME layout: Title Case name, job title line, contact line, SUMMARY paragraph, SKILLS using the master's category labels, PROFESSIONAL EXPERIENCE with 6-7 bullets per role, role lines as Company | Location | Title Month YYYY – Month YYYY, hyphen bullets, EDUCATION.
Keep the master's skill categories. Add missing tools into those existing lines. Do not invent a new Technical Skills line.
Each role must have 6 or 7 bullets. If a role has fewer than 6, add bullets. If it has more than 7, keep the strongest 7.

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
    if (isSectionHeader(lines[i]) && !/EXPERIENCE/i.test(lines[i])) { end = i; break; }
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
    if (i > start && isSectionHeader(t) && !/SKILL/.test(t)) break;
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
    if (isSectionHeader(lines[i])) { end = i; break; }
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

function polishResumeForAts(resume, keywords, masterResume) {
  if (!resume) return resume;
  const primary = dropCertTerms(keywords.primary || []);
  const secondary = dropCertTerms(keywords.secondary || []);
  const aliasMap = keywords.aliasMap || {};
  const inject = state.mode === 'aggressive' ? uniqTerms([...primary, ...secondary]) : primary;
  let lines = resume.split('\n');
  const full = () => lines.join('\n');
  const { start: expStart, end: expEnd } = experienceBounds(lines);
  const expText = lines.slice(expStart, expEnd).join('\n');

  const missingAnywhere = inject.filter(k => !keywordPresent(k, full(), aliasMap));
  const missingInExp = inject.filter(k => !keywordPresent(k, expText, aliasMap));
  const toSkills = uniqTerms([...missingAnywhere, ...inject]);

  lines = applyMasterSkills(lines, masterResume || '', toSkills);

  const expAfter = experienceBounds(lines);
  const bulletIdx = [];
  for (let i = expAfter.start; i < expAfter.end; i++) {
    if (isBulletLine(lines[i])) bulletIdx.push(i);
  }
  let bi = 0;
  for (const kw of missingInExp) {
    if (!bulletIdx.length) break;
    const idx = bulletIdx[bi % bulletIdx.length];
    bi += 1;
    if (keywordPresent(kw, lines[idx], aliasMap)) continue;
    lines[idx] = lines[idx].replace(/\.\s*$/, '') + `, ${kw}.`;
  }

  lines = trimExperienceBullets(lines, 7);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

function renderTen(containerId, test) {
  const el = $(containerId);
  el.innerHTML = TEN_QUESTIONS.map(q => {
    const pass = !!test[q.key];
    return `<div class="ten-item ${pass ? 'pass' : 'fail'}"><span class="check">${pass ? '✓' : '✕'}</span><div>${q.label}${test.notes && test.notes.length && q.key === 'jdMatch' ? '<div class="hint">' + test.notes.slice(0, 2).join(' ') + '</div>' : ''}</div></div>`;
  }).join('');
}

function renderRuleBars(scores) {
  $('ruleBars').innerHTML = RULE_META.map(r => {
    const val = Number(scores[r.key] || 0);
    const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
    return `<div class="rule-row"><div>${r.label}</div><div class="rule-track"><div class="rule-fill" style="width:${pct}%"></div></div><div>${val}/${r.max}</div></div>`;
  }).join('');
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
    el.innerHTML = '<div style="color:#4ade80;font-size:13px;font-weight:600;">No critical gaps.</div>';
    return;
  }
  el.innerHTML = items.map(g => `<div class="gap-item">${g}</div>`).join('');
}

function renderAtsPanel(unified) {
  const sc = unified.scorecard;
  const score = unified.atsScore;
  const color = score >= 95 ? '#4ade80' : score >= 70 ? '#fbbf24' : '#f87171';
  const kw = state.keywords || unified;
  const roleLabel = (kw.role && kw.role.label) || unified.title || 'Detected from JD';
  $('freeAtsPanel').classList.remove('hidden');
  $('scoreSourceLabel').textContent = roleLabel;
  if ($('roleDetectLine')) {
    $('roleDetectLine').textContent = `Role: ${roleLabel} · Skill set = this JD + typical market tools for that role. Same JD always produces this same list.`;
  }
  $('freeAtsScore').textContent = score;
  $('freeAtsScore').style.color = color;
  $('freeKwMatch').textContent = `${(sc.keywordsFound || []).length}/${Math.max(unified.primary.length, 1)}`;
  $('freeKwMatchSub').textContent = 'JD + role skills found';
  $('freeFmtCheck').textContent = sc.formatCheck || '--';
  $('freeFmtCheck').style.color = sc.formatCheck === 'PASS' ? '#4ade80' : '#fbbf24';
  $('freeBulletScore').textContent = `${sc.bulletsWithMetrics || 0}/${sc.bulletsTotal || 0}`;
  renderRuleBars(unified.ruleScores || {});
  renderTen('tenSecondList', sc.tenSecondTest || {});
  renderKeywordGrid('freeKwGrid', unified.primary, unified.secondary, sc.keywordsFound, sc.secondaryFound);
  const matched = (sc.keywordsFound || []).length + (sc.secondaryFound || []).length;
  const total = unified.primary.length + unified.secondary.length;
  const pct = total ? Math.round((matched / total) * 100) : 0;
  $('freeKwBar').style.width = pct + '%';
  $('freeKwBarLabel').textContent = `${matched}/${total} skills present · ${pct}%`;

  const missingImportant = dropCertTerms(sc.keywordsMissing || []);
  const missingExtra = dropCertTerms(sc.secondaryMissing || []);
  const missing = uniqTerms([...missingImportant, ...missingExtra]);
  const found = [...(sc.keywordsFound || []), ...(sc.secondaryFound || [])];
  state.lastMissingReport = { important: missingImportant, extra: missingExtra, all: missing };
  if ($('missingReport')) {
    $('missingReport').innerHTML = [
      `<div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">This report is for <strong style="color:#93c5fd">${roleLabel}</strong>. Skill set = this JD + typical market tools for the role.</div>`,
      `<div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Found on master resume (${found.length}): <span style="color:#4ade80">${found.join(', ') || 'none'}</span></div>`,
      `<div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Important missing — Integrity and Aggressive both add these (${missingImportant.length}): <span style="color:#f87171">${missingImportant.join(', ') || 'none'}</span></div>`,
      `<div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Extra market skills — Aggressive also adds these (${missingExtra.length}): <span style="color:#fb923c">${missingExtra.join(', ') || 'none'}</span></div>`,
    ].join('');
  }
  renderGaps('freeGaps', [
    missing.length ? `Tailor will add the missing skills into the existing Skills section and experience bullets. Integrity: important only. Aggressive: important + extra.` : 'No skill gaps against this locked set.',
    ...(sc.gaps || []).filter(g => !/keyword/i.test(g)),
  ].filter(Boolean));

  const cta = $('tailorCta');
  if (score < SCORE_THRESHOLD) {
    cta.innerHTML = `<div class="cta-box">
      <div style="font-size:13px;color:#fbbf24;margin-bottom:10px;">Score ${score}/100 is below ${SCORE_THRESHOLD}. Tailor uses this role report: Integrity adds important missing skills; Aggressive adds important + extra. Both keep companies, dates, and education honest.</div>
      <button class="btn-primary" onclick="runAnalysis()">AI tailor to ${SCORE_THRESHOLD}+</button>
    </div>`;
  } else {
    cta.innerHTML = `<div class="cta-box" style="color:#4ade80;font-size:13px;font-weight:600;">Passes the 95 target. Optional: tailor to polish language for this JD.</div>`;
  }
}

function renderResults(unified, resumeText) {
  const sc = unified.scorecard;
  const score = unified.atsScore;
  $('scoreSection').classList.remove('hidden');
  $('resultsSection').classList.remove('hidden');
  $('atsScore').textContent = score;
  $('atsScore').className = 'score-value ' + (score >= 95 ? 'green' : score >= 70 ? 'yellow' : 'red');
  $('kwMatch').textContent = `${(sc.keywordsFound || []).length}/${Math.max(unified.primary.length, 10)}`;
  $('fmtCheck').textContent = sc.formatCheck || '--';
  $('confScore').textContent = sc.confidenceLevel || '--';

  $('outputArea').textContent = resumeText;
  showFormattedResume(resumeText);
  setResumeView('formatted');
  $('scorecardContent').innerHTML = [
    ['ATS score', score + '/100', score >= 95 ? 'sc-green' : 'sc-yellow'],
    ['Primary keywords', `${(sc.keywordsFound || []).length} found · ${(sc.keywordsMissing || []).length} missing`, 'sc-blue'],
    ['Secondary keywords', `${(sc.secondaryFound || []).length} found`, 'sc-blue'],
    ['Bullets with metrics', `${sc.bulletsWithMetrics}/${sc.bulletsTotal}`, 'sc-yellow'],
    ['Format', sc.formatCheck, sc.formatCheck === 'PASS' ? 'sc-green' : 'sc-yellow'],
    ['Sections', sc.sectionCheck, sc.sectionCheck === 'PASS' ? 'sc-green' : 'sc-red'],
    ['Confidence', sc.confidenceLevel, 'sc-yellow'],
    ['Reason', sc.confidenceReason || '—', ''],
  ].map(([l, v, c]) => `<div class="scorecard-row"><span class="sc-label">${l}</span><span class="sc-value ${c}">${v}</span></div>`).join('')
    + renderRuleHtml(unified.ruleScores || {});

  renderKeywordGrid('kwGrid', unified.primary, unified.secondary, sc.keywordsFound, sc.secondaryFound);
  const matched = (sc.keywordsFound || []).length;
  const pct = Math.round((matched / Math.max(unified.primary.length, 1)) * 100);
  $('kwProgressBar').style.width = pct + '%';
  $('kwProgressLabel').textContent = `${matched} of ${unified.primary.length} primary keywords in the tailored resume`;
  renderTen('resultTenList', sc.tenSecondTest || {});
  renderGaps('gapsContent', [...(sc.gaps || []), ...(sc.improvementSuggestions || []).map(s => 'Fix: ' + s)]);

  const name = (resumeText.split('\n').find(l => l.trim()) || 'Resume').trim().replace(/\s+/g, '_');
  const title = (unified.title || 'Data_Engineer').replace(/[^\w]+/g, '_');
  state.filename = `${name}_${title}.doc`;
  $('suggestedFilename').textContent = state.filename;
  $('filenameReason').textContent = 'Named from candidate + JD title. Use this when submitting so recruiters can find the file.';

  if (score < SCORE_THRESHOLD) $('boostBtn').classList.remove('hidden');
  else $('boostBtn').classList.add('hidden');
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
  if (!jd) { showToast('Paste a job description first', '#ef4444'); return null; }
  if (!resume) { showToast('Paste your master resume first', '#ef4444'); return null; }
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
  setLoading('ATS check…');
  try {
    const kw = lockKeywordsFromJd(jd);
    const unified = stableScore(jd, resume, kw, false);
    renderAtsPanel(unified);
    const role = (kw.role && kw.role.label) || 'this role';
    showToast(`ATS ${unified.atsScore}/100 · ${role}`);
  } catch (err) {
    showToast('ATS check failed: ' + String(err.message || err).slice(0, 80), '#ef4444');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check ATS score';
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
  setLoading('Calling Gemini…');
  setStep(2);
  setProgress(8, 'Scoring master resume…', 'Gemini ATS rubric');

  try {
    lockKeywordsFromJd(jd);
    const missingReport = missingSkillReport(state.keywords, resume);
    state.lastMissingReport = missingReport;
    setProgress(28, `Keywords ready: ${(state.keywords.primary || []).slice(0, 4).join(', ')}…`, 'locked keyword set');
    setStep(3);
    setLoading('Rewriting resume…');
    setProgress(40, 'Gemini is tailoring the resume to this JD…', state.mode === 'aggressive' ? 'Aggressive ATS mode' : 'Integrity mode · 20 rules');

    const tailored = cleanupResume(await callGemini(buildRewritePrompt(jd, resume, state.keywords, missingReport), { maxTokens: 7000 }));
    if (!tailored || tailored.length < 200) throw new Error('Rewrite was empty');
    state.tailoredResume = tailored;
    $('outputArea').textContent = tailored;

    setStep(4);
    setProgress(78, 'Re-scoring tailored resume…', `Target ${SCORE_THRESHOLD}+`);
    setLoading('Scoring tailored resume…');
    let { unified, resume: polished } = await scoreTailoredResume(jd, state.tailoredResume);
    state.tailoredResume = polished;
    $('outputArea').textContent = polished;

    let pass = 0;
    while (unified.atsScore < SCORE_THRESHOLD && pass < MAX_BOOST_PASSES) {
      pass += 1;
      setProgress(80 + pass * 3, `Score ${unified.atsScore}/100 — auto-boost ${pass}/${MAX_BOOST_PASSES} to ${SCORE_THRESHOLD}+…`, state.mode);
      setLoading(`Boost pass ${pass}…`);
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
    renderResults(unified, state.tailoredResume);
    setProgress(100, `Done — ATS ${unified.atsScore}/100`, state.lastModel || unified.source);
    showToast(unified.atsScore >= SCORE_THRESHOLD
      ? `Tailored resume scored ${unified.atsScore}/100`
      : `Score ${unified.atsScore}/100 — use Boost if you want another pass`);
  } catch (err) {
    showToast('Tailor failed: ' + String(err.message || err).slice(0, 90), '#ef4444');
    $('progressSection').classList.add('hidden');
  } finally {
    $('analyzeBtn').disabled = false;
    stopLoading();
  }
}

async function boostScore() {
  if (!state.tailoredResume) { showToast('Tailor a resume first', '#ef4444'); return; }
  const inputs = getInputs();
  if (!inputs) return;
  const btn = $('boostBtn');
  btn.disabled = true;
  btn.textContent = 'Boosting…';
  setProgress(15, 'Boosting remaining ATS gaps…', 'Surgical Gemini edit');
  setLoading('Boost pass…');
  try {
    const boosted = cleanupResume(await callGemini(
      buildBoostPrompt(inputs.jd, state.tailoredResume, { ...state.scorecard, atsScore: state.scorecard?.atsScore }, state.keywords || {}),
      { maxTokens: 7000 }
    ));
    const nextText = boosted && boosted.length > 200 ? boosted : state.tailoredResume;
    setProgress(70, 'Re-scoring boosted resume…', '');
    const scored = await scoreTailoredResume(inputs.jd, nextText);
    state.tailoredResume = scored.resume;
    const unified = scored.unified;
    state.scorecard = unified.scorecard;
    renderResults(unified, scored.resume);
    setProgress(100, `Boost complete — ${unified.atsScore}/100`, '');
    showToast(`Boosted to ${unified.atsScore}/100`);
  } catch (err) {
    showToast('Boost failed: ' + String(err.message || err).slice(0, 80), '#ef4444');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Boost to 100';
    stopLoading();
  }
}

function cleanupResume(text) {
  let t = (text || '').replace(/```(?:text|markdown)?/gi, '').trim();
  t = t.replace(/^here is[^\n]*\n+/i, '');
  return t.trim();
}

function resetAndRun() {
  state.keywords = null;
  state.kwHash = '';
  state.tailoredResume = '';
  state.scorecard = null;
  $('freeAtsPanel').classList.add('hidden');
  $('scoreSection').classList.add('hidden');
  $('resultsSection').classList.add('hidden');
  $('progressSection').classList.add('hidden');
  $('outputArea').textContent = '';
  if ($('resumePaper')) $('resumePaper').innerHTML = '';
  $('analyzeBtn').disabled = false;
  setStep(1);
  showToast('Cleared results — inputs kept');
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
  'CERTIFICATIONS', 'CERTIFICATION', 'PROJECTS', 'KEY PROJECTS',
]);

function isSectionHeader(line) {
  const t = line.trim().toUpperCase();
  if (SECTION_KEYWORDS.has(t)) return true;
  return /^[A-Z][A-Z\s\/&-]{2,44}$/.test(t) && [...SECTION_KEYWORDS].some(k => t.startsWith(k));
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
  const fromKw = [...(state.keywords?.primary || []), ...(state.keywords?.secondary || [])];
  const fromKb = (window.RAGEngine && RAGEngine.SKILL_KB)
    ? RAGEngine.SKILL_KB.flatMap(s => [s.label, ...(s.terms || [])])
    : [];
  return uniqTerms([...fromKw, ...themeTermsFromJd(), ...BOLD_THEME_WORDS, ...fromKb, ...BOLD_TECH_FALLBACK])
    .filter(t => {
      const x = String(t).trim();
      if (x.length < 2) return false;
      if (BOLD_SKIP.has(x.toLowerCase())) return false;
      if (/^(go|r|c|it|ai|ml|bi)$/i.test(x)) return false;
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

function boldResumeKeywords(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let count = 0;
  const max = 22;
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
      html += `<div class="r-headline">${escapeHtml(l)}</div>`;
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
    if (isSectionHeader(l)) {
      currentSection = l.toUpperCase();
      html += `<div class="r-section">${escapeHtml(currentSection)}</div>`;
    } else if (isBulletLine(l)) {
      const body = /EXPERIENCE|PROJECT/.test(currentSection)
        ? boldResumeKeywords(bulletText(l))
        : escapeHtml(bulletText(l));
      html += `<p class="r-bullet">• ${body}</p>`;
    } else if (/SKILL/.test(currentSection) && /^[A-Za-z][A-Za-z0-9 &\/+.#-]{1,50}:\s*\S/.test(l)) {
      const idx = l.indexOf(':');
      html += `<p class="r-skill-line"><span class="r-skill-label">${escapeHtml(l.slice(0, idx))}:</span> ${escapeHtml(l.slice(idx + 1).trim())}</p>`;
    } else if (isRoleLine(l, currentSection)) {
      const { left, dates } = splitRoleAndDates(l);
      if (dates) {
        html += `<table class="r-job" width="100%" cellspacing="0" cellpadding="0"><tr>`
          + `<td class="r-role">${escapeHtml(left)}</td>`
          + `<td class="r-dates">${escapeHtml(dates)}</td>`
          + `</tr></table>`;
      } else {
        html += `<p class="r-role">${escapeHtml(left)}</p>`;
      }
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
  return `
    p { margin: 0; padding: 0; }
    .r-name { font-family: Calibri, Arial, sans-serif; font-size: 16pt; font-weight: bold; text-align: center; color: #000000; margin: 0; padding: 0; line-height: 20pt; mso-line-height-rule: exactly; }
    .r-headline { font-family: Calibri, Arial, sans-serif; font-size: 14pt; font-weight: bold; text-align: center; color: #000000; margin: 0 0 10pt 0; padding: 0; line-height: 18pt; mso-line-height-rule: exactly; }
    .r-contact { font-family: Calibri, Arial, sans-serif; font-size: 10pt; text-align: center; color: #444444; margin: 0 0 2pt 0; line-height: 13pt; mso-line-height-rule: exactly; }
    .r-section { font-family: Calibri, Arial, sans-serif; font-size: 14pt; font-weight: bold; color: #000000; text-transform: uppercase; letter-spacing: 0; border-bottom: 0.75pt solid #000000; margin: 9pt 0 6pt 0; padding: 0 0 1pt 0; line-height: 16pt; mso-line-height-rule: exactly; }
    .r-job { width: 100%; border-collapse: collapse; margin: 6pt 0 2pt 0; border: none; }
    .r-job td { font-family: Calibri, Arial, sans-serif; font-size: 11pt; font-weight: bold; color: #000000; padding: 0; line-height: 14pt; vertical-align: bottom; mso-line-height-rule: exactly; border: none; }
    .r-dates { text-align: right; white-space: nowrap; width: 36%; }
    .r-role { font-family: Calibri, Arial, sans-serif; font-size: 11pt; font-weight: bold; color: #000000; margin: 6pt 0 2pt 0; line-height: 14pt; }
    .r-bullet { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; margin: 0 0 0 18pt; text-indent: -18pt; line-height: 13.3pt; padding: 0; mso-line-height-rule: exactly; }
    .r-body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; margin: 0; padding: 0; line-height: 13.3pt; mso-line-height-rule: exactly; }
    .r-skill-line { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; margin: 0; padding: 0; line-height: 14.2pt; mso-line-height-rule: exactly; }
    .r-skill-label { font-weight: bold; color: #000000; }
    b, strong { font-weight: bold; color: #000000; }
    a { color: #1a56c4; text-decoration: underline; }
  `;
}

function currentResumeText() {
  return (state.tailoredResume || $('outputArea').textContent || '').trim();
}

function showFormattedResume(text) {
  const paper = $('resumePaper');
  if (!paper) return;
  paper.innerHTML = parseResumeToHtml(text || currentResumeText());
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
      margin: 0.25in 0.20in 0.40in 0.16in;
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
    }
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; line-height: 13.3pt; mso-line-height-rule: exactly; }
    ${resumeCss()}
  </style>
</head>
<body>
  <div class="WordSection1">${parseResumeToHtml(content)}</div>
</body>
</html>`;
}

function downloadDocx() {
  const content = currentResumeText();
  if (!content) { showToast('No resume to download', '#ef4444'); return; }
  const filename = (state.filename || 'tailored_resume.doc').replace(/\.docx?$/i, '.doc');
  const blob = new Blob(['\ufeff' + buildWordHtml(content, filename)], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('.doc downloaded in model resume layout');
}

function downloadTxt() {
  const text = currentResumeText();
  if (!text) { showToast('No resume to download', '#ef4444'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = (state.filename || 'tailored_resume.txt').replace(/\.doc$/i, '.txt');
  a.click();
  showToast('.txt downloaded');
}

function copyToClipboard() {
  navigator.clipboard.writeText(currentResumeText()).then(() => showToast('Copied'));
}

function printResume() {
  const content = currentResumeText();
  if (!content) { showToast('No resume to print', '#ef4444'); return; }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title><style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; margin: 0; }
    .page { width: 8.5in; min-height: 11in; margin: 0 auto; box-sizing: border-box; padding: 0.25in 0.20in 0.40in 0.16in; }
    ${resumeCss()}
    @media print {
      html, body { margin: 0; background: #fff; }
      .page { width: auto; min-height: 0; padding: 0; box-shadow: none; }
      @page { size: letter portrait; margin: 0.25in 0.20in 0.40in 0.16in; }
    }
  </style></head><body><div class="page">${parseResumeToHtml(content)}</div>
  <script>window.onload=function(){window.focus();setTimeout(function(){window.print();},250);}<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank');
}

function copyFilename() {
  navigator.clipboard.writeText(state.filename || '').then(() => showToast('Filename copied'));
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
      markGemini(true, data.keyName ? `Gemini · ${data.keyName}` : 'Gemini connected');
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
