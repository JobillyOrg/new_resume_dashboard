/* Jobilly.AI Resume Dashboard */
const APP_VERSION = '20260916g';
const SCORE_THRESHOLD = 90;
const SCORE_TARGET = 95;
const SCORE_MAX = 100;
const MAX_BOOST_PASSES = 6;
const SKILLSET_CACHE = 'ats_skillset_v10_';
const CERT_TERM_RE = /certif(?:y|ied|ication|ications)?|\baws certified\b|\bazure certified\b|\bgoogle cloud certified\b|\bsnowflake certified\b|\bdatabricks certified\b|\bpmp\b|\bcissp\b|\bcspo\b|\bcsm\b|\bcka\b|\bckad\b|\bcomptia\b|\bscrum master\b|\bprofessional cloud architect\b|\bsolutions architect associate\b|\bdata engineer associate\b/i;
const JUNK_SKILL_RE = /\b(retirement|401k|401\(k\)|benefits?|insurance|dental|vision|compensation|how to apply|cover letter|submit your resume|employer-paid|disability insurance|employee assistance)\b/i;
const ELIGIBILITY_SKILL_RE = /\b(h-?1b|h1b|visa sponsorship|work authorization|work authorisation|authorized to work|authorised to work|eligible to work|right to work|without sponsorship|no sponsorship|will not sponsor|unable to sponsor|green card|us citizen|u\.s\. citizen|united states citizen|citizenship required|employment authorization|ead\b|tn visa|i-?140)\b/i;

function isEligibilityTerm(term) {
  const s = String(term || '').trim();
  if (!s) return false;
  if (ELIGIBILITY_SKILL_RE.test(s)) return true;
  if (/^h-?1b$/i.test(s)) return true;
  return false;
}

function dropEligibilityTerms(list) {
  return (list || []).filter(t => t && !isEligibilityTerm(t));
}

const CANDIDATE_STACKS = {
  aws: {
    label: 'AWS',
    terms: /\b(aws|amazon web services|amazon web service|\bs3\b|glue|emr|redshift|lambda|mwaa|athena|kinesis|dynamodb|cloudformation|ecs|eks|iam|step functions|sagemaker)\b/i,
    rivals: ['azure', 'gcp'],
  },
  azure: {
    label: 'Microsoft Azure',
    terms: /\b(azure|adf|azure data factory|data factory v2|synapse|azure synapse|blob storage|azurerm|entra|azure devops|azure databricks|power bi|fabric)\b/i,
    rivals: ['aws', 'gcp'],
  },
  gcp: {
    label: 'Google Cloud',
    terms: /\b(gcp|google cloud|bigquery|dataflow|pub\/sub|pubsub|composer|gcs|cloud run|vertex ai|dataproc|cloud storage)\b/i,
    rivals: ['aws', 'azure'],
  },
};

const UNIVERSAL_SKILL_RE = /\b(python|sql|pyspark|apache spark|spark|scala|java|kafka|dbt|hadoop|hive|terraform|docker|kubernetes|jenkins|git|ci\/cd|etl|elt|machine learning|ml|llm|rag|pandas|numpy)\b/i;

const EXCLUSIVE_GROUPS = [
  {
    label: 'Orchestration',
    families: {
      aws:   /\b(mwaa|managed workflows|step functions)\b/i,
      azure: /\b(azure data factory|adf|data factory v2|azure logic apps)\b/i,
      gcp:   /\b(cloud composer|cloud workflows)\b/i,
      neutral: /\b(airflow|apache airflow|prefect|dagster|luigi)\b/i,
    },
  },
  {
    label: 'Data Warehouse',
    families: {
      aws:   /\b(redshift|amazon redshift|redshift spectrum)\b/i,
      azure: /\b(synapse|azure synapse|synapse analytics|sql data warehouse)\b/i,
      gcp:   /\b(bigquery|big query)\b/i,
      neutral: /\b(snowflake|databricks sql|dbt)\b/i,
    },
  },
  {
    label: 'ETL / Data Processing',
    families: {
      aws:   /\b(glue|aws glue|glue catalog|emr|amazon emr)\b/i,
      azure: /\b(azure data factory|adf|data factory v2|azure databricks|synapse pipelines)\b/i,
      gcp:   /\b(dataflow|dataproc|cloud dataflow|cloud dataproc)\b/i,
      neutral: /\b(spark|pyspark|apache spark|dbt|flink|apache flink)\b/i,
    },
  },
  {
    label: 'Object Storage',
    families: {
      aws:   /\b(s3|amazon s3|s3 bucket)\b/i,
      azure: /\b(blob storage|azure blob|adls|data lake storage|azure storage)\b/i,
      gcp:   /\b(gcs|google cloud storage|cloud storage)\b/i,
      neutral: /\b(delta lake|iceberg|hudi|parquet|avro|orc)\b/i,
    },
  },
  {
    label: 'Streaming',
    families: {
      aws:   /\b(kinesis|amazon kinesis|kinesis firehose|msk)\b/i,
      azure: /\b(event hubs|azure event hubs|azure stream analytics)\b/i,
      gcp:   /\b(pub\/sub|pubsub|cloud pub\/sub)\b/i,
      neutral: /\b(kafka|apache kafka|confluent|flink|spark streaming)\b/i,
    },
  },
  {
    label: 'BI / Visualization',
    families: {
      aws:   /\b(quicksight|amazon quicksight)\b/i,
      azure: /\b(power bi|power ?bi|powerbi)\b/i,
      gcp:   /\b(looker|google data studio|looker studio)\b/i,
      neutral: /\b(tableau|superset|grafana|metabase)\b/i,
    },
  },
  {
    label: 'IaC / DevOps',
    families: {
      aws:   /\b(cloudformation|aws cdk|codepipeline|codebuild|codecommit)\b/i,
      azure: /\b(azure devops|arm templates|azure pipelines|bicep)\b/i,
      gcp:   /\b(cloud build|cloud deploy|deployment manager)\b/i,
      neutral: /\b(terraform|pulumi|ansible|jenkins|github actions|gitlab ci|ci\/cd|docker|kubernetes)\b/i,
    },
  },
  {
    label: 'NoSQL / Document DB',
    families: {
      aws:   /\b(dynamodb|amazon dynamodb|documentdb|amazon documentdb)\b/i,
      azure: /\b(cosmos ?db|azure cosmos)\b/i,
      gcp:   /\b(firestore|cloud firestore|bigtable|cloud bigtable)\b/i,
      neutral: /\b(mongodb|cassandra|redis|neo4j|elasticsearch)\b/i,
    },
  },
  {
    label: 'ML Platform',
    families: {
      aws:   /\b(sagemaker|amazon sagemaker|bedrock)\b/i,
      azure: /\b(azure ml|azure machine learning|cognitive services|azure openai|azure ai)\b/i,
      gcp:   /\b(vertex ai|automl|google ai platform)\b/i,
      neutral: /\b(mlflow|kubeflow|ray|hugging ?face|pytorch|tensorflow|scikit|xgboost)\b/i,
    },
  },
  {
    label: 'Identity / IAM',
    families: {
      aws:   /\b(iam|aws iam|cognito)\b/i,
      azure: /\b(entra|azure ad|active directory|azure rbac)\b/i,
      gcp:   /\b(cloud iam|google iam)\b/i,
      neutral: /\b(okta|auth0|ldap|saml|oauth)\b/i,
    },
  },
];

function exclusiveCloudOfTerm(term) {
  const t = String(term || '').trim();
  if (!t) return null;
  for (const group of EXCLUSIVE_GROUPS) {
    for (const [cloudId, re] of Object.entries(group.families)) {
      if (cloudId === 'neutral') continue;
      if (re.test(t)) return cloudId;
    }
  }
  for (const [id, stack] of Object.entries(CANDIDATE_STACKS)) {
    if (stack.terms.test(t)) return id;
  }
  return null;
}

function cloudsInLine(line) {
  const found = new Set();
  const text = String(line || '');
  for (const group of EXCLUSIVE_GROUPS) {
    for (const [cloudId, re] of Object.entries(group.families)) {
      if (cloudId === 'neutral') continue;
      if (re.test(text)) found.add(cloudId);
    }
  }
  for (const [id, stack] of Object.entries(CANDIDATE_STACKS)) {
    if (stack.terms.test(text)) found.add(id);
  }
  return found;
}

function termConflictsWithLine(term, line, _primaryCloud) {
  const termCloud = exclusiveCloudOfTerm(term);
  if (!termCloud) return false;
  const inLine = cloudsInLine(line);
  if (inLine.size && ![...inLine].every(c => c === termCloud)) return true;
  return false;
}

function cloudIsEvidenced(cloudId, profile) {
  if (!cloudId) return true;
  return Number(profile?.scores?.[cloudId] || 0) > 0;
}

function evidencedCloudList(profile) {
  const scores = profile?.scores || {};
  return Object.entries(scores)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

function scoreCandidateStacks(resumeText) {
  const t = String(resumeText || '');
  const scores = {};
  for (const [id, stack] of Object.entries(CANDIDATE_STACKS)) {
    scores[id] = (t.match(stack.terms) || []).length;
  }
  return scores;
}

function detectCandidateProfile(resumeText) {
  const scores = scoreCandidateStacks(resumeText);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]).filter(([, s]) => s > 0);
  const primaryCloud = ranked[0]?.[0] || null;
  const primaryScore = ranked[0]?.[1] || 0;
  const secondaryCloud = ranked[1]?.[0] || null;
  return {
    scores,
    primaryCloud,
    primaryLabel: primaryCloud ? CANDIDATE_STACKS[primaryCloud].label : '',
    secondaryCloud,
    secondaryLabel: secondaryCloud ? CANDIDATE_STACKS[secondaryCloud].label : '',
    evidencedClouds: ranked.map(([id]) => id),
    rivalClouds: primaryCloud ? (CANDIDATE_STACKS[primaryCloud].rivals || []).filter(id => (scores[id] || 0) === 0) : [],
    hasStrongPrimary: primaryScore >= 2,
  };
}

function skillBelongsToStack(term, stackId) {
  const stack = CANDIDATE_STACKS[stackId];
  if (!stack || !term) return false;
  return stack.terms.test(String(term));
}

function isUniversalSkill(term) {
  return UNIVERSAL_SKILL_RE.test(String(term || ''));
}

function filterTermsForCandidateProfile(terms, resumeText, profile) {
  const prof = profile || detectCandidateProfile(resumeText);
  const aliasMap = state.keywords?.aliasMap || {};
  const text = String(resumeText || '');
  return (terms || []).filter(term => {
    const t = String(term || '').trim();
    if (!t || isEligibilityTerm(t)) return false;
    if (isUniversalSkill(t)) return true;
    const termCloud = exclusiveCloudOfTerm(t);
    if (termCloud && !cloudIsEvidenced(termCloud, prof)) return false;
    if (keywordPresent(t, text, aliasMap)) return true;
    if (!prof.hasStrongPrimary || !prof.primaryCloud) return true;
    for (const [id] of Object.entries(CANDIDATE_STACKS)) {
      if (cloudIsEvidenced(id, prof)) continue;
      if (skillBelongsToStack(t, id)) return false;
    }
    return true;
  });
}

function filterAtsPhrasesForCandidate(phrases, resumeText, profile) {
  const prof = profile || detectCandidateProfile(resumeText);
  return filterTermsForCandidateProfile(phrases, resumeText, prof);
}

function scorePairKey(jd, resume) {
  return `${jdHash(String(jd || '').trim())}::${jdHash(String(resume || '').trim())}`;
}

function hasFreshManualScore(jd, resume) {
  if (!state.manualScoreKey || !state.manualScoreUnified) return false;
  if (!Number.isFinite(Number(state.manualScoreUnified.atsScore))) return false;
  // JD must still match. Resume text may be re-normalized when syncing verified
  // fields before Rewrite — that must not force Score again.
  const jdPart = String(state.manualScoreKey).split('::')[0];
  return jdPart === jdHash(String(jd || '').trim());
}

function clearManualScoreGate() {
  state.manualScoreKey = '';
  state.manualScoreUnified = null;
}

function targetJdTitle(jd, keywords) {
  const jj = (keywords && keywords.jdJson) || state.lastJdJson || {};
  return cleanJobTitle(
    jj.job_information?.title
    || currentHeadline()
    || (keywords?.role && (keywords.role.title || keywords.role.label))
    || (window.RAGEngine && RAGEngine.extractJdTitle(jd || $('jdInput')?.value || ''))
    || 'the exact JD job title'
  );
}

/** Frozen JSON from the original master paste — never the tailored draft. */
function frozenMasterResumeJson(explicit) {
  if (explicit) return explicit;
  if (typeof state !== 'undefined' && state.masterResumeJson) return state.masterResumeJson;
  return null;
}

/** Infer dominant career label from master experience titles (for role-pivot guidance). */
function inferMasterCareerLabel(resumeText, resumeJson) {
  const master = String(
    (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value)
    || resumeText
    || ''
  );
  const recs = typeof extractExperienceRoleRecords === 'function'
    ? extractExperienceRoleRecords(master)
    : [];
  const textRoles = recs.map(r => r.title).filter(Boolean);
  const rj = frozenMasterResumeJson(resumeJson);
  const jsonRoles = (rj?.professional_experience || []).map(j => j.role).filter(Boolean);
  const fallbackRoles = typeof extractRolesFromResume === 'function'
    ? extractRolesFromResume(master)
    : [];
  const roles = textRoles.length ? textRoles : (jsonRoles.length ? jsonRoles : fallbackRoles);
  const blob = roles.join(' ').toLowerCase();
  const checks = [
    [/ai engineer|machine learning|ml engineer|llm|genai|generative ai|deep learning/, 'AI / ML Engineer'],
    [/automation engineer|test automation|\bsdet\b|qa automation|rpa engineer|process automation/, 'Automation Engineer'],
    [/qa engineer|quality assurance|test engineer/, 'QA Engineer'],
    [/data engineer|etl engineer|spark engineer|data platform/, 'Data Engineer'],
    [/data scientist|data science/, 'Data Scientist'],
    [/data analyst|bi analyst|business intelligence/, 'Data Analyst'],
    [/software engineer|full.?stack|backend|frontend/, 'Software Engineer'],
    [/devops|sre|platform engineer|site reliability/, 'DevOps / Platform'],
    [/cloud engineer|solutions architect/, 'Cloud Engineer'],
    [/network engineer|network admin/, 'Network Engineer'],
    [/security engineer|security analyst|soc analyst|cybersecurity/, 'Security'],
    [/help desk|desktop support|it support|service desk|sysadmin|systems administrator/, 'IT Support'],
    [/business analyst|product owner/, 'Business Analyst'],
    [/product manager|program manager|project manager/, 'Product / Program'],
  ];
  for (const [re, label] of checks) {
    if (re.test(blob)) return label;
  }
  if (roles.length) {
    const first = String(roles[0] || '');
    const titleBit = first.split('|').map(s => s.trim()).find(s =>
      /engineer|analyst|scientist|developer|architect|specialist|manager|technician|administrator|consultant/i.test(s)
    );
    if (titleBit) return titleBit.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b.*$/i, '').trim();
  }
  return 'the master career profile';
}

function headerCityNames(master) {
  const loc = typeof extractContactFields === 'function'
    ? String(extractContactFields(master || '').location || '').trim()
    : '';
  const names = [];
  if (loc) {
    names.push(loc);
    const city = loc.split(',')[0].trim();
    if (city && city.toLowerCase() !== loc.toLowerCase()) names.push(city);
  }
  return names.filter(Boolean).sort((a, b) => b.length - a.length);
}

/** Job title only — never a header city, state, or trailing comma. */
function stripPlaceFromJobTitle(title, master) {
  let t = String(title || '').replace(/\s+/g, ' ').trim().replace(/[|,]+$/g, '').trim();
  if (!t) return '';
  const paste = master
    || (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value)
    || '';
  for (const place of headerCityNames(paste)) {
    const esc = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`[\\s,|]+${esc}(?:\\s*,\\s*[A-Z]{2})?\\s*$`, 'i'), '').trim();
    t = t.replace(new RegExp(`^${esc}[\\s,|]+`, 'i'), '').trim();
  }
  if (typeof PLACE_RE !== 'undefined') {
    t = t.replace(new RegExp('[\\s,|]+' + PLACE_RE.source + '\\s*$', 'i'), '').trim();
  }
  t = t.replace(/[,\s|]+$/g, '').trim();
  if (typeof unstickTitleLocation === 'function') {
    const u = unstickTitleLocation(t);
    if (u.location && u.title && (typeof looksLikeJobTitleToken !== 'function' || looksLikeJobTitleToken(u.title))) {
      t = u.title;
    }
  }
  const glued = t.match(/^(.*?\b(?:engineer|analyst|scientist|developer|manager|architect|consultant|specialist|lead|director|associate|intern|administrator|technician))\s+([A-Z][a-zA-Z.'-]+(?:[\s-][A-Z][a-zA-Z.'-]+){0,2}),?$/i);
  if (glued && typeof looksLikeLocationToken === 'function' && looksLikeLocationToken(glued[2])) {
    t = glued[1].trim();
  }
  return t.replace(/[,\s]+$/g, '').trim();
}

function collapseRepeatedOpener(s, role) {
  const esc = String(role || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return String(s || '').trim();
  let out = String(s || '').trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(new RegExp(`^((?:An?|The)\\s+)?${esc}\\s*[,;]?\\s+${esc}\\b`, 'i'), (role || '').trim());
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function peelLocationFromSummaryLead(s, role, master) {
  let out = String(s || '');
  const escRole = String(role || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cities = headerCityNames(master);
  for (const city of cities) {
    const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escRole) {
      out = out.replace(new RegExp(`(${escRole})(?:\\s*,)?\\s+${esc}(?:\\s*,\\s*[A-Z]{2})?\\s*,?`, 'gi'), '$1');
    }
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').trim();
}

/** Most recent EXPERIENCE job title from the master — used for Line 2 and the SUMMARY opener. */
function masterExperienceRoleTitle(resumeText, resumeJson) {
  const master = String(
    (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value)
    || resumeText
    || ''
  );
  const fromLine = (title) => {
    const cleaned = stripPlaceFromJobTitle(cleanJobTitle(String(title || '')
      .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}\b.*$/i, '')
      .replace(/\s*[-–—]\s*(present|current|now).*$/i, '')
      .trim()), master);
    if (!cleaned || cleaned.length < 3 || cleaned.length > 70) return '';
    if (/^(summary|skills|experience|education|projects|professional experience)$/i.test(cleaned)) return '';
    return cleaned;
  };
  const recs = typeof extractExperienceRoleRecords === 'function'
    ? extractExperienceRoleRecords(master)
    : [];
  let fromRec = fromLine(recs[0] && recs[0].title);
  if (!fromRec && recs[0] && !recs[0].title && typeof looksLikeJobTitleToken === 'function' && looksLikeJobTitleToken(recs[0].company)) {
    fromRec = fromLine(recs[0].company);
  }
  if (fromRec) return fromRec;
  const rj = resumeJson || frozenMasterResumeJson();
  const fromJson = fromLine((rj?.professional_experience || [])[0]?.role);
  if (fromJson) return fromJson;
  const roles = typeof extractRolesFromResume === 'function' ? extractRolesFromResume(master) : [];
  if (roles[0] && typeof parseRoleLineParts === 'function') {
    const t = fromLine(parseRoleLineParts(roles[0]).title);
    if (t) return t;
  }
  return '';
}

function familiesAligned(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y) return false;
  if (x === y) return true;
  const pairs = [
    ['data-engineer', 'analyst'],
    ['data-engineer', 'data-scientist'],
    ['automation', 'qa'],
    ['devops', 'cloud'],
    ['swe', 'devops'],
    ['infra', 'network'],
    ['support', 'infra'],
  ];
  return pairs.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
}

/** JD skills already evidenced on the master + prior bullets worth reusing. */
function jdBuildPlanFromMaster(jd, resume, keywords) {
  const jj = (keywords && keywords.jdJson) || state.lastJdJson || {};
  const masterText = (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value) || resume || '';
  const rj = frozenMasterResumeJson();
  const aliasMap = (keywords && keywords.aliasMap) || {};
  const jdSkills = uniqTerms([
    ...(jj.must_have_skills || []),
    ...(keywords?.jdPrimary || keywords?.primary || []),
  ]).slice(0, 16);
  const corpus = rj ? corpusFromResumeJson(rj) : String(masterText);
  const bullets = rj
    ? bulletsFromResumeJson(rj)
    : String(masterText).split('\n').map(l => l.trim()).filter(l => /^[-•*]/.test(l));
  const overlapping = jdSkills.filter(s => keywordPresent(s, corpus, aliasMap));
  const missingOnMaster = jdSkills.filter(s => !keywordPresent(s, corpus, aliasMap));
  const reusable = bullets.filter(b =>
    overlapping.some(s => keywordPresent(s, b, aliasMap))
  ).slice(0, 10);
  return {
    overlapping,
    missingOnMaster,
    reusable,
    duties: listOrEmpty(jj.responsibilities).slice(0, 10),
    jdSkills,
  };
}

function formatJdProfileContract(jd, resume, keywords) {
  const target = targetJdTitle(jd, keywords);
  const master = (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value) || resume;
  const pageTitle = masterExperienceRoleTitle(master) || inferMasterCareerLabel(master);
  const masterLabel = inferMasterCareerLabel(master);
  const matched = familiesAligned(roleFamilyFromTitle(masterLabel), roleFamilyFromTitle(target))
    || roleFamilyFromTitle(masterLabel) === roleFamilyFromTitle(target);
  const plan = jdBuildPlanFromMaster(jd, resume, keywords);
  return `JD ROLE CONTRACT — Line 2 and SUMMARY keep the most recent EXPERIENCE job title. Skills and bullets tailor to the JD.
LINE 2 + SUMMARY TITLE: ${pageTitle}  (most recent experience role — do NOT replace with the JD title)
TAILOR SKILLS / BULLETS TO: ${target}
MASTER READS AS: ${masterLabel}  (${matched ? 'MATCH — reuse previous-role work that already proves this JD' : `DIFFERENT family — still keep ${pageTitle} on Line 2 and SUMMARY; tailor overlapping work to the JD`})

HOW TO BUILD:
1. SKILLS = this JD's must-haves first. Add a master tool only if it supports this JD.
2. EXPERIENCE = rewrite bullets to prove the JD responsibilities below. Keep companies, PAST titles, and dates.
3. PREVIOUS ROLE IF MATCHED: keep and polish master bullets that already show JD skills/duties (listed below).
4. PREVIOUS ROLE IF NOT MATCHED: keep Line 2 + SUMMARY as ${pageTitle}. Reuse only overlapping skills/bullets. Do not rename the person to ${target}.
5. Never invent tools, tests, employers, titles, or metrics.

JD MUST-HAVE SKILLS (lead SKILLS + SUMMARY + experience): ${plan.jdSkills.join(', ') || 'see locked set'}
ALREADY ON MASTER — reuse these (previous-role overlap): ${plan.overlapping.join(', ') || 'none yet — only add if honest'}
NOT ON MASTER — do not invent: ${plan.missingOnMaster.join(', ') || 'none'}
JD RESPONSIBILITIES (each needs an honest experience bullet):
${plan.duties.length ? plan.duties.map(d => `  - ${d}`).join('\n') : '  - (use the posting duties)'}
REUSE THESE MASTER BULLETS (they already overlap this JD — rewrite in ${target} language, keep the facts):
${plan.reusable.length ? plan.reusable.map(b => `  - ${String(b).slice(0, 180)}`).join('\n') : '  - (no strong overlap yet — reframe transferable master work only if true)'}`;
}

function formatRolePivotBlock(jd, resume, keywords) {
  const target = targetJdTitle(jd, keywords);
  const master = (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value) || resume;
  const pageTitle = masterExperienceRoleTitle(master) || inferMasterCareerLabel(master);
  const masterLabel = inferMasterCareerLabel(master);
  const recs = typeof extractExperienceRoleRecords === 'function'
    ? extractExperienceRoleRecords(master)
    : [];
  const textRoles = recs.map(r => r.title).filter(Boolean).slice(0, 4);
  const jsonRoles = (frozenMasterResumeJson()?.professional_experience || []).map(j => j.role).filter(Boolean).slice(0, 4);
  const masterRoles = textRoles.length ? textRoles : (jsonRoles.length ? jsonRoles : extractRolesFromResume(master || '').slice(0, 4));
  const matched = familiesAligned(roleFamilyFromTitle(masterLabel), roleFamilyFromTitle(target))
    || roleFamilyFromTitle(masterLabel) === roleFamilyFromTitle(target);
  return `TARGET ROLE — Line 2 and SUMMARY use the most recent EXPERIENCE title. Skills/bullets still prove this JD.
- PAGE TITLE (Line 2 + SUMMARY opener): ${pageTitle}
- JD BEING TAILORED: ${target}
- MASTER: ${masterLabel} (${matched ? 'matched family — reuse previous-role proof' : 'different family — keep experience title; tailor overlapping work'})
- Keep these past titles exactly: ${masterRoles.join(' · ') || 'see master'}
- Line 2 + SUMMARY opener = ${pageTitle}. Never swap in the JD title "${target}".
- Keep every real company, past job title, and date. Do NOT rename past jobs to "${target}".
${matched
    ? `- Previous role matches this family. Rebuild SKILLS and bullets around THIS posting's must-haves and duties. Keep prior bullets that already prove those duties; drop off-JD side stacks from the top third.`
    : `- Previous role does not match. Keep Line 2 + SUMMARY as ${pageTitle}. Reorder SKILLS and reframe bullets toward ${target} using only overlapping master work. Invent nothing.`}
- Close EVERY score-rule gap below that is stack-aligned and truthful — incomplete gap fill = failed rewrite.`;
}

function formatMandatoryCloseList(unified, mustAdd, atsMustAdd) {
  const sc = (unified && unified.scorecard) || {};
  const missing = dropEligibilityTerms(dropCertTerms(listOrEmpty(sc.keywordsMissing))).slice(0, 12);
  const skillsOnly = dropEligibilityTerms(dropCertTerms(listOrEmpty(sc.jdSkillsOnly))).slice(0, 10);
  const add = dropEligibilityTerms(dropCertTerms(mustAdd || [])).slice(0, 14);
  const phrases = filterExtractedSkills(atsMustAdd || []).slice(0, 8);
  const weak = [];
  const scores = (unified && unified.ruleScores) || sc.ruleScores || {};
  for (const meta of RULE_META) {
    const pts = Number(scores[meta.key] || 0);
    if (pts / Math.max(meta.max, 1) < 0.85) {
      weak.push(`${meta.letter} ${meta.label} (${pts}/${meta.max})`);
    }
  }
  const lines = [
    'MANDATORY CLOSE LIST — every item MUST appear in the rewritten resume. Leaving a JD must-have missing or Skills-only = failed rewrite:',
    `1. Missing JD must-haves — add to SKILLS AND prove in ≥1 EXPERIENCE bullet (exact spelling): ${uniqTerms([...add, ...missing]).join(', ') || 'none — already covered'}`,
    `2. Skills-only today — rewrite so each of these appears in an EXPERIENCE bullet (not Skills dump): ${skillsOnly.join(', ') || 'none'}`,
    `3. Weave these JD ATS phrases naturally: ${phrases.join(' · ') || 'none'}`,
    `4. Raise these weak score-rule categories with the 20 writing rules: ${weak.join('; ') || 'none weak'}`,
    '5. SUMMARY opens with the most recent EXPERIENCE job title (never a number, never the JD title), then years + 8–9 JD must-have tools.',
    '6. SKILLS are built from JD must-haves; keep previous-role tools only when they overlap this JD.',
    '7. EXPERIENCE is built from JD responsibilities. Reuse previous-role bullets that already match; reframe or shrink the rest.',
    '8. FORMAT MUST match the Anirudh template exactly (Name / Title / Contact | sections ALL-CAPS / role lines / "- " bullets) — wrong format = failed rewrite.',
    'If any item above is still missing at the end, ADD it before outputting. Do not leave score-rule gaps or format breaks open.',
  ];
  return lines.join('\n');
}

/** Non-negotiable page layout — same weight as gap-close and role pivot. */
function formatMandatoryTemplateBlock(headline, resumeText) {
  const skillsHeader = /\bTECHNICAL\s+SKILLS\b/i.test(String(resumeText || ''))
    ? 'TECHNICAL SKILLS'
    : (/\bSKILLS\b/i.test(String(resumeText || '')) ? 'SKILLS' : 'TECHNICAL SKILLS');
  const title = masterExperienceRoleTitle(resumeText)
    || (headline ? String(headline).split('|')[0].trim() : 'the most recent EXPERIENCE job title');
  const masterForRoles = ($('resumeInput') && $('resumeInput').value) || resumeText;
  return `FORMAT IS MANDATORY (Anirudh Word template) — non-negotiable; wrong layout = failed rewrite:
Line 1: Full Name in Title Case (never ALL CAPS)
Line 2: Most recent EXPERIENCE job title only — ${title}. Do NOT put the JD title on Line 2.
${formatContactLineInstruction(resumeText)}
Line 4: blank
Then ONLY these ALL-CAPS headers in the model output:
  SUMMARY
  ${skillsHeader}
  PROFESSIONAL EXPERIENCE
Do NOT output EDUCATION, PROJECTS, or CERTIFICATIONS — the app injects those once from verified fields (format only).
SUMMARY = one prose paragraph (no bullets, no metrics).
${skillsHeader} = keep master category labels. Put JD must-have skills first on each line; demote off-role master tools.
PROFESSIONAL EXPERIENCE role lines — exactly one plain-text line per role:
  If that master role HAS a location: Company | Location | <exact master title> Month YYYY – Month YYYY
  If that master role has NO location: Company | <exact master title> Month YYYY – Month YYYY
  Example with location: Netflix | Los Angeles, CA | Machine Learning Engineer June 2024 – Present
  Example without location: Stripe | Software Engineer September 2024 – Present
  Never invent Remote, a city, a state, or company HQ. Never copy the header city onto a role.
  Never put dates on a second line. Never Company | Title | Location | Dates.
  Never write the placeholder words "Job Title" or "Month YYYY" — copy the real title and dates.
${formatExperienceLocationLock(masterForRoles)}
${formatVerifiedOmitBlock(masterForRoles)}
${formatVerifiedStaticLockBlock()}
Bullets: start with hyphen-space "- " only (not • * ·). 6–7 bullets per role. Each ends with a period.
TAILOR ONLY SUMMARY + SKILLS + EXPERIENCE. Education / Projects / Certifications are format-only from verified fields.
No tables/columns/icons/photos/skill bars in the text output. No markdown. No **bold**.
Do not invent section names. Omit any section or field that is empty on the verified form.`;
}

function formatCandidateProfileBlock(profile) {
  if (!profile?.hasStrongPrimary) {
    return `CANDIDATE STACK: read the master resume — only add tools the candidate has actually used. Do not invent a second cloud. If two clouds are already on the master, keep both but NEVER in the same bullet.`;
  }
  const evidenced = evidencedCloudList(profile)
    .map(id => CANDIDATE_STACKS[id]?.label)
    .filter(Boolean);
  const missingClouds = (profile.rivalClouds || [])
    .map(r => CANDIDATE_STACKS[r]?.label)
    .filter(Boolean);
  if (evidenced.length >= 2) {
    return `CANDIDATE CLOUDS ON MASTER: ${evidenced.map(id => CANDIDATE_STACKS[id]?.label).join(' + ')}.
Do NOT force every master cloud into every experience role.
Only weave a cloud tool into a role when:
1) that cloud already appears on that role in the master, OR
2) the employer matches it (Microsoft→Azure, Amazon→AWS, Google→GCP) AND that cloud is on the master, OR
3) the JD needs that tool and it fits the role's existing cloud.
NEVER invent a cloud that is not on the master. NEVER mix two clouds in one company/bullet.
Keep other evidenced clouds in SKILLS if needed — not dumped across all roles.
dbt, Spark, Kafka, Airflow, Python, SQL, Terraform, Docker are cloud-neutral.
Write like a human: prose summary, real bullets — never comma-dump tools.`;
  }
  const rivals = missingClouds.join(' and ');
  return `CANDIDATE PRIMARY STACK: ${profile.primaryLabel} (from master resume evidence).
Stay on this stack. Do NOT add ${rivals || 'rival cloud'}-specific services unless they already appear on the master resume.
NEVER put two clouds in the same bullet.
Write like a human: prose summary, real bullets — never comma-dump tools or tack skills onto sentence ends.`;
}

function formatTwentyRulesRewriteBlock() {
  return `20 US FULL-TIME RESUME RULES (use these to WRITE the resume):
1. 1-2 pages. 2. Tailor to the JD — every JD must-have tool must appear in EXPERIENCE, not only Skills. 3. Skills-only is a fail for that tool: weave it into a real work bullet. Naming a JD service on work you already did (S3 on AWS pipelines, SQL in warehouse/Spark bullets) is required tailoring, not a fake job. Do not invent employers, degrees, or metrics. 4. Every bullet answers "so what?" (action → technology → problem → result). 5. Quantify when numbers exist; do not invent. 6. Achievements over responsibilities. 7. Strongest info in the top third. 8. No generic objective. 9-10. Use JD terminology when accurate. 11. No graphics/icons/tables/columns. 12. No sensitive personal data. 13. Concise education. 14. Only relevant projects. 15. Experience is the main section. 16. Short bullets, not paragraphs. 17. Technologies must be interview-defensible. 18. Do not exaggerate ownership if the master said "contributed". 19. Show career progression. 20. Tailor skills and bullets to the JD. Line 2 and SUMMARY keep the most recent EXPERIENCE job title — do not rename the person to the JD title.`;
}

function formatAiRubricRewriteTargets() {
  return `SCORING TARGET — this rewrite will be scored ONLY with the ${SCORE_RULE_NAME} (sum 100). This is JD alignment, not a predicted ATS/Workday %. Write so each category clears:
A. Required qualifications / hard gates (20) — years vs JD, education, work auth if stated. If the JD explicitly requires industry experience (healthcare, mortgage, retail, financial-services, etc.), evidence it. Do not force industry wording when the JD does not require it.
B. Skills and keywords (20) — every JD must-have appears in EXPERIENCE, not Skills only. Skills-section mentions help but do not replace a work bullet. Do not stuff the same keyword repeatedly.
C. Experience and responsibility match (20) — bullets show the type of work THIS JD is hiring for. Build experience from JD duties. Reuse previous-role bullets when they already match those duties; if the master was a different career, reframe only overlapping work — do not leave the old career’s leftover bullets dominating.
D. Skill evidence and context (10) — prove important tools with action + context. Listing "Spark" is weak; "Developed Spark pipelines using Scala" is better; scale/result is strongest. Never invent numbers.
E. Experience level and seniority (10) — show ownership, production systems, technical decisions, troubleshooting/optimization, and collaboration appropriate to the JD level. Do not rename past job titles.
F. Achievements and business impact (8) — bullets should show results (automated, reduced time, reliability, users supported) when true. Never manufacture metrics.
G. ATS parseability and formatting (5) — simple single-column layout, ALL-CAPS headers, company/title/dates easy to parse, hyphen bullets, selectable text.
H. Job title / role alignment (2) — Line 2 and SUMMARY open with the most recent EXPERIENCE job title, not the JD title. Keep legitimate past titles. Do not copy the JD title onto Line 2, SUMMARY, or old jobs.
I. Recruiter readability (5) — in ~10 seconds a recruiter should see your role, years, strongest tech, where you worked, and that recent work matches this opening.
SUCCESS: ${SCORE_RULE_NAME} alignment ${SCORE_THRESHOLD}+ (Push aims for ${SCORE_TARGET}+). Skills-only dumps cannot clear ${SCORE_THRESHOLD}.`;
}

/** Build a plain-text gap report from the last score-rule result (failures + weak categories + glance fails). */
function formatScoreRuleGapReport(unified) {
  if (!unified) return 'No prior score-rule report yet.';
  const sc = unified.scorecard || {};
  const scores = unified.ruleScores || sc.ruleScores || {};
  const cov = sc.coverage || {};
  const lines = [];
  lines.push(`CURRENT ${SCORE_RULE_NAME.toUpperCase()} SCORE: ${Number(unified.atsScore || sc.atsScore || 0)}/${SCORE_MAX} (need ${SCORE_THRESHOLD}+)`);
  lines.push(SCORE_INTERPRETATION);
  const failedKnockouts = (sc.hardKnockouts || []).filter(k => k && typeof k === 'object' && k.ok === false);
  if (failedKnockouts.length || sc.screenOutRisk) {
    lines.push('HARD-GATE SCREEN-OUT RISK (can eliminate you even if the overall score is high):');
    failedKnockouts.forEach(k => {
      lines.push(`    · ${k.label}${k.detail ? ` — ${k.detail}` : ''}`);
    });
  }
  lines.push('WEAK / FAILED CATEGORIES (fix these with the 20 writing rules):');
  for (const meta of RULE_META) {
    const pts = Number(scores[meta.key] || 0);
    const max = meta.max;
    const ratio = pts / Math.max(max, 1);
    if (ratio >= 0.85) continue;
    const failed = listOrEmpty(cov[meta.key]?.failed);
    const status = ratio >= 0.55 ? 'partial' : 'needs work';
    lines.push(`- ${meta.letter}. ${meta.label}: ${pts}/${max} (${status})`);
    failed.slice(0, 8).forEach(f => lines.push(`    · ${f}`));
    if (!failed.length && ratio < 0.85) {
      const miss = listOrEmpty(sc.keywordsMissing).slice(0, 6);
      const skillsOnly = listOrEmpty(sc.jdSkillsOnly).slice(0, 6);
      if (meta.key === 'skillsKeywords' && miss.length) {
        miss.forEach(m => lines.push(`    · Failed: must-have missing — ${m}`));
      } else if (meta.key === 'skillsEvidenceContext' && (miss.length || skillsOnly.length)) {
        miss.forEach(m => lines.push(`    · Failed: not on resume — ${m}`));
        skillsOnly.forEach(m => lines.push(`    · Failed: Skills only — ${m}`));
      } else if (meta.key === 'semanticResponsibilityMatch') {
        lines.push('    · Build experience from JD duties. Reuse previous-role bullets that already match; reframe only overlapping work if the master career differs.');
      } else if (meta.key === 'jobTitleAlignment') {
        lines.push('    · Keep Line 2 and SUMMARY as the most recent EXPERIENCE job title; do not swap in the JD title');
      } else {
        lines.push(`    · Raise ${meta.letter} by matching more of this category’s checks`);
      }
    }
  }
  const glanceFails = TEN_QUESTIONS.filter(q => !(sc.tenSecondTest || {})[q.key]).map(q => q.label);
  if (glanceFails.length) {
    lines.push('RECRUITER GLANCE STILL FAILING:');
    glanceFails.forEach(g => lines.push(`    · ${g}`));
  }
  const gaps = stripCertGaps(listOrEmpty(sc.gaps)).slice(0, 8);
  if (gaps.length) {
    lines.push('OTHER GAPS:');
    gaps.forEach(g => lines.push(`    · ${g}`));
  }
  return lines.join('\n');
}

function formatExternalAtsBlock(jd, keywords) {
  const role = targetJdTitle(jd, keywords);
  const pageTitle = masterExperienceRoleTitle(($('resumeInput') && $('resumeInput').value) || '')
    || 'the most recent EXPERIENCE job title';
  const primary = dropCertTerms(keywords?.primary || keywords?.jdPrimary || []);
  const atsPhrases = filterExtractedSkills(keywords?.atsKeywords || []);
  return `LAYOUT + KEYWORD ALIGNMENT (supports A–I JD-alignment scoring):
- Line 2 is the most recent EXPERIENCE job title: ${pageTitle}. Do NOT put the JD title "${role}" on Line 2. Do NOT rename past job titles to copy the JD.
- SUMMARY is a ${pageTitle} profile: open with that experience title (never a number, never the JD title), then years + 8-9 JD must-have tools in natural prose. No %/$ metrics in SUMMARY.
- JD must-have skills lead SKILLS; prove them in EXPERIENCE bullets connected to real work (JD duties first)
- Use the JD's exact spelling when it is true: ${primary.slice(0, 14).join(', ') || 'see locked set'}
- Weave ATS phrases naturally (never comma dumps or repeating one keyword ten times): ${atsPhrases.slice(0, 10).join(' · ') || 'n/a'}
- Add metrics only when they are real on the master — never invent records, %, or dollars
- Prefer achievement-shaped bullets (Built/Designed/Reduced/Improved/Automated…) over "Responsible for…"
- Top third proves fit in ~10 seconds: ${pageTitle}, years, strongest JD tech, where you worked
- ALL-CAPS headers: SUMMARY, SKILLS (or TECHNICAL SKILLS), PROFESSIONAL EXPERIENCE, EDUCATION
- Avoid: keyword stuffing, tools with no work evidence, leftover bullets from a different career family, rival-cloud mixes in one bullet`;
}

function buildExternalAtsPassPrompt(jd, resume, keywords, missingReport) {
  const master = ($('resumeInput') && $('resumeInput').value) || resume;
  const profile = detectCandidateProfile(master);
  const report = missingReport || missingSkillReport(keywords, master);
  const mustAdd = skillsToInject(report, master);
  const atsMissing = filterAtsPhrasesForCandidate(report.atsMissing || [], master, profile);
  const summaryKw = summaryKeywordList(keywords, master);
  const gaps = stripCertGaps((state.scorecard && state.scorecard.gaps) || []);
  const suggestions = stripCertGaps((state.scorecard && state.scorecard.improvementSuggestions) || []);
  return `You are a precision resume editor. Raise this draft so it scores ${SCORE_TARGET}+ on ${SCORE_RULE_NAME}. Apply the 20 US resume writing rules while closing score-rule gaps completely. Format is mandatory.

${formatMandatoryTemplateBlock(currentHeadline(), resume)}

${formatJdProfileContract(jd, resume, keywords)}

${formatRolePivotBlock(jd, resume, keywords)}

${formatMandatoryCloseList(state.lastAtsUnified || { scorecard: state.scorecard, ruleScores: state.scorecard?.ruleScores, atsScore: state.scorecard?.atsScore }, mustAdd, atsMissing)}

${formatTwentyRulesRewriteBlock()}

${formatAiRubricRewriteTargets()}

SCORE-RULE REPORT (what failed / what we got):
${formatScoreRuleGapReport(state.lastAtsUnified || { scorecard: state.scorecard, ruleScores: state.scorecard?.ruleScores, atsScore: state.scorecard?.atsScore })}

${formatExternalAtsBlock(jd, keywords)}
${formatCandidateProfileBlock(profile)}

CLOSE THESE GAPS (stack-aligned only — leave none open):
- Missing skills → SKILLS + experience bullets with real context: ${mustAdd.join(', ') || 'none'}
- Missing ATS phrases → summary or bullets: ${atsMissing.join(' · ') || 'none'}
- Summary should weave 8-9 of: ${summaryKw.join(', ') || 'current stack'}
- Score-rule gaps: ${gaps.slice(0, 8).map(g => String(g)).join(' | ') || 'none listed'}
- Fixes to apply: ${suggestions.slice(0, 6).map(s => String(s)).join(' | ') || 'prove every JD tool in experience; raise metric density; mirror JD responsibilities'}

RULES:
- Do not change name, contact, companies, PAST job titles, dates, or education (Line 2 = most recent EXPERIENCE job title, not the JD title)
- Keep the master's skill category layout; add tools into existing lines
- Weave each missing skill inside a bullet sentence — never tack ", Skill." at the end
- Add realistic metrics to bullets that lack numbers (reuse the resume's scale)
- Each role: 6-7 bullets. Keep extra sections already on the resume. If PROJECTS exists, keep those same projects once as a name plus hyphen bullets — no dates. Do not invent a second Projects section.
- No H1B, visa, or work authorization language in SUMMARY
- Prefer evidence and clarity over stuffing
- Keep Line 2 and SUMMARY as the most recent experience role. Tailor skills order and bullets to the JD. Do not rename the person to the JD title.
- Keep Anirudh format exactly (ALL-CAPS headers, role lines, "- " bullets)
- Do not add a city/Remote/HQ to a role that had no location on the master
- SUMMARY years must be the calculated EXPERIENCE tenure, never a JD range like "2-5 years" or "3-4 years"

${formatLockedTenureBlock(($('resumeInput') && $('resumeInput').value) || resume)}

JOB DESCRIPTION:
${jd.slice(0, 6500)}

RESUME:
${resume}

OUTPUT: complete resume only, starting with the candidate name.`;
}

function buildProofreadPrompt(jd, master, draft) {
  const title = masterExperienceRoleTitle(master) || 'the most recent EXPERIENCE job title';
  const city = verifiedContactFields(master).location || '';
  const skillsHeader = /\bTECHNICAL\s+SKILLS\b/i.test(String(master || ''))
    ? 'TECHNICAL SKILLS'
    : (/\bSKILLS\b/i.test(String(master || '')) ? 'SKILLS' : 'TECHNICAL SKILLS');
  return `You are the FINAL READER of this tailored resume. Read the page from top to bottom like a recruiter. You do NOT score it. Scoring is a separate 9-point rubric in the browser.

Your only job: fix formatting, duplication, broken copy, and anything that does not read as a clean US resume. Do not retailor for the job. Do not add skills, companies, jobs, degrees, metrics, or contact that is not on the master.

MASTER (source of truth for contact, companies, dates, role locations, extra sections, what exists):
${String(master || '').slice(0, 9000)}

TAILORED DRAFT (read every line; output the corrected full resume):
${String(draft || '').slice(0, 12000)}

${formatMandatoryTemplateBlock(title, master)}

${formatLockedContactBlock(master)}

${formatVerifiedOmitBlock(master)}

${formatLockedTenureBlock(master)}

${formatExperienceLocationLock(master)}

${formatVerifiedStaticLockBlock()}

${extraSectionsPromptBlock(master)}

LINE 2 MUST BE EXACTLY: ${title}
${city ? `Line 3 personal city: ${city} — only on the contact line, never on Line 2 or the SUMMARY opener.` : 'No personal city — do not invent one.'}

SCAN TOP TO BOTTOM. Fix every hit. Then re-read once to confirm the page makes sense.

1. HEADER
- Line 1: name in Title Case, not ALL CAPS, not doubled
- Line 2: job title only. Bad: "${title} St. Louis," or "${title}, ${city || 'City'}". Good: "${title}"
- Line 3: copy EVERY contact field that is on the master (phone, email, linkedin.com/in/… if present, github.com/username if present, city). If the master has a LinkedIn URL, keep that URL. If it only says LinkedIn with no hyperlink, omit it. If the master has a github.com profile, keep that URL. If it only says GitHub with no handle, omit it. If the master has a phone and email they MUST appear — do not drop them
- One blank line, then SUMMARY. No extra blank lines, no markdown, no **bold**

2. SUMMARY
- One prose paragraph. No bullets, no %, no $, no tables
- Opens with "${title}" ONCE, then tenure, then the rest. Bad: "${title} St. Louis, ${title} St. Louis, with 3+ years…"
- No city on the opener. No duplicate tenure. No leading number. No JD years range (2-5 years)
- Reads as English: no doubled words, no "including including", no trailing "using Skill, Skill"

3. ${skillsHeader}
- Keep the master's category labels and order
- No duplicated heading. No skill listed twice on the same line. No comma-dump at the end of a line
- Do not invent a new Technical Skills line if the master did not have one

4. PROFESSIONAL EXPERIENCE
- Heading once, ALL-CAPS
- Each role is ONE line: Company | Location | Real Job Title Month YYYY – Month YYYY when that master role has a location. Never write the words "Job Title"
- Display intent: company and real title on the left; location (if on master) and dates on the right. Fix glued names (NetflixLos Angeles → Netflix | Los Angeles, CA; AccentureIndia → Accenture | India)
- Keep company names, past titles, and dates as on the master
- 6–7 bullets per role, each "- " (hyphen space), each a complete sentence ending with a period
- Every bullet must read: action → work → result. Fix fragments, doubled phrases, "and Tableau" dumps, missing verbs, glued words
- No duplicate bullets. No empty bullets. No two clouds in one bullet

5. EDUCATION / PROJECTS / CERTIFICATIONS
- Do not rewrite these. If present in the draft, leave headings once; the app replaces them from verified fields
- Never invent a school, degree, date, project, or certificate
- Never duplicate EDUCATION or PROJECTS

6. OTHER EXTRA SECTIONS (Awards, Volunteer, Languages, …)
- Keep only if on the master, same heading, once
- Do not invent extra sections

7. PAGE-WIDE COPY
- Repeated words, doubled phrases, duplicate section headings
- Broken punctuation (, ,  ..  "and .")
- Markdown, tables, icons, columns, ALL-CAPS body text
- H1B / visa / citizenship / sponsorship language in SUMMARY or SKILLS
- Sentences that do not make sense — rewrite the sentence so it is grammatical, keeping the same facts

DO NOT:
- Add skills, companies, jobs, degrees, or metrics
- Change past job titles, dates, or company names
- Rewrite bullets for keywords unless the sentence is broken
- Invent contact details
- Delete JD must-have tools already in SKILLS or EXPERIENCE
- Assign or mention a numeric score

JOB DESCRIPTION (context only — do not stuff new JD text):
${String(jd || '').slice(0, 2000)}

OUTPUT the complete corrected resume only, starting with the candidate name.`;
}

async function proofreadTailoredResume(jd, draft) {
  const master = ($('resumeInput') && $('resumeInput').value) || '';
  const raw = await callGemini(buildProofreadPrompt(jd, master, draft), { maxTokens: 8000 });
  const cleaned = cleanupResume(raw, { master, keywords: state.keywords });
  if (!cleaned || cleaned.length < 200) return draft;
  return cleaned;
}

function formatCandidateStackLine(profile) {
  if (!profile) {
    return {
      label: '—',
      detail: 'Paste your master resume to detect AWS, Azure, or GCP stack.',
      className: 'neutral',
    };
  }
  if (!profile.hasStrongPrimary) {
    const any = Object.values(profile.scores || {}).some(s => s > 0);
    if (!any) {
      return {
        label: 'Not detected',
        detail: 'No strong cloud stack signal. Rewrites only add tools already on your master resume.',
        className: 'neutral',
      };
    }
    return {
      label: 'Unclear',
      detail: 'Weak cloud signal — skills stay limited to what your master resume already shows.',
      className: 'neutral',
    };
  }
  let detail = `Tailoring stays on ${profile.primaryLabel}.`;
  if ((profile.evidencedClouds || []).length >= 2) {
    detail = `Master shows ${(profile.evidencedClouds || []).map(id => CANDIDATE_STACKS[id]?.label).filter(Boolean).join(' + ')}. Weave a cloud into a role only if it already fits that role/employer — do not force every cloud into experience.`;
  } else {
    detail += ` Rival cloud tools from the JD are skipped unless already on your resume.`;
  }
  return {
    label: profile.primaryLabel,
    detail,
    className: profile.primaryCloud || 'neutral',
  };
}

function stackDetectHtml(profile) {
  const info = formatCandidateStackLine(profile);
  return `<div class="stack-detect ${info.className}" role="status">
    <span class="stack-detect-label">Detected stack</span>
    <span class="stack-detect-chip">${escapeHtml(info.label)}</span>
    <span class="stack-detect-detail">${escapeHtml(info.detail)}</span>
  </div>`;
}

function roleCompareForScore(unified, resumeText) {
  const jj = unified?.jdJson || state.lastJdJson || state.keywords?.jdJson || {};
  const rj = unified?.resumeJson || state.lastResumeJson || {};
  const jd = cleanJobTitle(
    jj.job_information?.title
    || unified?.title
    || (state.keywords?.role && (state.keywords.role.title || state.keywords.role.label))
    || (window.RAGEngine && RAGEngine.extractJdTitle(
      unified?.jdUsed || ($('jdInput') && $('jdInput').value) || '',
    ))
    || 'This job',
  );
  const masterRaw = inferMasterCareerLabel(resumeText, rj);
  const master = (!masterRaw || masterRaw === 'the master career profile')
    ? ((rj.professional_experience || []).map(j => j.role).filter(Boolean)[0] || 'Not clear yet')
    : masterRaw;
  const matched = familiesAligned(roleFamilyFromTitle(master), roleFamilyFromTitle(jd));
  const recent = (rj.professional_experience || [])
    .map(j => j.role)
    .filter(Boolean)
    .slice(0, 2);
  return { master, jd, matched, recent };
}

function renderRoleCompareHtml(cmp) {
  if (!cmp) return '';
  const tone = cmp.matched ? 'ok' : 'diff';
  const note = cmp.matched
    ? 'Same type of role. If the score is still low, the gap is skills, duties, or proof — not the title.'
    : 'Different roles. A lower score is expected. Rewrite will write the page for this job using overlapping work from your resume.';
  const recent = (cmp.recent || []).length
    ? `<span class="role-compare-recent">Recent titles: ${escapeHtml(cmp.recent.join(' · '))}</span>`
    : '';
  return `<div class="role-compare ${tone}" role="status">
    <div class="role-compare-col">
      <small>Your resume</small>
      <strong>${escapeHtml(cmp.master)}</strong>
      ${recent}
    </div>
    <div class="role-compare-arrow" aria-hidden="true">→</div>
    <div class="role-compare-col">
      <small>This job</small>
      <strong>${escapeHtml(cmp.jd)}</strong>
    </div>
    <p class="role-compare-note">${note}</p>
  </div>`;
}

function paintRoleCompare(unified, resumeText) {
  const el = $('roleCompare');
  if (!el) return;
  const packed = {
    ...(unified || {}),
    resumeJson: unified?.resumeJson || state.lastResumeJson,
    jdJson: unified?.jdJson || state.lastJdJson,
    title: unified?.title || state.lastJdJson?.job_information?.title,
  };
  el.innerHTML = renderRoleCompareHtml(roleCompareForScore(packed, resumeText));
}
function renderStackDetectLine(profile) {
  const el = $('stackDetectLine');
  if (!el) return;
  const resumeText = ($('resumeInput') && $('resumeInput').value.trim()) || '';
  if (!resumeText) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const prof = profile || detectCandidateProfile(resumeText);
  const info = formatCandidateStackLine(prof);
  el.className = `stack-detect ${info.className}`;
  el.innerHTML = `
    <span class="stack-detect-label">Detected stack</span>
    <span class="stack-detect-chip">${escapeHtml(info.label)}</span>
    <span class="stack-detect-detail">${escapeHtml(info.detail)}</span>`;
  el.classList.remove('hidden');
}

function isCertTerm(term) {
  return CERT_TERM_RE.test(String(term || ''));
}

function dropCertTerms(list) {
  return (list || []).filter(t => t && !isCertTerm(t));
}

function filterExtractedSkills(list) {
  return dropEligibilityTerms(dropCertTerms(list)).filter(t => {
    const s = String(t || '').trim();
    if (s.length < 2 || s.length > 72) return false;
    if (JUNK_SKILL_RE.test(s)) return false;
    if (isEligibilityTerm(s)) return false;
    if (/^(the|what|how|we|you|our|this|that)\b/i.test(s)) return false;
    return true;
  });
}

/** Duty lines and job titles are not B-score skills (Python/PyTorch are; "production-grade ML systems deployment" is not). */
function isDutyPhraseNotSkill(term) {
  const s = String(term || '').replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (/^(feature engineering|model monitoring|model serving|prompt engineering|machine learning|deep learning|real-?time inference|mlops|ml ops)$/i.test(s)) {
    return false;
  }
  const words = s.split(' ').filter(Boolean);
  if (words.length >= 5) return true;
  if (words.length >= 4 && /\b(deployment|management|environments|infrastructure|systems|lifecycle|design)\b/i.test(s)) return true;
  if (words.length >= 3 && /\b(lifecycle management|systems deployment|pipeline design)\b/i.test(s)) return true;
  if (/^(machine learning|ml|data|software|backend|frontend|platform|cloud|devops|sre)\s+engineer(ing)?$/i.test(s)) return true;
  if (/\b(production-grade|end-to-end|environments and)\b/i.test(s)) return true;
  return false;
}

function scoredSkillTerms(list) {
  return filterExtractedSkills(list).filter(t => !isDutyPhraseNotSkill(t));
}

function atsPhrasesFromJdJson(j) {
  const jd = j || {};
  const tools = new Set(scoredSkillTerms([
    ...(jd.must_have_skills || []),
    ...(jd.nice_to_have_skills || []),
  ]).map(s => String(s).toLowerCase()));
  const explicit = filterExtractedSkills(jd.ats_phrases || jd.atsPhrases || []);
  const fromSkillDump = uniqTerms([
    ...(jd.must_have_skills || []),
    ...(jd.nice_to_have_skills || []),
  ]).filter(isDutyPhraseNotSkill);
  return uniqTerms([...explicit, ...fromSkillDump])
    .filter(p => !tools.has(String(p).toLowerCase()))
    .slice(0, 16);
}

function skillStatusOnResume(term, sc) {
  const lc = String(term || '').toLowerCase();
  if (!lc) return 'missing';
  if (listOrEmpty(sc?.jdSkillsOnly).some(s => String(s).toLowerCase() === lc)) return 'skills-only';
  if (listOrEmpty(sc?.keywordsFound).some(s => String(s).toLowerCase() === lc)) return 'work';
  return 'missing';
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
  { key: 'hardQualifications', label: 'A. Required qualifications / hard gates', max: 20, letter: 'A' },
  { key: 'skillsKeywords', label: 'B. Skills and keywords', max: 20, letter: 'B' },
  { key: 'semanticResponsibilityMatch', label: 'C. Experience and responsibility match', max: 20, letter: 'C' },
  { key: 'skillsEvidenceContext', label: 'D. Skill evidence and context', max: 10, letter: 'D' },
  { key: 'experienceSeniorityMatch', label: 'E. Experience level and seniority', max: 10, letter: 'E' },
  { key: 'achievementsImpact', label: 'F. Achievements and business impact', max: 8, letter: 'F' },
  { key: 'resumeParsingStructure', label: 'G. ATS parseability and formatting', max: 5, letter: 'G' },
  { key: 'jobTitleAlignment', label: 'H. Job title / role alignment', max: 2, letter: 'H' },
  { key: 'recruiterReadability', label: 'I. Recruiter readability', max: 5, letter: 'I' },
];

/** Display name for the A–I weighted JD-alignment rubric (not an ATS vendor prediction). */
const SCORE_RULE_NAME = 'score rule';
const SCORE_INTERPRETATION = 'This number is JD alignment (skills, qualifications, experience, evidence, seniority, impact, and readability). It is not a predicted Workday/Greenhouse/ATS percentage.';
const SCORE_UI_BLURB = 'How well this resume matches the job — not a guess of ATS software.';

function clipWords(text, max = 72) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 36 ? cut.slice(0, sp) : cut).trim()}…`;
}

function formatYearsNeed(min, max) {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isFinite(lo) && lo > 0 && Number.isFinite(hi) && hi > 0) return `${lo}–${hi} years`;
  if (Number.isFinite(lo) && lo > 0) return `${lo}+ years`;
  if (Number.isFinite(hi) && hi > 0) return `up to ${hi} years`;
  return '';
}

function shortYearsNeed(note, min, max) {
  const parsed = parseYearsRequirement(note);
  const lo = parsed?.min ?? min;
  const hi = parsed?.max ?? max;
  const labeled = formatYearsNeed(lo, hi);
  if (labeled) return labeled;
  const n = String(note || '');
  const m = n.match(/(\d+(?:\.\d+)?)\s*\+?\s*years?/i);
  if (m) return `${m[1]}+ years`;
  return '';
}

function shortDegreeNeed(edu) {
  const t = String(edu || '');
  if (!t) return '';
  if (/phd|doctorate/i.test(t)) return 'PhD';
  if (/master|m\.?s\.?|mba/i.test(t) && /bachelor/i.test(t)) return "Bachelor's or Master's";
  if (/master|m\.?s\.?|mba/i.test(t)) return "Master's degree";
  if (/bachelor|b\.?s\.?|b\.?tech/i.test(t)) return "Bachelor's degree";
  return clipWords(t, 48);
}

function shortPlace(loc) {
  const t = String(loc || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/([A-Za-z][A-Za-z .]+),\s*([A-Z]{2})(?:\s+\d{5})?/);
  if (m) return `${m[1].trim()}, ${m[2]}`;
  return clipWords(t.replace(/United States( of America)?/gi, '').replace(/,\s*,/g, ',').trim(), 40);
}

function humanizeScoreLine(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/^Coverage:/i.test(s)) return '';
  if (/Industry is scored here/i.test(s)) return '';
  if (/matched\s*÷|ATS\/Workday|JSON:/i.test(s)) return '';
  s = s.replace(/^(Failed:|Pass:|Partial:|Weak:|Knockout:|Review:)\s*/i, '');
  s = s.replace(/^duty not mirrored\s*[—\-]\s*/i, '');
  s = s.replace(/^Duty mirrored:\s*/i, '');
  s = s.replace(/^must-have missing\s*[—\-]\s*/i, 'Missing: ');
  s = s.replace(/^(Partial:\s*)?Skills only[^.]*[—\-]\s*/i, 'In Skills only: ');
  s = s.replace(/^not on resume\s*[—\-]\s*/i, 'Missing: ');
  s = s.replace(/^listed only\s*[—\-]\s*/i, 'Listed only: ');
  s = s.replace(/^mentioned without action\/scale\s*[—\-]\s*/i, 'Needs a real work example: ');
  s = s.replace(/^used in work but thin context\s*[—\-]\s*/i, 'Needs a stronger example: ');
  s = s.replace(/^in experience\s*[—\-]\s*/i, '');
  s = s.replace(/^strong evidence\s*[—\-]\s*/i, '');
  s = s.replace(/^JD requires\s+/i, 'Needs ');
  s = s.replace(/\s*\(Option \d+:[^)]*\)/gi, '');
  s = s.replace(/United States of America/gi, 'US');
  return clipWords(s, 88);
}

function humanLines(arr) {
  return uniqTerms((arr || []).map(humanizeScoreLine).filter(Boolean));
}

const INDUSTRY_GATE_RE = /\b(healthcare|health[- ]care|hipaa|mortgage|retail|financial[- ]services|fintech|banking|insurance|pharma(?:ceutical)?|biotech|life sciences?|telecom(?:munications)?|manufacturing|e-?commerce|federal|government|defense)\b/i;
const IMPACT_VERB_RE = /\b(reduc(?:ed|ing|tion)?|improv(?:ed|ing|ement)?|increas(?:ed|ing|e)?|decreas(?:ed|ing)|automat(?:ed|ing|ion)|eliminat(?:ed|ing|ion)|sav(?:ed|ing)|cut\b|accelerat(?:ed|ing)|enabled|streamlin(?:ed|ing)|boost(?:ed|ing)?|lowered|raised|cut cost|more reliable|reliability)\b/i;
const OWNERSHIP_RE = /\b(own(?:ed|ing|ership)|led\b|lead(?:ing)?|architect(?:ed|ing|ure)|design(?:ed|ing)|drove|accountable|decision|trade-?offs?|mentor(?:ed|ing)?|stakeholder|production|on-call|incident|troubleshoot(?:ing)?|optimiz(?:ed|ing|ation)|roadmap|end-to-end)\b/i;
const SCALE_EVIDENCE_RE = /\b(\d[\d,.]*\s*%|\d[\d,]*\+?|\d+\s*(?:hours?|minutes|days|weeks|tb|gb|pb|records?|tables?|pipelines?|users?|clusters?)|millions?|billions?|hundreds of millions|petabytes?|terabytes?|latency|throughput|sla)\b/i;
const LICENSE_GATE_RE = /\b(license|licensure|\bcpa\b|series 7|series 63|\bcdl\b|professional engineer|\bpe license|bar admission|registered nurse|\brn\b)\b/i;

let state = {
  mode: 'integrity',
  track: 'auto',
  keywords: null,
  kwHash: '',
  tailoredResume: '',
  editingResume: false,
  paperEdited: false,
  scorecard: null,
  filename: '',
  geminiOk: false,
  lastModel: '',
  docFit: { bodyPt: 12, lh: 1, pages: 1 },
  boldTerms: [],
  boldFinalized: false,
  preTailor: null,
  selectedRewriteCategory: null,
  detailAnalysisOpen: false,
  baseResume: { text: '', fileName: '', fileType: '', updatedAt: 0 },
  jdSessions: [],
  activeJdId: '',
  lastUnderstanding: null,
  lastResumeJson: null,
  /** Frozen JSON from the master paste — never overwritten by tailored drafts. */
  resumeFieldsTouched: false,
  masterResumeJson: null,
  lastJdJson: null,
  lastMissingReport: null,
  lastAtsUnified: null,
  /** Set only after a successful manual "Score (score rule)" for this JD+resume pair. */
  manualScoreKey: '',
  /** Frozen score-rule report from that manual Score (used as rewrite gap source). */
  manualScoreUnified: null,
  selectedAiCategory: null,
};

const WORKSPACE_KEY = 'jobilly_workspace_v1';
const workspaceStorage = () => sessionStorage;
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
  if (state.editingResume) {
    const live = htmlToResumeText($('resumePaper'));
    if (live) {
      state.tailoredResume = live;
      if ($('outputArea')) $('outputArea').textContent = live;
    }
  }
  if ($('jdInput')) session.jd = $('jdInput').value;
  session.tailoredResume = state.tailoredResume || ($('outputArea') && $('outputArea').textContent) || '';
  syncJdSessionMeta(session, keywords || state.keywords);
  session.updatedAt = Date.now();
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
  try { workspaceStorage().setItem(WORKSPACE_KEY, JSON.stringify(payload)); } catch { /* quota */ }
}

function loadWorkspace() {
  try { localStorage.removeItem(WORKSPACE_KEY); } catch { /* legacy cleanup */ }
  try {
    const raw = workspaceStorage().getItem(WORKSPACE_KEY);
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
    // Stretch UI removed — never restore aggressive mode from saved workspace.
    state.mode = 'integrity';
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
    $('baseResumeName').textContent = name || (text.trim() ? 'Uploaded resume' : 'No file loaded — upload a PDF, DOC, or DOCX');
  }
  if (text.trim()) {
    const json = state.baseResume?.fields || parseResumeToJsonLocal(text);
    state.masterResumeJson = json;
    renderResumeFields(json);
  } else if ($('resumeFieldsCard')) {
    $('resumeFieldsCard').classList.add('hidden');
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
  clearManualScoreGate();
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
  const text = ($('resumeInput') && $('resumeInput').value) || '';
  const prev = String((state.baseResume && state.baseResume.text) || '');
  const hadResults = !!(
    state.manualScoreUnified
    || state.lastAtsUnified
    || String(state.tailoredResume || '').trim()
    || (state.jdSessions || []).some(s => String(s.tailoredResume || '').trim())
  );
  if (state.baseResume) state.baseResume.text = text;
  // Raw paste/replace of master resume invalidates prior Score + Rewrite.
  if (hadResults && jdHash(prev) !== jdHash(text)) {
    resetResultsUi(true, { clearAllSessionDrafts: true });
    if (state.baseResume) state.baseResume.text = text;
  } else {
    clearManualScoreGate();
  }
  if (!state.resumeFieldsTouched) {
    const json = parseResumeToJsonLocal(text);
    state.masterResumeJson = json;
    if (state.baseResume) state.baseResume.fields = json;
    renderResumeFields(json);
  }
  scheduleSaveWorkspace();
}

function onJdInput() {
  updateCounts();
  clearManualScoreGate();
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
  if (!/\.(pdf|doc|docx)$/i.test(file.name)) {
    showToast('Upload a PDF, DOC, or DOCX resume', '#e11d48');
    return;
  }
  showAiProcessing('Reading your resume…', 'Extracting text — then verify every field');
  try {
    const data = await fileToBase64(file);
    const payload = await extractResumeOnServer(file.name, data);
    setBaseResume(payload.text, file.name, {
      linkedin: payload.links && payload.links.linkedin,
      github: payload.links && payload.links.github,
    });
    updateAiProcessing(
      'Verify all details in the fields below',
      'Check header, summary, skills, experience, education, projects, certs, and other…',
    );
    await refreshResumeFields({ useGemini: true });
    updateAiProcessing(
      'Almost done — review the extracted fields',
      'Confirm every section looks right before you Score',
    );
    await new Promise(r => setTimeout(r, 600));
    stopAiProcessing();
    showToast('Verify all details in the fields, then Score');
    const card = $('resumeFieldsCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    stopAiProcessing();
    showToast(String(err.message || err).slice(0, 140), '#e11d48');
  }
}

function liftNameAboveLeadingHeading(text) {
  const lines = String(text || '').split('\n');
  let headIdx = -1;
  let nameIdx = -1;
  let contactIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (headIdx < 0 && /^(SUMMARY|OBJECTIVE|PROFILE|PROFESSIONAL SUMMARY)\b/i.test(l)) {
      headIdx = i;
      continue;
    }
    if (nameIdx < 0 && !(typeof isHeaderContactLine === 'function' && isHeaderContactLine(l)) && !(typeof isSectionHeader === 'function' && isSectionHeader(l))) {
      nameIdx = i;
      continue;
    }
    if (contactIdx < 0 && (typeof isHeaderContactLine === 'function' ? isHeaderContactLine(l) : /@|\d{3}|linkedin|github/i.test(l))) {
      contactIdx = i;
      break;
    }
  }
  if (headIdx < 0 || nameIdx < 0 || headIdx > nameIdx) return String(text || '');
  const heading = lines.splice(headIdx, 1)[0];
  if (nameIdx > headIdx) nameIdx -= 1;
  if (contactIdx > headIdx) contactIdx -= 1;
  const insertAt = (contactIdx >= 0 ? contactIdx : nameIdx) + 1;
  lines.splice(insertAt, 0, heading);
  return lines.join('\n');
}

function normalizeMasterResumeText(text, extra = {}) {
  let t = unstickGluedResumeText(text || '');
  t = liftNameAboveLeadingHeading(t);
  t = injectLinkedInSlug(t, extra.linkedin);
  t = injectGithubProfile(t, extra.github);
  t = normalizeContactInResume(t);
  t = stripFakeGitHub(t, t);
  t = stripFakeLinkedIn(t, t);
  const locked = buildLockedContactLine(extractContactFields(t));
  if (locked) t = restoreMasterContact(t, t);
  if (typeof normalizeExperienceRoleLines === 'function') t = normalizeExperienceRoleLines(t);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function setBaseResume(text, fileName, extra = {}) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const normalized = normalizeMasterResumeText(text || '', extra);
  const linkedin = shortenLinkedIn(extra.linkedin) || extractContactFields(normalized).linkedin || '';
  const github = extractGithubHandle(extra.github) || extractContactFields(normalized).github || '';
  state.baseResume = {
    text: normalized,
    fileName: fileName || '',
    fileType: ext || 'txt',
    updatedAt: Date.now(),
    linkedin,
    github,
  };
  applyBaseResumeToUi();
  updateCounts();
  state.masterResumeJson = parseResumeToJsonLocal(normalized);
  state.baseResume.fields = state.masterResumeJson;
  state.resumeFieldsTouched = false;
  // New/replaced resume — drop prior Score + Rewrite for every posting.
  resetResultsUi(true, { clearAllSessionDrafts: true });
  saveWorkspace();
  renderResumeFields(state.masterResumeJson);
}

function sanitizeMasterInEditor() {
  const el = $('resumeInput');
  const raw = el ? el.value : ((state.baseResume && state.baseResume.text) || '');
  const extra = {
    linkedin: state.baseResume && state.baseResume.linkedin,
    github: state.baseResume && state.baseResume.github,
  };
  const next = normalizeMasterResumeText(raw, extra);
  if (el && next && next !== raw) {
    el.value = next;
    if (state.baseResume) {
      state.baseResume.text = next;
      state.baseResume.updatedAt = Date.now();
    }
    saveWorkspace();
    updateCounts();
  }
  return next;
}

function rfInput(name, value, extra = '') {
  return `<input type="text" data-rf="${escapeHtml(name)}" value="${escapeHtml(value || '')}" ${extra} oninput="onResumeFieldInput()">`;
}

function rfArea(name, value, extra = '') {
  return `<textarea data-rf="${escapeHtml(name)}" ${extra} oninput="onResumeFieldInput()">${escapeHtml(value || '')}</textarea>`;
}

/** @param {{ bold?: boolean, span?: string, areaClass?: string, inputClass?: string }} opts */
function rfField(label, control, opts = {}) {
  const span = typeof opts === 'string' ? opts : (opts.span || '');
  const bold = typeof opts === 'object' && !!opts.bold;
  const badge = bold
    ? '<span class="rf-badge rf-badge-bold">Bold on page</span>'
    : '<span class="rf-badge rf-badge-plain">Normal</span>';
  const cls = `rf-field ${span} ${bold ? 'rf-bold-field' : ''}`.trim();
  return `<div class="${cls}"><label>${escapeHtml(label)} ${badge}</label>${control}</div>`;
}

function emptyJob() {
  return { company: '', role: '', location: '', start_date: '', end_date: '', responsibilities: [] };
}
function emptyEdu() {
  return { degree: '', institution: '', location: '', start_date: '', end_date: '' };
}
function emptyProject() {
  return { name: '', bullets: [] };
}
function emptyCert() {
  return { name: '', date: '' };
}

const RF_SECTIONS = [
  { id: 'header', label: 'Header' },
  { id: 'summary', label: 'Summary' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'other', label: 'Other' },
];

function rfSectionFilled(id, r) {
  const pi = r.personal_information || {};
  if (id === 'header') return !!(pi.name || pi.title || pi.email || pi.phone);
  if (id === 'summary') return !!String(r.professional_summary || '').trim();
  if (id === 'skills') return (r.skill_lines || []).some(s => s.label || s.value);
  if (id === 'experience') return (r.professional_experience || []).some(j => j.role || j.company || (j.responsibilities || []).length);
  if (id === 'education') return (r.education || []).some(e => e.degree || e.institution);
  if (id === 'projects') return (r.projects || []).some(p => p.name || (p.bullets || []).length);
  if (id === 'certifications') return (r.certifications || []).some(c => c.name);
  if (id === 'other') return (r.other_sections || []).some(o => o.section_name || o.heading || o.data);
  return false;
}

function renderResumeFieldsNav(r) {
  const nav = $('resumeFieldsNav');
  if (!nav) return;
  nav.innerHTML = `<div class="rf-nav-title">Fields check</div>` + RF_SECTIONS.map((s, i) => {
    const ok = rfSectionFilled(s.id, r);
    return `<button type="button" data-rf-nav="${s.id}" class="${ok ? 'ok' : ''}" onclick="scrollToRfSection('${s.id}')">
      <span class="rf-nav-num">${i + 1}</span><span>${escapeHtml(s.label)}</span>
    </button>`;
  }).join('');
}

function scrollToRfSection(id) {
  const panel = document.getElementById('rf-sec-' + id);
  const host = $('resumeFields');
  if (panel && host) {
    state._rfNavLock = id;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { if (state._rfNavLock === id) state._rfNavLock = ''; }, 700);
  }
  document.querySelectorAll('#resumeFieldsNav [data-rf-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-rf-nav') === id);
  });
}

let rfScrollObserver = null;
function bindResumeFieldsScrollSpy() {
  const host = $('resumeFields');
  if (!host || typeof IntersectionObserver === 'undefined') return;
  if (rfScrollObserver) {
    rfScrollObserver.disconnect();
    rfScrollObserver = null;
  }
  const sections = [...host.querySelectorAll('.rf-block[id^="rf-sec-"]')];
  if (!sections.length) return;
  rfScrollObserver = new IntersectionObserver((entries) => {
    if (state._rfNavLock) return;
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (!visible.length) return;
    const id = String(visible[0].target.id || '').replace(/^rf-sec-/, '');
    if (!id) return;
    document.querySelectorAll('#resumeFieldsNav [data-rf-nav]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-rf-nav') === id);
    });
  }, { root: host, rootMargin: '-10% 0px -55% 0px', threshold: [0.15, 0.35, 0.6] });
  sections.forEach(sec => rfScrollObserver.observe(sec));
}

function renderResumeFields(json) {
  const host = $('resumeFields');
  const card = $('resumeFieldsCard');
  if (!host || !card) return;
  const incoming = json || emptyResumeJson();
  const r = normalizeResumeJson(incoming);
  const pi = r.personal_information || {};
  const jobs = r.professional_experience.length ? r.professional_experience : [emptyJob()];
  const edus = r.education.length ? r.education : [emptyEdu()];
  const skills = r.skill_lines.length ? r.skill_lines : [{ label: '', value: '' }];
  const projects = (Array.isArray(incoming.projects) && incoming.projects.length)
    ? incoming.projects.map(p => ({ name: String(p?.name || ''), bullets: Array.isArray(p?.bullets) ? p.bullets : [] }))
    : r.projects;
  const certs = (Array.isArray(incoming.certifications) && incoming.certifications.length)
    ? incoming.certifications.map(c => (typeof c === 'string' ? { name: c, date: '' } : { name: String(c?.name || ''), date: String(c?.date || '') }))
    : r.certifications;
  const others = Array.isArray(incoming.other_sections)
    ? incoming.other_sections.map(o => ({
      section_name: String(o?.section_name || ''),
      heading: String(o?.heading || ''),
      data: String(o?.data || ''),
    }))
    : (r.other_sections || []).map(o => ({
      section_name: String(o?.section_name || ''),
      heading: String(o?.heading || ''),
      data: String(o?.data || ''),
    }));

  host.innerHTML = `
    <div class="rf-block" id="rf-sec-header">
      <div class="rf-head"><h3>1. Header</h3></div>
      <p class="rf-block-note">Name and title print <strong>bold</strong>. Phone, email, LinkedIn, GitHub, and location stay normal (contact line).</p>
      <div class="rf-grid">
        ${rfField('Name', rfInput('name', pi.name, 'class="rf-input-lg"'), { bold: true })}
        ${rfField('Title', rfInput('title', pi.title, 'class="rf-input-lg"'), { bold: true })}
        ${rfField('Phone', rfInput('phone', pi.phone), { bold: false })}
        ${rfField('Email', rfInput('email', pi.email), { bold: false })}
        ${rfField('LinkedIn', rfInput('linkedin', pi.linkedin), { bold: false, span: 'rf-span-2' })}
        ${rfField('GitHub', rfInput('github', pi.github), { bold: false, span: 'rf-span-2' })}
        ${rfField('Location', rfInput('location', pi.location), { bold: false })}
      </div>
    </div>
    <div class="rf-block" id="rf-sec-summary">
      <div class="rf-head"><h3>2. Summary</h3></div>
      <p class="rf-block-note">Body text is normal weight. JD keywords may auto-bold after rewrite.</p>
      ${rfField('Professional summary', rfArea('summary', r.professional_summary, 'class="rf-area-xl"'), { bold: false, span: 'rf-span-3' })}
    </div>
    <div class="rf-block" id="rf-sec-skills">
      <div class="rf-head">
        <h3>3. Skills</h3>
        <button type="button" class="btn-mini" onclick="addResumeField('skill')">Add skill line</button>
      </div>
      <p class="rf-block-note">Category labels print <strong>bold</strong>. The skills list after the colon stays normal.</p>
      ${skills.map((row, i) => `
        <div class="rf-item" data-kind="skill" data-idx="${i}">
          <div class="rf-item-top"><span>Line ${i + 1}</span><button type="button" class="btn-mini" onclick="removeResumeField('skill', ${i})">Remove</button></div>
          <div class="rf-grid rf-grid-2">
            ${rfField('Category', rfInput(`skill.${i}.label`, row.label, 'class="rf-input-lg"'), { bold: true })}
            ${rfField('Skills', rfArea(`skill.${i}.value`, row.value, 'class="rf-area-lg"'), { bold: false })}
          </div>
        </div>`).join('')}
    </div>
    <div class="rf-block" id="rf-sec-experience">
      <div class="rf-head">
        <h3>4. Experience</h3>
        <button type="button" class="btn-mini" onclick="addResumeField('job')">Add role</button>
      </div>
      <p class="rf-block-note">Role, company, location, and dates print <strong>bold</strong>. Bullet points stay normal (JD keywords may auto-bold after rewrite).</p>
      ${jobs.map((job, i) => `
        <div class="rf-item" data-kind="job" data-idx="${i}">
          <div class="rf-item-top"><span>${i === 0 ? 'Most recent role' : 'Previous role ' + i}</span><button type="button" class="btn-mini" onclick="removeResumeField('job', ${i})">Remove</button></div>
          <div class="rf-grid">
            ${rfField('Role', rfInput(`job.${i}.role`, job.role, 'class="rf-input-lg"'), { bold: true })}
            ${rfField('Company', rfInput(`job.${i}.company`, job.company, 'class="rf-input-lg"'), { bold: true })}
            ${rfField('Location', rfInput(`job.${i}.location`, job.location), { bold: true })}
            ${rfField('Start date', rfInput(`job.${i}.start`, job.start_date), { bold: true })}
            ${rfField('End date', rfInput(`job.${i}.end`, job.end_date), { bold: true })}
            ${rfField('Bullet points (one per line)', rfArea(`job.${i}.bullets`, (job.responsibilities || []).join('\n'), 'class="rf-area-xl"'), { bold: false, span: 'rf-span-3' })}
          </div>
        </div>`).join('')}
    </div>
    <div class="rf-block" id="rf-sec-education">
      <div class="rf-head">
        <h3>5. Education</h3>
        <button type="button" class="btn-mini" onclick="addResumeField('edu')">Add school</button>
      </div>
      <p class="rf-block-note">Course / degree prints <strong>bold</strong>. College and dates stay normal.</p>
      ${edus.map((edu, i) => `
        <div class="rf-item" data-kind="edu" data-idx="${i}">
          <div class="rf-item-top"><span>School ${i + 1}</span><button type="button" class="btn-mini" onclick="removeResumeField('edu', ${i})">Remove</button></div>
          <div class="rf-grid">
            ${rfField('Course / degree', rfInput(`edu.${i}.degree`, edu.degree, 'class="rf-input-lg"'), { bold: true, span: 'rf-span-2' })}
            ${rfField('College', rfInput(`edu.${i}.institution`, edu.institution, 'class="rf-input-lg"'), { bold: false, span: 'rf-span-2' })}
            ${rfField('From', rfInput(`edu.${i}.start`, edu.start_date), { bold: false })}
            ${rfField('To / passout year', rfInput(`edu.${i}.end`, edu.end_date), { bold: false })}
          </div>
        </div>`).join('')}
    </div>
    <div class="rf-block" id="rf-sec-projects">
      <div class="rf-head">
        <h3>6. Projects</h3>
        <button type="button" class="btn-mini" onclick="addResumeField('project')">Add project</button>
      </div>
      <p class="rf-block-note">Project name prints like a title line. Bullets stay normal.</p>
      ${projects.length ? projects.map((p, i) => `
        <div class="rf-item" data-kind="project" data-idx="${i}">
          <div class="rf-item-top"><span>Project ${i + 1}</span><button type="button" class="btn-mini" onclick="removeResumeField('project', ${i})">Remove</button></div>
          <div class="rf-grid">
            ${rfField('Project name', rfInput(`project.${i}.name`, p.name, 'class="rf-input-lg"'), { bold: true, span: 'rf-span-3' })}
            ${rfField('Bullet points (one per line)', rfArea(`project.${i}.bullets`, (p.bullets || []).join('\n'), 'class="rf-area-xl"'), { bold: false, span: 'rf-span-3' })}
          </div>
        </div>`).join('') : '<p class="hint" style="margin:0">None extracted. Add a project if the resume has one.</p>'}
    </div>
    <div class="rf-block" id="rf-sec-certifications">
      <div class="rf-head">
        <h3>7. Certifications</h3>
        <button type="button" class="btn-mini" onclick="addResumeField('cert')">Add certificate</button>
      </div>
      <p class="rf-block-note">Certification lines print at normal weight (section heading is bold).</p>
      ${certs.length ? certs.map((c, i) => `
        <div class="rf-item" data-kind="cert" data-idx="${i}">
          <div class="rf-item-top"><span>Certificate ${i + 1}</span><button type="button" class="btn-mini" onclick="removeResumeField('cert', ${i})">Remove</button></div>
          <div class="rf-grid rf-grid-2">
            ${rfField('Certificate name', rfInput(`cert.${i}.name`, c.name, 'class="rf-input-lg"'), { bold: false })}
            ${rfField('Date', rfInput(`cert.${i}.date`, c.date), { bold: false })}
          </div>
        </div>`).join('') : '<p class="hint" style="margin:0">None extracted. Add one if the resume lists a certificate.</p>'}
    </div>
    <div class="rf-block" id="rf-sec-other">
      <div class="rf-head">
        <h3>8. Other</h3>
        <button type="button" class="btn-mini" onclick="addResumeField('other')">Add section</button>
      </div>
      <p class="rf-block-note">Add any extra section (Awards, Languages, Volunteer, …). <strong>Section name</strong> prints as the bold ALL-CAPS heading. <strong>Heading</strong> is the bold line under it. <strong>Data</strong> is the body (one bullet per line).</p>
      ${others.length ? others.map((o, i) => `
        <div class="rf-item" data-kind="other" data-idx="${i}">
          <div class="rf-item-top"><span>Other section ${i + 1}</span><button type="button" class="btn-mini" onclick="removeResumeField('other', ${i})">Remove</button></div>
          <div class="rf-grid">
            ${rfField('Section name', rfInput(`other.${i}.section_name`, o.section_name, 'class="rf-input-lg" placeholder="e.g. AWARDS"'), { bold: true, span: 'rf-span-3' })}
            ${rfField('Heading inside it', rfInput(`other.${i}.heading`, o.heading, 'class="rf-input-lg" placeholder="e.g. Dean\'s List"'), { bold: true, span: 'rf-span-3' })}
            ${rfField('Data (one bullet per line)', rfArea(`other.${i}.data`, o.data, 'class="rf-area-xl"'), { bold: false, span: 'rf-span-3' })}
          </div>
        </div>`).join('') : '<p class="hint" style="margin:0">No extra sections yet. Click Add section for Awards, Languages, Volunteer, Publications, etc.</p>'}
    </div>`;
  renderResumeFieldsNav(r);
  card.classList.remove('hidden');
  const firstOk = RF_SECTIONS.find(s => !rfSectionFilled(s.id, r)) || RF_SECTIONS[0];
  document.querySelectorAll('#resumeFieldsNav [data-rf-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-rf-nav') === firstOk.id);
  });
  requestAnimationFrame(() => bindResumeFieldsScrollSpy());
}

function rfGet(name) {
  const el = Array.from(document.querySelectorAll('#resumeFields [data-rf]'))
    .find(node => node.getAttribute('data-rf') === name);
  return el ? String(el.value || '').trim() : '';
}

function rfBullets(name) {
  return rfGet(name).split(/\n+/).map(l => l.replace(/^[-•]\s+/, '').trim()).filter(Boolean);
}

function collectResumeFields() {
  const json = emptyResumeJson();
  json.personal_information = {
    name: rfGet('name'),
    title: rfGet('title'),
    phone: rfGet('phone'),
    email: rfGet('email'),
    linkedin: shortenLinkedIn(rfGet('linkedin')) || '',
    github: extractGithubHandle(rfGet('github')) || '',
    location: rfGet('location'),
  };
  json.professional_summary = rfGet('summary');
  const skillCount = document.querySelectorAll('#resumeFields [data-kind="skill"]').length;
  json.skill_lines = [];
  for (let i = 0; i < skillCount; i++) {
    const label = rfGet(`skill.${i}.label`);
    const value = rfGet(`skill.${i}.value`);
    if (label || value) json.skill_lines.push({ label, value });
  }
  json.skills = bucketsFromSkillLines(json.skill_lines);
  const jobCount = document.querySelectorAll('#resumeFields [data-kind="job"]').length;
  json.professional_experience = [];
  for (let i = 0; i < jobCount; i++) {
    const job = {
      role: rfGet(`job.${i}.role`),
      company: rfGet(`job.${i}.company`),
      location: rfGet(`job.${i}.location`),
      start_date: rfGet(`job.${i}.start`),
      end_date: rfGet(`job.${i}.end`),
      responsibilities: rfBullets(`job.${i}.bullets`),
    };
    if (job.role || job.company || job.responsibilities.length) json.professional_experience.push(job);
  }
  const eduCount = document.querySelectorAll('#resumeFields [data-kind="edu"]').length;
  json.education = [];
  for (let i = 0; i < eduCount; i++) {
    const edu = {
      degree: rfGet(`edu.${i}.degree`),
      institution: rfGet(`edu.${i}.institution`),
      start_date: rfGet(`edu.${i}.start`),
      end_date: rfGet(`edu.${i}.end`),
      location: '',
    };
    if (edu.degree || edu.institution) json.education.push(edu);
  }
  const projCount = document.querySelectorAll('#resumeFields [data-kind="project"]').length;
  json.projects = [];
  for (let i = 0; i < projCount; i++) {
    const p = { name: rfGet(`project.${i}.name`), bullets: rfBullets(`project.${i}.bullets`) };
    if (p.name || p.bullets.length) json.projects.push(p);
  }
  const certCount = document.querySelectorAll('#resumeFields [data-kind="cert"]').length;
  json.certifications = [];
  for (let i = 0; i < certCount; i++) {
    const c = { name: rfGet(`cert.${i}.name`), date: rfGet(`cert.${i}.date`) };
    if (c.name) json.certifications.push(c);
  }
  const otherCount = document.querySelectorAll('#resumeFields [data-kind="other"]').length;
  json.other_sections = [];
  for (let i = 0; i < otherCount; i++) {
    json.other_sections.push({
      section_name: rfGet(`other.${i}.section_name`),
      heading: rfGet(`other.${i}.heading`),
      data: rfGet(`other.${i}.data`),
    });
  }
  const normalized = normalizeResumeJson(json);
  // Keep blank Other rows visible in the form until the user removes them.
  if (otherCount > 0) {
    normalized.other_sections = [];
    for (let i = 0; i < otherCount; i++) {
      normalized.other_sections.push({
        section_name: rfGet(`other.${i}.section_name`),
        heading: rfGet(`other.${i}.heading`),
        data: rfGet(`other.${i}.data`),
      });
    }
  }
  return normalized;
}

function verifiedResumeJson() {
  const card = $('resumeFieldsCard');
  const host = $('resumeFields');
  if (host && card && !card.classList.contains('hidden') && host.querySelector('[data-rf]')) {
    return collectResumeFields();
  }
  return state.masterResumeJson || (state.baseResume && state.baseResume.fields) || null;
}

function applyResumeFieldsToMaster(opts = {}) {
  const json = collectResumeFields();
  const text = resumeJsonToMasterText(json);
  const prevText = String(
    (state.baseResume && state.baseResume.text)
    || ($('resumeInput') && $('resumeInput').value)
    || '',
  ).trim();
  const nextText = String(text || '').trim();
  const changed = prevText !== nextText;
  state.masterResumeJson = json;
  if (state.baseResume) {
    state.baseResume.text = text;
    state.baseResume.fields = json;
    state.baseResume.linkedin = json.personal_information.linkedin || '';
    state.baseResume.github = json.personal_information.github || '';
    state.baseResume.updatedAt = Date.now();
  }
  if ($('resumeInput')) $('resumeInput').value = text;
  updateCounts();
  // Syncing the same form before Score/Rewrite must not wipe a fresh score.
  // Real edits still clear the gate (unless keepScoreGate is set).
  if (changed && !opts.keepScoreGate) clearManualScoreGate();
  scheduleSaveWorkspace();
}

let resumeFieldTimer = null;
function onResumeFieldInput() {
  state.resumeFieldsTouched = true;
  clearTimeout(resumeFieldTimer);
  resumeFieldTimer = setTimeout(() => {
    applyResumeFieldsToMaster();
    refreshResumeFieldsNavStatus();
  }, 250);
}

function refreshResumeFieldsNavStatus() {
  const nav = $('resumeFieldsNav');
  if (!nav || nav.classList.contains('hidden')) return;
  let r;
  try { r = collectResumeFields(); } catch { return; }
  nav.querySelectorAll('[data-rf-nav]').forEach(btn => {
    const id = btn.getAttribute('data-rf-nav');
    btn.classList.toggle('ok', rfSectionFilled(id, normalizeResumeJson(r)));
  });
}

function addResumeField(kind) {
  // Prefer live form values; keep empty slots so "Add" can insert blank rows.
  let json;
  try {
    json = collectResumeFields();
  } catch {
    json = emptyResumeJson();
  }
  if (!Array.isArray(json.other_sections)) json.other_sections = [];
  if (kind === 'skill') json.skill_lines.push({ label: '', value: '' });
  if (kind === 'job') json.professional_experience.push(emptyJob());
  if (kind === 'edu') json.education.push(emptyEdu());
  if (kind === 'project') json.projects.push(emptyProject());
  if (kind === 'cert') json.certifications.push(emptyCert());
  if (kind === 'other') json.other_sections.push(emptyOther());
  state.resumeFieldsTouched = true;
  // Pass through without normalize filtering empty other rows
  renderResumeFields({ ...json, other_sections: json.other_sections.slice() });
  applyResumeFieldsToMaster({ keepScoreGate: true });
  if (kind === 'other') {
    scrollToRfSection('other');
    showToast('Other section added — fill section name, heading, and data');
  }
}

function removeResumeField(kind, idx) {
  const json = collectResumeFields();
  if (kind === 'skill') json.skill_lines.splice(idx, 1);
  if (kind === 'job') json.professional_experience.splice(idx, 1);
  if (kind === 'edu') json.education.splice(idx, 1);
  if (kind === 'project') json.projects.splice(idx, 1);
  if (kind === 'cert') json.certifications.splice(idx, 1);
  if (kind === 'other') json.other_sections.splice(idx, 1);
  state.resumeFieldsTouched = true;
  renderResumeFields(json);
  applyResumeFieldsToMaster();
}

async function refreshResumeFields(opts = {}) {
  const text = (state.baseResume && state.baseResume.text) || ($('resumeInput') && $('resumeInput').value) || '';
  if (!text.trim()) {
    if ($('resumeFieldsCard')) $('resumeFieldsCard').classList.add('hidden');
    return;
  }
  let json = parseResumeToJsonLocal(text);
  state.masterResumeJson = json;
  if (state.baseResume) state.baseResume.fields = json;
  renderResumeFields(json);
  if (opts.useGemini && !state.resumeFieldsTouched) {
    try {
      const richer = await parseResumeToJson(text);
      if (!state.resumeFieldsTouched && richer) {
        json = richer;
        state.masterResumeJson = json;
        if (state.baseResume) state.baseResume.fields = json;
        renderResumeFields(json);
        applyResumeFieldsToMaster();
      }
    } catch { /* keep local fields */ }
  }
  saveWorkspace();
}

function triggerReplaceResume() {
  const input = $('resumeFileInput');
  if (input) input.click();
}

function clearBaseResume() {
  const hasResume = !!(
    String((state.baseResume && state.baseResume.text) || '').trim()
    || String(($('resumeInput') && $('resumeInput').value) || '').trim()
    || (state.baseResume && state.baseResume.fileName)
  );
  if (!hasResume) {
    showToast('No resume to clear', '#d97706');
    return;
  }
  state.baseResume = { text: '', fileName: '', fileType: '', updatedAt: Date.now(), linkedin: '', github: '', fields: null };
  state.masterResumeJson = null;
  state.resumeFieldsTouched = false;
  if ($('resumeInput')) $('resumeInput').value = '';
  if ($('resumeFileInput')) $('resumeFileInput').value = '';
  if ($('baseResumeName')) $('baseResumeName').textContent = 'No file loaded — upload a PDF, DOC, or DOCX';
  if ($('resumeFieldsCard')) $('resumeFieldsCard').classList.add('hidden');
  if ($('resumeFields')) $('resumeFields').innerHTML = '';
  if ($('resumeFieldsNav')) $('resumeFieldsNav').innerHTML = '';
  resetResultsUi(true, { clearAllSessionDrafts: true });
  updateCounts();
  saveWorkspace();
  showToast('Resume cleared');
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
  if ($('postRewriteScore')) $('postRewriteScore').classList.add('hidden');
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
  // Stretch / Role-focus UI removed — always Stay truthful (JD skills only).
  const next = 'integrity';
  if (state.mode !== next) {
    state.keywords = null;
    state.kwHash = '';
    clearManualScoreGate();
  }
  state.mode = next;
  if ($('modeIntegrity')) $('modeIntegrity').classList.toggle('active', true);
  if ($('modeAggressive')) $('modeAggressive').classList.toggle('active', false);
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
  const roleTitle = cleanJobTitle(
    keywords?.role?.title || keywords?.role?.label || keywords?.title
    || (window.RAGEngine && RAGEngine.extractJdTitle(jd))
    || currentHeadline()
    || 'Role'
  );
  const role = shortcutRole(roleTitle);
  return `${first}_${role}`;
}

function updateExportFilename(resumeText) {
  const jd = ($('jdInput') && $('jdInput').value.trim()) || '';
  const base = buildExportBasename(resumeText, jd, state.keywords || {});
  state.exportBasename = base;
  state.filename = `${base}.doc`;
  if ($('suggestedFilename')) $('suggestedFilename').textContent = `${base}.pdf`;
  if ($('filenameReason')) {
    $('filenameReason').textContent = 'Format: FirstName_RoleShortcut (e.g. John_DEEngg.pdf). Used for Print/PDF, Word, and text saves.';
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
  const p = String(phone).trim().replace(/[–—]/g, '-');
  if (!/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(p)) return '';
  if (/^\+1(?:\s|[(.-]|\d)/.test(p)) return p;
  if (/^1[\s(.-]\d{3}/.test(p)) return '+' + p;
  return '+1 ' + p.replace(/^\+?/, '');
}

function shortenLinkedIn(url) {
  const s = String(url || '').trim();
  if (!s || /^(linkedin|linked\s*in|profile)$/i.test(s)) return '';
  const m = s.match(/(?:https?:\/\/)?(?:[\w-]+\.)?(linkedin\.com\/(?:mwlite\/)?(?:in|pub)\/[A-Za-z0-9\-_%\.]+)/i)
    || s.match(/(lnkd\.in\/[A-Za-z0-9_-]+)/i);
  if (!m) return '';
  const slug = m[1].toLowerCase().replace(/\/$/, '');
  const handle = slug.split('/').pop();
  if (/^(username|your-profile|yourname|name|profile|jane-doe)$/i.test(handle || '')) return '';
  return slug;
}

function formatContactLine(line) {
  if (!line) return '';
  const raw = typeof normalizeContactSeparators === 'function'
    ? normalizeContactSeparators(line)
    : String(line);
  const seen = new Set();
  const out = [];
  const push = (v) => {
    const t = String(v || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (let part of raw.split('|')) {
    let p = String(part || '').trim();
    if (!p) continue;
    const email = (p.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0];
    if (email) {
      push(email);
      p = p.replace(email, ' ').trim();
    }
    const phoneMatch = p.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) {
      push(formatPhoneUS(phoneMatch[0]));
      p = p.replace(phoneMatch[0], ' ').trim();
    }
    const slug = shortenLinkedIn(p);
    if (slug) {
      push(slug);
      p = p.replace(/(?:https?:\/\/)?(?:[\w-]+\.)?(linkedin\.com\/(?:mwlite\/)?(?:in|pub)\/[A-Za-z0-9\-_%\.]+)/i, ' ')
        .replace(/(lnkd\.in\/[A-Za-z0-9_-]+)/i, ' ')
        .trim();
    } else if (/^(linkedin|linked\s*in)\b/i.test(p)) {
      continue;
    }
    const gh = typeof extractGithubHandle === 'function' ? extractGithubHandle(p) : '';
    if (gh) {
      push(gh);
      p = p.replace(gh, ' ').replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\b/i, ' ').trim();
    } else if (/^github\b/i.test(p)) {
      continue;
    }
    p = p.replace(/^[\s|,•·-]+|[\s|,•·-]+$/g, '').trim();
    if (p && !/^(linkedin|github|email|phone|mobile)$/i.test(p)) push(p);
  }
  return out.join(' | ');
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
    if (/@/.test(l) || /\d{3}[\s.()-]*\d{3}/.test(l) || /linkedin/i.test(l) || /\bgithub\b/i.test(l)) {
      const trimmed = formatContactLine(l);
      if (trimmed !== l) lines[i] = lines[i].replace(l, trimmed);
    }
  }
  return lines.join('\n');
}

function injectLinkedInSlug(text, slug) {
  const clean = shortenLinkedIn(slug);
  if (!clean) return String(text || '');
  const lines = String(text || '').split('\n');
  const slugRe = new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = String(lines[i] || '').trim();
    if (!l) continue;
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) break;
    if (slugRe.test(l) || /linkedin\.com\/in\/(?:username|jane-doe)\b/i.test(l)) {
      lines[i] = l.replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/(?:username|jane-doe)\b/gi, clean);
      if (slugRe.test(lines[i])) return lines.join('\n');
    }
    if (isHeaderContactLine(l) || /linkedin/i.test(l)) {
      let next = l.replace(/\bLinked\s*In\b/i, clean);
      if (!slugRe.test(next)) next = (next ? next + ' | ' : '') + clean;
      lines[i] = next;
      return lines.join('\n');
    }
  }
  return lines.join('\n');
}

function stripLinkedInFromContactLine(line, keepSlug) {
  const keep = shortenLinkedIn(keepSlug);
  const parts = String(line || '').split('|').map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const out = [];
    let keptProfile = false;
    for (const p of parts) {
      if (/^(linkedin|linked\s*in)\b/i.test(p) && !shortenLinkedIn(p)) continue;
      const slug = shortenLinkedIn(p);
      if (slug || /linkedin\.com\//i.test(p) || /lnkd\.in\//i.test(p)) {
        if (keep && !keptProfile) {
          out.push(keep);
          keptProfile = true;
        }
        continue;
      }
      out.push(p);
    }
    if (keep && !keptProfile) out.push(keep);
    return out.join(' | ');
  }
  let raw = String(line || '');
  if (keep) {
    if (shortenLinkedIn(raw)) {
      return raw
        .replace(/(?:https?:\/\/)?(?:[\w-]+\.)?(linkedin\.com\/(?:mwlite\/)?(?:in|pub)\/[A-Za-z0-9\-_%\.]+)/i, keep)
        .replace(/(lnkd\.in\/[A-Za-z0-9_-]+)/i, keep);
    }
    return raw.replace(/\bLinked\s*In\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  return raw
    .replace(/\s*\|\s*(?:https?:\/\/)?(?:[\w-]+\.)?(linkedin\.com\/(?:mwlite\/)?(?:in|pub)\/[A-Za-z0-9\-_%\.]+)/gi, '')
    .replace(/(?:https?:\/\/)?(?:[\w-]+\.)?(linkedin\.com\/(?:mwlite\/)?(?:in|pub)\/[A-Za-z0-9\-_%\.]+)/gi, '')
    .replace(/\s*\|\s*lnkd\.in\/[A-Za-z0-9_-]+/gi, '')
    .replace(/\blnkd\.in\/[A-Za-z0-9_-]+/gi, '')
    .replace(/\s*\|\s*Linked\s*In\b/gi, '')
    .replace(/\bLinked\s*In\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripFakeLinkedIn(text, masterText) {
  const master = String(masterText || ($('resumeInput') && $('resumeInput').value) || (state.baseResume && state.baseResume.text) || '');
  const slug = shortenLinkedIn(extractContactFields(master).linkedin) || '';
  const lines = String(text || '').split('\n');
  let sawContact = false;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = String(lines[i] || '').trim();
    if (!l) continue;
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) break;
    if (!(isHeaderContactLine(l) || /linkedin/i.test(l))) continue;
    sawContact = true;
    lines[i] = stripLinkedInFromContactLine(lines[i], slug);
  }
  if (slug && !sawContact) return injectLinkedInSlug(lines.join('\n'), slug);
  if (slug) return injectLinkedInSlug(lines.join('\n'), slug);
  return lines.join('\n');
}

function restoreMasterLinkedIn(text, master) {
  const slug = shortenLinkedIn(extractContactFields(master).linkedin)
    || shortenLinkedIn(state.baseResume && state.baseResume.linkedin);
  let out = slug ? injectLinkedInSlug(text, slug) : String(text || '');
  if (!slug) out = stripFakeLinkedIn(out, master);
  return out;
}

const US_STATE_ABBR = 'AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY';
const US_STATE_NAMES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia';
const PLACE_RE = new RegExp(
  String.raw`\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*),\s*(?:${US_STATE_ABBR}|${US_STATE_NAMES})(?:\s*,\s*(?:USA|US|United States))?\b`,
  'i',
);

function isSchoolishLine(line) {
  return /\b(university|college|institute|school|polytechnic|bachelor|master|b\.?s\.?|m\.?s\.?|mba|ph\.?d|b\.?tech|m\.?tech|sacred heart)\b/i.test(String(line || ''));
}

function extractPlaceToken(text) {
  const m = String(text || '').match(PLACE_RE);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  const st = String(text || '').match(new RegExp(String.raw`\b(?:${US_STATE_ABBR})\s*,\s*(?:USA|US|United States)\b`, 'i'));
  return st ? st[0].replace(/\s+/g, ' ').trim() : '';
}

function resumeHeaderLines(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim());
  const out = [];
  for (const l of lines) {
    if (!l) continue;
    if (typeof isSectionHeader === 'function' ? isSectionHeader(l) : /^(SUMMARY|SKILLS|EXPERIENCE|EDUCATION|PROJECTS)\b/i.test(l)) break;
    out.push(l);
    if (out.length >= 12) break;
  }
  return out;
}

/** Personal city from the name/contact header only — never college or employer cities. */
function extractPersonalLocation(text, resumeJson) {
  const header = resumeHeaderLines(text);
  const standalone = [];
  for (const l of header) {
    if (/@/.test(l) || /\d{3}[\s.()-]*\d{3}/.test(l) || /linkedin/i.test(l) || /\bgithub\b/i.test(l)) continue;
    if (isSchoolishLine(l)) continue;
    const place = extractPlaceToken(l);
    if (!place) continue;
    const rest = l.replace(place, '').replace(/[|•,.\s-]+/g, '');
    if (rest.length <= 4) standalone.push(place);
  }
  if (standalone.length) return standalone[0];

  for (const l of header) {
    if (!(/@/.test(l) || /\d{3}/.test(l) || /linkedin/i.test(l) || /\bgithub\b/i.test(l))) continue;
    for (const p of l.split(/[|•]/).map(s => s.trim())) {
      if (/@/.test(p) || /\d{3}/.test(p) || /linkedin/i.test(p) || /\bgithub\b/i.test(p) || isSchoolishLine(p)) continue;
      const place = extractPlaceToken(p);
      if (place) return place;
    }
  }

  const jsonLoc = String(resumeJson?.personal_information?.location || '').trim();
  const jsonPlace = extractPlaceToken(jsonLoc) || jsonLoc;
  const eduLocs = (resumeJson?.education || [])
    .map(e => String(e.location || '').trim().toLowerCase())
    .filter(Boolean);
  if (jsonPlace && !isSchoolishLine(jsonPlace)) {
    const hitEdu = eduLocs.some(e => e && (jsonPlace.toLowerCase() === e || e.includes(jsonPlace.toLowerCase()) || jsonPlace.toLowerCase().includes(e)));
    if (!hitEdu) return jsonPlace;
  }

  for (const l of header) {
    if (isSchoolishLine(l)) continue;
    const place = extractPlaceToken(l);
    if (place) return place;
  }
  return '';
}

function applyPersonalLocationFromHeader(resumeJson, text) {
  const rj = resumeJson || emptyResumeJson();
  const headerLoc = extractPersonalLocation(text, null);
  if (headerLoc) {
    rj.personal_information.location = headerLoc;
  } else {
    const jsonLoc = String(rj.personal_information?.location || '').trim();
    const eduLocs = (rj.education || []).map(e => String(e.location || '').trim().toLowerCase()).filter(Boolean);
    if (jsonLoc && eduLocs.some(e => e && (jsonLoc.toLowerCase() === e || jsonLoc.toLowerCase().includes(e)))) {
      rj.personal_information.location = '';
    }
  }
  const cf = extractContactFields(text, rj);
  rj.personal_information.phone = cf.phone || '';
  rj.personal_information.email = cf.email || '';
  rj.personal_information.linkedin = cf.linkedin || '';
  rj.personal_information.github = cf.github || rj.personal_information.github || '';
  return rj;
}

function restoreMasterLocation(text, master) {
  const loc = extractContactFields(master).location;
  if (!loc) return String(text || '');
  const lines = String(text || '').split('\n');
  let seenName = false;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!seenName) {
      seenName = true;
      continue;
    }
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) break;
    if (/@/.test(l) || /\d{3}[\s.()-]*\d{3}/.test(l) || /linkedin/i.test(l) || /\bgithub\b/i.test(l)) {
      const parts = l.split('|').map(p => p.trim()).filter(Boolean);
      let replaced = false;
      const next = parts.map(p => {
        if (/@/.test(p) || /\d{3}/.test(p) || /linkedin/i.test(p) || /\bgithub\b/i.test(p)) return p;
        if (extractPlaceToken(p)) {
          replaced = true;
          return loc;
        }
        return p;
      });
      if (!replaced) next.push(loc);
      lines[i] = next.join(' | ');
      break;
    }
  }
  return lines.join('\n');
}

function extractGithubHandle(text) {
  const m = String(text || '').match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_-]+)/i);
  if (!m) return '';
  if (/^(username|yourname|profile|settings|explore|features|topics|marketplace|login|signup|about|pricing|orgs|notifications)$/i.test(m[1])) return '';
  return `github.com/${m[1]}`;
}

function githubFromHeader(header) {
  return extractGithubHandle(header) || '';
}

function injectGithubProfile(text, slug) {
  const clean = extractGithubHandle(slug);
  if (!clean) return String(text || '');
  const lines = String(text || '').split('\n');
  const slugRe = new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = String(lines[i] || '').trim();
    if (!l) continue;
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) break;
    if (/GitHub\s+Actions/i.test(l) && !/@/.test(l) && !/\d{3}/.test(l)) continue;
    if (slugRe.test(l)) return lines.join('\n');
    if (isHeaderContactLine(l) || /github/i.test(l)) {
      let next = l.replace(/(?:^|\||•)\s*GitHub\s*(?=\||$)/i, (m) => m.replace(/GitHub/i, clean));
      if (!slugRe.test(next)) next = (next ? next + ' | ' : '') + clean;
      lines[i] = next;
      return lines.join('\n');
    }
  }
  return lines.join('\n');
}

function stripGithubFromContactLine(line, keepProfile) {
  const keep = extractGithubHandle(keepProfile);
  const parts = String(line || '').split('|').map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const out = [];
    let keptProfile = false;
    for (const p of parts) {
      if (/^github$/i.test(p)) continue;
      const gh = extractGithubHandle(p);
      if (gh) {
        if (keep && !keptProfile) {
          out.push(keep);
          keptProfile = true;
        }
        continue;
      }
      out.push(p);
    }
    if (keep && !keptProfile) out.push(keep);
    return out.join(' | ');
  }
  let raw = String(line || '');
  if (keep) {
    if (extractGithubHandle(raw)) return raw.replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\b/i, keep);
    return raw.replace(/(?:^|\s)GitHub(?:\s*\||\s*$)/gi, ' ').trim();
  }
  return raw
    .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\b/gi, '')
    .replace(/(?:^|\s)GitHub(?:\s*\||\s*$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripFakeGitHub(text, masterText) {
  const master = String(masterText || ($('resumeInput') && $('resumeInput').value) || (state.baseResume && state.baseResume.text) || '');
  const profile = githubFromHeader(resumeHeaderLines(master).join('\n')) || '';
  const lines = String(text || '').split('\n');
  let sawContact = false;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = String(lines[i] || '').trim();
    if (!l) continue;
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) break;
    if (!(isHeaderContactLine(l) || /github/i.test(l))) continue;
    sawContact = true;
    lines[i] = stripGithubFromContactLine(lines[i], profile);
  }
  if (profile && !sawContact) {
    return injectGithubProfile(lines.join('\n'), profile);
  }
  if (profile) return injectGithubProfile(lines.join('\n'), profile);
  return lines.join('\n');
}

function linkedinFromHeader(header) {
  const raw = (String(header || '').match(/(https?:\/\/)?([\w-]+\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9\-_%]+\/?/i) || [])[0]
    || (String(header || '').match(/lnkd\.in\/[A-Za-z0-9_-]+/i) || [])[0]
    || '';
  return shortenLinkedIn(raw) || '';
}

const GLUED_CITY_RE = 'Los Angeles|New York|San Francisco|San Jose|San Diego|Chicago|Houston|Dallas|Austin|Seattle|Boston|Denver|Atlanta|Miami|Phoenix|Portland|Philadelphia|Hyderabad|Bangalore|Bengaluru|Chennai|Pune|Mumbai|Delhi|Noida|Gurgaon|Gurugram|Glassboro';

function normalizeContactSeparators(s) {
  return String(s || '')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219•·●]/g, ' | ')
    .replace(/[–—]/g, '–');
}

function unstickGluedResumeText(text) {
  let s = String(text || '').replace(/^\uFEFF/, '').replace(/\u00a0/g, ' ').replace(/\t/g, ' ');
  s = s.replace(/\x7f/g, '•');
  s = s.replace(/[–—]/g, '–');
  s = s.split('\n').map(line => {
    if (/@/i.test(line) || /linkedin/i.test(line) || /\d{3}[\s.()-]*\d{3}/.test(line)) {
      return line.replace(/[\u2022\u2023\u25E6\u2043\u2219•·●]/g, ' | ').replace(/(?<=\S)\s*\|\s*(?=\S)/g, ' | ');
    }
    return line;
  }).join('\n');
  s = s.replace(/^[•·●]\s*/gm, '- ');
  s = s.replace(new RegExp('([a-z])(' + GLUED_CITY_RE + ')\\b', 'g'), '$1 $2');
  s = s.replace(/([a-z])(India|USA|UK|Canada|Germany|Singapore)\b/g, '$1 $2');
  s = s.replace(/([a-z])((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\d{4})/gi, '$1 $2');
  s = s.replace(/([a-z])(Graduated:?)/gi, '$1 $2');
  s = s.replace(/\s*\|\s*Job Title\b/gi, '');
  s = s.replace(/(^|\s|\|)Job Title(\s|\||$)/gi, '$1$2');
  s = s.replace(/(?:\|\s*){2,}/g, '| ');
  s = s.replace(/[ \t]+\|[ \t]+/g, ' | ');
  s = s.split('\n').map(l => l.trim()).join('\n');
  return s;
}

function unstickCompanyPlace(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return { company: '', location: '' };
  const cityState = t.match(new RegExp('^(.*?)\\s+(' + GLUED_CITY_RE + ')(,\\s*[A-Z]{2}(?:\\s*,?\\s*USA)?)?$', 'i'));
  if (cityState && cityState[1] && cityState[1].length >= 2 && !looksLikeJobTitleToken(cityState[1])) {
    return {
      company: cityState[1].trim(),
      location: (cityState[2] + (cityState[3] || '')).replace(/^,\s*/, '').trim(),
    };
  }
  const gluedCity = t.match(new RegExp('^(.*[a-z])(' + GLUED_CITY_RE + ')(,\\s*[A-Z]{2})?$', 'i'));
  if (gluedCity && gluedCity[1].length >= 2) {
    return {
      company: gluedCity[1].trim(),
      location: (gluedCity[2] + (gluedCity[3] || '')).trim(),
    };
  }
  const country = t.match(/^(.*[a-z])(India|USA|UK|Canada|Germany|Singapore)$/i);
  if (country && country[1].length >= 3 && !looksLikeJobTitleToken(country[1])) {
    return { company: country[1].trim(), location: country[2] };
  }
  const countrySpaced = t.match(/^(.*?)\s+(India|USA|UK|Canada|Germany|Singapore)$/i);
  if (countrySpaced && countrySpaced[1].length >= 2 && !looksLikeJobTitleToken(countrySpaced[1])) {
    return { company: countrySpaced[1].trim(), location: countrySpaced[2] };
  }
  const split = typeof splitCompanyLocation === 'function' ? splitCompanyLocation(t) : { company: t, location: '' };
  if (split.location) return split;
  return { company: t, location: '' };
}

function extractContactFields(resumeText, resumeJson = null) {
  const raw = unstickGluedResumeText(resumeText || '');
  const header = resumeHeaderLines(raw).join('\n');
  const blob = [header, raw.split('\n').slice(0, 12).join('\n')].join('\n');
  const email = (blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const rawPhone = (blob.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [])[0] || '';
  return {
    email,
    phone: formatPhoneUS(rawPhone),
    linkedin: linkedinFromHeader(header) || linkedinFromHeader(blob),
    github: githubFromHeader(header),
    location: extractPersonalLocation(raw, resumeJson),
  };
}

function buildLockedContactLine(cf) {
  return [cf?.phone, cf?.email, cf?.linkedin, cf?.github, cf?.location].filter(Boolean).join(' | ');
}

function verifiedContactFields(resumeText) {
  const rj = frozenMasterResumeJson() || verifiedResumeJson();
  const pi = rj && rj.personal_information;
  if (pi) {
    return {
      email: String(pi.email || '').trim(),
      phone: String(pi.phone || '').trim(),
      linkedin: shortenLinkedIn(pi.linkedin) || '',
      github: extractGithubHandle(pi.github) || '',
      location: String(pi.location || '').trim(),
    };
  }
  return extractContactFields(resumeText);
}

function formatVerifiedOmitBlock(resumeText) {
  const rj = normalizeResumeJson(frozenMasterResumeJson() || verifiedResumeJson() || parseResumeToJsonLocal(resumeText || ''));
  const pi = rj.personal_information || {};
  const omit = [];
  if (!pi.phone) omit.push('phone number');
  if (!pi.email) omit.push('email');
  if (!pi.linkedin) omit.push('LinkedIn (no linkedin.com/in URL — do not write LinkedIn or invent a slug)');
  if (!pi.github) omit.push('GitHub (no github.com profile — do not write GitHub or invent a handle)');
  if (!pi.location) omit.push('personal city / location');
  if (!pi.title) omit.push('header title line other than the most recent EXPERIENCE job title on Line 2');
  if (!rj.professional_summary) omit.push('the entire SUMMARY section');
  if (!(rj.skill_lines || []).length) omit.push('the entire SKILLS / TECHNICAL SKILLS section');
  if (!(rj.professional_experience || []).length) omit.push('the entire PROFESSIONAL EXPERIENCE section');
  if (!(rj.education || []).length) omit.push('the entire EDUCATION section');
  if (!(rj.projects || []).length) omit.push('the entire PROJECTS section');
  if (!(rj.certifications || []).length) omit.push('the entire CERTIFICATIONS section');
  (rj.professional_experience || []).forEach((job, i) => {
    const label = job.company || job.role || `role ${i + 1}`;
    if (!job.location) omit.push(`location on ${label}`);
    if (!job.start_date && !job.end_date) omit.push(`dates on ${label}`);
  });
  (rj.education || []).forEach((edu, i) => {
    const label = edu.degree || edu.institution || `school ${i + 1}`;
    if (!edu.institution) omit.push(`college for ${label}`);
    if (!edu.start_date && !edu.end_date) omit.push(`dates for ${label}`);
  });
  if (!omit.length) {
    return 'VERIFIED FIELDS: every filled field on the verified form may appear. Still do not invent missing employers, degrees, or metrics.';
  }
  return `VERIFIED EMPTY FIELDS — these were blank on the verified resume form. Do NOT add them to the tailored resume. Fill them on the form and Score again if they should appear.
${omit.map(item => `  - OMIT ${item}`).join('\n')}
Empty sections get no heading. Empty contact tokens (LinkedIn, GitHub, phone, email, city) must not appear on Line 3.`;
}

function formatContactLineInstruction(resumeText) {
  const master = ($('resumeInput') && $('resumeInput').value) || resumeText || '';
  const line = buildLockedContactLine(verifiedContactFields(master));
  if (!line) {
    return 'Line 3: omit — the verified resume has no phone, email, LinkedIn, GitHub profile, or city. Do NOT invent any of them.';
  }
  return `Line 3: ${line}  (copy exactly; include ONLY these verified fields; keep linkedin.com/in/… or github.com/username only when filled on the form; never invent a phone, LinkedIn slug, GitHub, email, or city. Do not put the word LinkedIn or GitHub without a real profile URL.)`;
}

function formatLockedContactBlock(resumeText) {
  const master = ($('resumeInput') && $('resumeInput').value) || resumeText || '';
  const cf = verifiedContactFields(master);
  const line = buildLockedContactLine(cf);
  const li = shortenLinkedIn(cf.linkedin);
  const gh = extractGithubHandle(cf.github);
  return `LOCKED CONTACT — copy only what is filled on the verified resume form. Never invent a phone, email, LinkedIn slug, GitHub, or city.
  Email: ${cf.email || 'OMIT — verified email is empty'}
  Phone: ${cf.phone || 'OMIT — verified phone is empty'}
  LinkedIn: ${li ? li + ' — KEEP this LinkedIn URL on Line 3' : 'OMIT — LinkedIn field is empty. Do not add the word LinkedIn or invent a slug.'}
  GitHub: ${gh ? gh + ' — KEEP this github.com profile on Line 3' : 'OMIT — GitHub field is empty. Do not add the word GitHub or invent a handle. GitHub Actions in SKILLS is not a profile.'}
  Location: ${cf.location || 'OMIT — verified location is empty'}
  Line 3 must be exactly: ${line || '[no contact fields — omit Line 3]'}
  If a linkedin.com/in/… (or lnkd.in) value is filled on the form, it MUST stay on Line 3. The word LinkedIn alone is not a profile.
  If a github.com/username value is filled on the form, it MUST stay on Line 3. The word GitHub alone is not a profile.
  Personal city only — do NOT substitute a college city, university city, or employer office city.`;
}

function isHeaderContactLine(l) {
  const t = String(l || '').trim();
  if (!t || (typeof isSectionHeader === 'function' && isSectionHeader(t))) return false;
  if (/@/.test(t)) return true;
  if (/linkedin/i.test(t) || /\bgithub\b/i.test(t) || /lnkd\.in/i.test(t)) return true;
  if (/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(t)) return true;
  return false;
}

function restoreMasterContact(text, master) {
  const cf = verifiedContactFields(master);
  const locked = buildLockedContactLine(cf);
  const lines = String(text || '').split('\n');
  let seenName = false;
  let idx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!seenName) {
      seenName = true;
      continue;
    }
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) break;
    if (isHeaderContactLine(l)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    if (!locked) return lines.join('\n');
    let seen = 0;
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!String(lines[i] || '').trim()) continue;
      if (typeof isSectionHeader === 'function' && isSectionHeader(lines[i])) {
        insertAt = i;
        break;
      }
      seen += 1;
      if (seen === 2) {
        insertAt = i + 1;
        break;
      }
    }
    if (insertAt >= 0) lines.splice(insertAt, 0, locked);
    return lines.join('\n');
  }
  if (!locked) {
    lines.splice(idx, 1);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  lines[idx] = locked;
  return lines.join('\n');
}

/** Drop any tailored content that was blank on the verified form (unless filled before score). */
function enforceVerifiedEmptyFields(text, master) {
  const rj = normalizeResumeJson(
    frozenMasterResumeJson()
    || verifiedResumeJson()
    || parseResumeToJsonLocal(master || text || ''),
  );
  const pi = rj.personal_information || {};
  let t = String(text || '');

  // Contact: only filled verified tokens.
  t = restoreMasterContact(t, master || t);
  t = stripFakeLinkedIn(t, master || '');
  t = stripFakeGitHub(t, master || '');
  if (!pi.linkedin) {
    t = t.replace(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/(?:mwlite\/)?(?:in|pub)\/[A-Za-z0-9\-_%\.]+/gi, '')
      .replace(/(?:https?:\/\/)?(?:www\.)?lnkd\.in\/[A-Za-z0-9_-]+/gi, '');
  }
  if (!pi.github) {
    t = t.replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+/gi, '');
  }
  if (!pi.location) {
    const lines = t.split('\n');
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      if (!isHeaderContactLine(lines[i])) continue;
      lines[i] = lines[i]
        .split('|')
        .map(p => p.trim())
        .filter(p => {
          if (!p) return false;
          if (/@/.test(p) || /\d{3}/.test(p) || /linkedin|github|lnkd\.in/i.test(p)) return true;
          return !extractPlaceToken(p) && !/^(remote|hybrid|onsite|on-site)$/i.test(p);
        })
        .join(' | ');
      break;
    }
    t = lines.join('\n');
  }

  // Whole sections that were empty on the form — never invent headings.
  if (!rj.professional_summary) {
    t = stripSectionsByHeader(t, l => /^(summary|professional summary|objective|profile)$/i.test(normalizeHeader(l))).lines.join('\n');
  }
  if (!(rj.skill_lines || []).length && !skillsFromResumeJson(rj).length) {
    t = stripSectionsByHeader(t, l => /^(skills|technical skills)$/i.test(normalizeHeader(l))).lines.join('\n');
  }
  if (!(rj.projects || []).length) {
    t = stripSectionsByHeader(t, isProjectsHeader).lines.join('\n');
  }
  if (!(rj.certifications || []).length) {
    t = stripSectionsByHeader(t, l => /^certif/i.test(normalizeHeader(l))).lines.join('\n');
  }
  if (!(rj.education || []).length) {
    t = stripSectionsByHeader(t, l => /^education$/i.test(normalizeHeader(l))).lines.join('\n');
  }

  // Experience: strip location / dates that were blank on the verified form.
  const jobs = rj.professional_experience || [];
  if (jobs.length) {
    const masterRoles = jobs.map(j => ({
      company: j.company || '',
      title: j.role || '',
      location: j.location || '',
      dates: [j.start_date, j.end_date].filter(Boolean).join(' – '),
    }));
    const lines = t.split('\n');
    const { start, end } = experienceBounds(lines);
    for (let i = start; i < end; i++) {
      if (!isRoleLine(lines[i], 'EXPERIENCE')) continue;
      const p = parseRoleLineParts(lines[i]);
      if (!p.company) continue;
      const hit = matchMasterExperienceRole(p, masterRoles);
      if (!hit) {
        if (p.location) {
          p.location = '';
          const next = formatRoleLineFromParts(p);
          if (next) lines[i] = next;
        }
        continue;
      }
      p.location = String(hit.location || '').trim();
      p.dates = String(hit.dates || '').trim();
      if (!p.title && hit.title) p.title = hit.title;
      const next = formatRoleLineFromParts(p);
      if (next) lines[i] = next;
    }
    t = lines.join('\n');
  }

  // Cert dates: drop trailing dates when the verified cert had no date.
  if ((rj.certifications || []).length) {
    const certMap = (rj.certifications || []).map(c => ({
      name: String(c.name || '').toLowerCase(),
      date: String(c.date || '').trim(),
    }));
    const rebuilt = [];
    let inCerts = false;
    for (const line of t.split('\n')) {
      if (isAnySectionHeader(line)) {
        inCerts = /^certif/i.test(normalizeHeader(line));
        rebuilt.push(line);
        continue;
      }
      if (!inCerts) {
        rebuilt.push(line);
        continue;
      }
      const raw = String(line || '').replace(/^[-•]\s*/, '').trim();
      if (!raw) {
        rebuilt.push(line);
        continue;
      }
      const m = raw.match(/[,|]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|(?:19|20)\d{2})\s*$/i);
      const name = (m ? raw.slice(0, m.index) : raw).replace(/[|,]\s*$/, '').trim();
      const key = name.toLowerCase();
      const hit = certMap.find(c => c.name && (key === c.name || key.includes(c.name) || c.name.includes(key)));
      if (hit && !hit.date && m) {
        rebuilt.push(String(line).replace(m[0], '').replace(/[|,]\s*$/, '').trim());
      } else {
        rebuilt.push(line);
      }
    }
    t = rebuilt.join('\n');
  }

  return t
    .replace(/\|\s*\|/g, '|')
    .replace(/^\s*\|\s*/gm, '')
    .replace(/\s*\|\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
3. roleFamily: one of data|ml|swe|support|network|devops|cloud|security|qa|automation|datacenter|ba|healthcare
4. jdPrimary: 10-16 MUST-HAVE technical skills/tools/frameworks explicitly stated or clearly required in THIS JD.
   Include stacks like Python, PyTorch, LangChain, LlamaIndex, RAG, embeddings, vector search, fine-tuning, LLM evaluation, MLOps, etc. when the JD mentions them.
5. jdSecondary: 4-10 secondary items FROM THE JD ONLY — domain (healthcare, biopharma), practices (responsible AI, observability, production ML), or nice-to-have tools mentioned in the posting.
6. atsKeywords: 12-20 exact ATS phrases from THIS JD — short phrases copied or closely mirrored (e.g. "retrieval pipelines", "prompt chaining", "inference orchestration").
7. eligibility: read the JD for hard gates. Copy exact JD wording when possible:
   - yearsNote: exact phrase about years of experience required (e.g. "5+ years of software engineering experience"), or null if not stated
   - usCitizenshipText: exact phrase about US citizenship / U.S. citizen requirement, or null if not stated
   - workAuthorizationText: exact phrase about work authorization, visa sponsorship, or right to work, or null if not stated
   Also set boolean flags in workAuthorization when clearly stated.

RULES:
- jdPrimary = hard technical skills only (languages, frameworks, platforms, ML/LLM techniques).
- jdSecondary = domain + supporting technical themes from the JD only.
- atsKeywords = verbatim or near-verbatim JD phrases useful for ATS matching.
- Do NOT include market/internet skills that are not in this JD — a separate AI step handles those.
- NO benefits, compensation, 401k, insurance, "how to apply", soft skills alone, or section headers.
- NO certifications or degrees.
- NO H1B, H-1B, visa, sponsorship, work authorization, citizenship, or other eligibility/immigration terms in jdPrimary, jdSecondary, or atsKeywords — those belong only in eligibility.
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
  "atsKeywords": ["..."],
  "eligibility": {
    "minYears": 5,
    "maxYears": null,
    "yearsNote": "5+ years of relevant experience",
    "usCitizenshipText": "Must be a U.S. citizen",
    "workAuthorizationText": "Must be authorized to work in the US without sponsorship",
    "education": "Bachelor's in CS or related field",
    "workAuthorization": {
      "usCitizenRequired": false,
      "usCitizenPreferred": false,
      "authorizedToWorkRequired": true,
      "noSponsorship": true,
      "sponsorshipAvailable": false,
      "clearanceRequired": false,
      "clearanceLevel": "",
      "notes": []
    },
    "location": {
      "onsiteRequired": false,
      "hybrid": true,
      "remoteOk": true,
      "locationNote": "Hybrid in Austin, TX"
    },
    "otherRequirements": ["Must pass background check"]
  }
}`;
}

/** Human-readable JD schema (see resume_test/jsonjd.txt). Built FIRST before skill locking / scoring. */
function buildJdJsonPrompt(jd) {
  return `You are a job-description analyst. Convert this posting into clear structured JSON that a recruiter can read.
Use ONLY facts in the JD. Do not invent skills, years, companies, or requirements.

JOB DESCRIPTION:
${String(jd || '').slice(0, 12000)}

Return JSON with exactly this shape:
{
  "job_information": {
    "title": "",
    "company": "",
    "location": "",
    "employment_type": "",
    "seniority_level": "junior|mid|senior|lead|staff|manager|unknown",
    "work_mode": "remote|hybrid|onsite|unknown"
  },
  "overview": "",
  "years_of_experience": {
    "minimum": null,
    "maximum": null,
    "note": ""
  },
  "must_have_skills": [],
  "nice_to_have_skills": [],
  "ats_phrases": [],
  "responsibilities": [],
  "requirements": {
    "education": "",
    "experience": "",
    "hard_gates": [],
    "work_authorization": "",
    "other": []
  },
  "domain_industry": [],
  "eligibility": {
    "us_citizen_required": false,
    "sponsorship_available": null,
    "clearance_required": false,
    "notes": []
  }
}

Rules:
- years_of_experience: copy the JD wording into note. If the JD gives a range such as "1-6 years", "1–6 years", or "1 to 6 years", minimum is the LOW number and maximum is the HIGH number. Never treat the high end as the minimum. "5+ years" / "at least 5 years" means minimum 5 and maximum null.
- must_have_skills = named tools/frameworks/platforms clearly required (Python, PyTorch, AWS, FastAPI). 8-14 items. Do NOT put duty phrases ("production-grade ML systems deployment", "model lifecycle management") or job titles ("Machine Learning Engineering") here — those belong in responsibilities.
- nice_to_have_skills = preferred / secondary tools from THIS JD only (not internet/market extras).
- ats_phrases = 8-14 short recruiter/ATS search phrases copied from THIS JD (e.g. "model lifecycle management", "real-time inference", "production ML deployment"). Not a duplicate of must_have_skills tools. Not full duty sentences.
- responsibilities = clean duty lines (one idea each).
- hard_gates = qualifications that can screen a candidate out: years, degree, work authorization, clearance, license, onsite/location, or explicit industry experience. Do NOT put preferred tools here.
- domain_industry = industries mentioned. Put an industry in hard_gates ONLY if the JD explicitly requires that industry experience (e.g. "healthcare experience required"). If the company happens to be in healthcare/finance but the role is a generic Data Engineer posting, leave domain as informational and do NOT treat it as a gate.
- No benefits fluff in skill lists. No invented tools.
- Empty string / [] / null when unknown.`;
}

function coerceJdYears(years) {
  const y = {
    minimum: Number.isFinite(Number(years?.minimum)) && Number(years.minimum) > 0 ? Number(years.minimum) : null,
    maximum: Number.isFinite(Number(years?.maximum)) && Number(years.maximum) > 0 ? Number(years.maximum) : null,
    note: String(years?.note || '').trim(),
  };
  const parsed = parseYearsRequirement(y.note)
    || parseYearsRequirement(formatYearsNeed(y.minimum, y.maximum));
  if (parsed) {
    if (parsed.min != null) y.minimum = parsed.min;
    y.maximum = parsed.max != null ? parsed.max : (parsed.min != null && y.maximum === parsed.min ? null : y.maximum);
    if (parsed.max == null && y.maximum != null && y.minimum != null && y.maximum < y.minimum) y.maximum = null;
    if (!y.note && parsed.raw) y.note = parsed.raw;
  }
  if (y.minimum != null && y.maximum != null && y.minimum > y.maximum) {
    const swap = y.minimum;
    y.minimum = y.maximum;
    y.maximum = swap;
  }
  return y;
}

function emptyJdJson() {
  return {
    job_information: {
      title: '',
      company: '',
      location: '',
      employment_type: '',
      seniority_level: 'unknown',
      work_mode: 'unknown',
    },
    overview: '',
    years_of_experience: { minimum: null, maximum: null, note: '' },
    must_have_skills: [],
    nice_to_have_skills: [],
    ats_phrases: [],
    responsibilities: [],
    requirements: {
      education: '',
      experience: '',
      hard_gates: [],
      work_authorization: '',
      other: [],
    },
    domain_industry: [],
    eligibility: {
      us_citizen_required: false,
      sponsorship_available: null,
      clearance_required: false,
      notes: [],
    },
  };
}

function normalizeJdJson(parsed) {
  const base = emptyJdJson();
  if (!parsed || typeof parsed !== 'object') return base;
  const ji = parsed.job_information || {};
  base.job_information = {
    title: String(ji.title || '').trim(),
    company: String(ji.company || '').trim(),
    location: String(ji.location || '').trim(),
    employment_type: String(ji.employment_type || '').trim(),
    seniority_level: String(ji.seniority_level || 'unknown').trim().toLowerCase() || 'unknown',
    work_mode: String(ji.work_mode || 'unknown').trim().toLowerCase() || 'unknown',
  };
  base.overview = String(parsed.overview || '').trim();
  const y = parsed.years_of_experience || {};
  base.years_of_experience = coerceJdYears({
    minimum: y.minimum == null || y.minimum === '' ? null : Number(y.minimum),
    maximum: y.maximum == null || y.maximum === '' ? null : Number(y.maximum),
    note: String(y.note || parsed.requirements?.experience || '').trim(),
  });
  const rawMust = dropEligibilityTerms(dropCertTerms(uniqTerms(parsed.must_have_skills || [])));
  const rawNice = dropEligibilityTerms(dropCertTerms(uniqTerms(parsed.nice_to_have_skills || [])));
  base.must_have_skills = scoredSkillTerms(rawMust);
  base.nice_to_have_skills = scoredSkillTerms(rawNice)
    .filter(s => !base.must_have_skills.some(m => m.toLowerCase() === String(s).toLowerCase()));
  base.ats_phrases = atsPhrasesFromJdJson({
    ...parsed,
    must_have_skills: rawMust,
    nice_to_have_skills: rawNice,
    ats_phrases: parsed.ats_phrases || parsed.atsPhrases || [],
  });
  base.responsibilities = (Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [])
    .map(r => String(r || '').trim()).filter(Boolean).slice(0, 16);
  const req = parsed.requirements || {};
  base.requirements = {
    education: String(req.education || '').trim(),
    experience: String(req.experience || '').trim(),
    hard_gates: (Array.isArray(req.hard_gates) ? req.hard_gates : []).map(x => String(x || '').trim()).filter(Boolean),
    work_authorization: String(req.work_authorization || '').trim(),
    other: (Array.isArray(req.other) ? req.other : []).map(x => String(x || '').trim()).filter(Boolean),
  };
  base.domain_industry = uniqTerms(parsed.domain_industry || []).map(s => String(s).trim()).filter(Boolean);
  const el = parsed.eligibility || {};
  base.eligibility = {
    us_citizen_required: !!el.us_citizen_required,
    sponsorship_available: el.sponsorship_available == null ? null : !!el.sponsorship_available,
    clearance_required: !!el.clearance_required,
    notes: (Array.isArray(el.notes) ? el.notes : []).map(n => String(n || '').trim()).filter(Boolean),
  };
  return base;
}

/** Heuristic JD → JSON when Gemini is unavailable. */
function parseJdToJsonLocal(jd) {
  const text = String(jd || '');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = emptyJdJson();
  const titleLine = lines.find(l => /^(job\s*title|title|role)\s*[:\-]/i.test(l))
    || lines.find(l => /\b(engineer|analyst|developer|architect|scientist|manager)\b/i.test(l));
  if (titleLine) {
    out.job_information.title = titleLine.replace(/^(job\s*title|title|role)\s*[:\-]\s*/i, '').trim();
  }
  const loc = lines.find(l => /^location\s*[:\-]/i.test(l));
  if (loc) out.job_information.location = loc.replace(/^location\s*[:\-]\s*/i, '').trim();
  if (/\bremote\b/i.test(text)) out.job_information.work_mode = 'remote';
  else if (/\bhybrid\b/i.test(text)) out.job_information.work_mode = 'hybrid';
  else if (/\bonsite|on-site\b/i.test(text)) out.job_information.work_mode = 'onsite';
  if (/\b(senior|sr\.?)\b/i.test(text)) out.job_information.seniority_level = 'senior';
  else if (/\b(lead|staff|principal)\b/i.test(text)) out.job_information.seniority_level = 'lead';
  else if (/\b(junior|jr\.?|entry)\b/i.test(text)) out.job_information.seniority_level = 'junior';
  else out.job_information.seniority_level = 'mid';

  const parsedYears = parseYearsRequirement(text);
  if (parsedYears) {
    out.years_of_experience = coerceJdYears({
      minimum: parsedYears.min,
      maximum: parsedYears.max,
      note: parsedYears.raw || '',
    });
    out.requirements.experience = out.years_of_experience.note || parsedYears.raw || '';
  }

  const bulletLines = lines.filter(l => /^[-•*]/.test(l) || /^\d+[.)]\s/.test(l))
    .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean);
  out.responsibilities = bulletLines.slice(0, 10);

  // Pull known tech tokens from JD text via RAG if available
  try {
    if (window.RAGEngine && typeof RAGEngine.buildJdOnlySkillSet === 'function') {
      const rag = RAGEngine.buildJdOnlySkillSet(text);
      out.must_have_skills = dropCertTerms(rag.jdPrimary || rag.primary || []).slice(0, 14);
      out.nice_to_have_skills = dropCertTerms(rag.jdSecondary || rag.secondary || []).slice(0, 10);
      if (rag.role?.title) out.job_information.title = out.job_information.title || rag.role.title;
    }
  } catch { /* ignore */ }

  const about = lines.findIndex(l => /about the role|overview|summary|description/i.test(l));
  if (about >= 0 && lines[about + 1]) {
    out.overview = lines.slice(about + 1, about + 3).join(' ').slice(0, 400);
  }
  return normalizeJdJson(out);
}

async function parseJdToJson(jd) {
  const text = String(jd || '');
  try {
    const raw = await callGemini(buildJdJsonPrompt(text), { json: true, maxTokens: 3500 });
    const parsed = normalizeJdJson(parseJsonLoose(raw));
    const hasSignal = parsed.job_information.title
      || parsed.must_have_skills.length
      || parsed.responsibilities.length;
    if (hasSignal) return parsed;
  } catch (err) {
    console.warn('JD JSON parse (Gemini) failed:', err);
  }
  return parseJdToJsonLocal(text);
}

/** Map readable JD JSON → internal analysis fields used by skill locking. */
function jdJsonToAnalysis(jdJson, ragHints) {
  const j = jdJson || emptyJdJson();
  const title = j.job_information?.title || ragHints?.role?.title || '';
  const family = ragHints?.role?.family || 'data';
  const minY = j.years_of_experience?.minimum;
  return {
    roleTitle: title,
    roleLabel: title,
    roleFamily: family,
    jdPrimary: filterExtractedSkills(j.must_have_skills || []),
    jdSecondary: filterExtractedSkills([
      ...(j.nice_to_have_skills || []),
    ]),
    atsKeywords: atsPhrasesFromJdJson(j),
    eligibility: {
      minYears: minY,
      maxYears: j.years_of_experience?.maximum ?? null,
      yearsNote: j.years_of_experience?.note || j.requirements?.experience || null,
      usCitizenshipText: j.eligibility?.us_citizen_required ? 'US citizenship required' : null,
      workAuthorizationText: j.requirements?.work_authorization || null,
      education: j.requirements?.education || null,
      workAuthorization: {
        usCitizenRequired: !!j.eligibility?.us_citizen_required,
        usCitizenPreferred: false,
        authorizedToWorkRequired: !!j.requirements?.work_authorization,
        noSponsorship: j.eligibility?.sponsorship_available === false,
        sponsorshipAvailable: j.eligibility?.sponsorship_available === true,
        clearanceRequired: !!j.eligibility?.clearance_required,
        clearanceLevel: '',
        notes: j.eligibility?.notes || [],
      },
      location: {
        onsiteRequired: j.job_information?.work_mode === 'onsite',
        hybrid: j.job_information?.work_mode === 'hybrid',
        remoteOk: j.job_information?.work_mode === 'remote' || j.job_information?.work_mode === 'hybrid',
        locationNote: j.job_information?.location || '',
      },
      otherRequirements: [
        ...(j.requirements?.hard_gates || []),
        ...(j.requirements?.other || []),
      ],
    },
    _jdJson: j,
  };
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

function parseJdEligibility(parsed) {
  const e = (parsed && parsed.eligibility) || {};
  const wa = e.workAuthorization || {};
  const loc = e.location || {};
  const minYears = Number(e.minYears);
  const maxYears = Number(e.maxYears);
  return {
    minYears: Number.isFinite(minYears) && minYears > 0 ? minYears : null,
    maxYears: Number.isFinite(maxYears) && maxYears > 0 ? maxYears : null,
    yearsNote: String(e.yearsNote || '').trim(),
    usCitizenshipText: String(e.usCitizenshipText || '').trim(),
    workAuthorizationText: String(e.workAuthorizationText || '').trim(),
    education: String(e.education || '').trim(),
    workAuthorization: {
      usCitizenRequired: !!wa.usCitizenRequired,
      usCitizenPreferred: !!wa.usCitizenPreferred,
      authorizedToWorkRequired: !!wa.authorizedToWorkRequired,
      noSponsorship: !!wa.noSponsorship,
      sponsorshipAvailable: !!wa.sponsorshipAvailable,
      h1bMentioned: !!wa.h1bMentioned,
      h1bRequired: !!wa.h1bRequired,
      optMentioned: !!wa.optMentioned,
      clearanceRequired: !!wa.clearanceRequired,
      clearanceLevel: String(wa.clearanceLevel || '').trim(),
      notes: Array.isArray(wa.notes) ? wa.notes.map(String).filter(Boolean) : [],
    },
    location: {
      onsiteRequired: !!loc.onsiteRequired,
      hybrid: !!loc.hybrid,
      remoteOk: !!loc.remoteOk,
      locationNote: String(loc.locationNote || '').trim(),
    },
    otherRequirements: Array.isArray(e.otherRequirements) ? e.otherRequirements.map(String).filter(Boolean) : [],
  };
}

function extractJdLineSnippet(jd, patterns, maxLen = 180) {
  const lines = String(jd || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    for (const re of patterns) {
      if (re.test(line)) return line.slice(0, maxLen);
    }
  }
  for (const re of patterns) {
    const m = String(jd || '').match(re);
    if (m) return m[0].trim().slice(0, maxLen);
  }
  return '';
}

function extractLocalEligibilityFromJd(jd) {
  const t = String(jd || '');
  const parsedYears = parseYearsRequirement(t);
  let minYears = parsedYears?.min ?? null;
  let maxYears = parsedYears?.max ?? null;
  const wa = {
    usCitizenRequired: /\b(us citizen only|us citizen|u\.s\. citizen|united states citizen|must be a (?:u\.s\. )?citizen|citizenship required)\b/i.test(t)
      && !/\b(citizenship|citizen).{0,30}(not required|no requirement)/i.test(t),
    usCitizenPreferred: /\b(us citizen|u\.s\. citizen).{0,20}preferred\b/i.test(t),
    authorizedToWorkRequired: /\b(authorized to work|legally authorized|eligible to work|work authorization|right to work|must be authorized)\b/i.test(t),
    noSponsorship: /\b(no sponsorship|not provide sponsorship|will not sponsor|unable to sponsor|without sponsorship|not eligible for sponsorship|cannot sponsor|does not sponsor)\b/i.test(t),
    h1bMentioned: /\b(h-?1b|h1b)\b/i.test(t),
    h1bRequired: /\b(h-?1b|h1b).{0,35}(required|must have|must hold|mandatory|only)\b/i.test(t)
      || /\b(require|required|must|need).{0,35}(h-?1b|h1b)\b/i.test(t)
      || /\b(valid|active|current)\s+(h-?1b|h1b)\b/i.test(t),
    optMentioned: /\b(opt|cpt|stem\s*opt|optional practical training|curricular practical training|f-1|f1 status|f-1 status|ead|tn visa|l-1|o-1)\b/i.test(t),
    sponsorshipAvailable: /\b(sponsorship available|will sponsor|visa sponsorship)\b/i.test(t)
      && !/\b(no sponsorship|not provide|will not sponsor|unable to sponsor|no\s+h-?1b)\b/i.test(t),
    clearanceRequired: /\b(security clearance|secret clearance|top secret|ts\/sci|public trust|active clearance)\b/i.test(t),
    clearanceLevel: '',
    notes: [],
  };
  const clearance = t.match(/\b(top secret\/sci|ts\/sci|top secret|secret clearance|public trust)\b/i);
  if (clearance) wa.clearanceLevel = clearance[0];
  if (wa.usCitizenRequired) wa.notes.push('US citizenship required');
  else if (wa.usCitizenPreferred) wa.notes.push('US citizenship preferred');
  if (wa.noSponsorship) wa.notes.push('No visa sponsorship');
  else if (wa.sponsorshipAvailable) wa.notes.push('Visa sponsorship may be available');
  if (wa.authorizedToWorkRequired && !wa.usCitizenRequired) wa.notes.push('Must be authorized to work in the US');
  const location = {
    onsiteRequired: /\b(on[- ]site|in[- ]office|in person|must (?:be )?relocate)\b/i.test(t) && !/\b(remote|work from home)\b/i.test(t.slice(0, 200)),
    hybrid: /\bhybrid\b/i.test(t),
    remoteOk: /\b(remote|work from home|fully remote|telecommute)\b/i.test(t),
    locationNote: '',
  };
  const locMatch = t.match(/(?:location|based in|office in)[:\s]+([^\n.]{4,80})/i);
  if (locMatch) location.locationNote = locMatch[1].trim();
  let education = '';
  const eduMatch = t.match(/(?:bachelor|master|phd|b\.s\.|m\.s\.|degree).{0,80}/i);
  if (eduMatch) education = eduMatch[0].trim().slice(0, 120);

  const yearsNote = minYears
    ? extractJdLineSnippet(t, [
      /\d+(?:\.\d+)?\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?\s*\+?\s*years?.{0,80}experience/i,
      /\d+(?:\.\d+)?\s*\+?\s*years?.{0,80}experience/i,
      /minimum\s+(?:of\s+)?\d+(?:\.\d+)?\s*year/i,
      /at least\s+\d+(?:\.\d+)?\s*year/i,
      /\d+(?:\.\d+)?\s*year\(?s?\)?\s*of\s*experience/i,
    ]) || `${minYears}${maxYears ? `–${maxYears}` : '+'} years of experience`
    : extractJdLineSnippet(t, [
      /\d+(?:\.\d+)?\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?\s*\+?\s*years?.{0,80}experience/i,
      /\d+(?:\.\d+)?\s*\+?\s*years?.{0,80}experience/i,
      /minimum\s+(?:of\s+)?\d+(?:\.\d+)?\s*year/i,
      /\d+(?:\.\d+)?\s*year\(?s?\)?\s*of\s*experience/i,
    ]);

  const usCitizenshipText = wa.usCitizenRequired
    ? extractJdLineSnippet(t, [/u\.?s\.?\s*citizen/i, /united states citizen/i, /citizenship required/i]) || 'US citizenship required'
    : wa.usCitizenPreferred
      ? extractJdLineSnippet(t, [/u\.?s\.?\s*citizen.{0,30}preferred/i]) || 'US citizenship preferred'
      : '';

  const workAuthorizationText = extractJdLineSnippet(t, [
    /authorized to work/i,
    /work authorization/i,
    /eligible to work/i,
    /right to work/i,
    /no sponsorship/i,
    /not provide sponsorship/i,
    /will not sponsor/i,
    /visa sponsorship/i,
    /h-1b/i,
    /without sponsorship/i,
    /\bopt\b/i,
    /\bcpt\b/i,
    /stem opt/i,
    /f-1/i,
  ]) || (wa.noSponsorship ? 'No visa sponsorship' : '')
    || (wa.h1bRequired ? 'H-1B required' : '')
    || (wa.optMentioned ? extractJdLineSnippet(t, [/\bopt\b/i, /\bcpt\b/i, /stem opt/i, /f-1/i]) || 'OPT/CPT eligible' : '')
    || (wa.authorizedToWorkRequired ? 'Must be authorized to work in the US' : '')
    || (wa.sponsorshipAvailable ? 'Visa sponsorship available' : '');

  return {
    minYears,
    maxYears,
    yearsNote,
    usCitizenshipText,
    workAuthorizationText,
    education,
    workAuthorization: wa,
    location,
    otherRequirements: [],
    source: 'local',
  };
}

function mergeEligibility(aiElig, localElig) {
  const ai = aiElig || {};
  const local = localElig || {};
  const wa = { ...(local.workAuthorization || {}), ...(ai.workAuthorization || {}) };
  const loc = { ...(local.location || {}), ...(ai.location || {}) };
  const yearTexts = [
    ai.yearsNote,
    local.yearsNote,
    formatYearsNeed(ai.minYears, ai.maxYears),
    formatYearsNeed(local.minYears, local.maxYears),
  ].filter(Boolean);
  const parsedList = yearTexts.map(parseYearsRequirement).filter(Boolean);
  const parsedYears = parsedList.find(p => p.max != null) || parsedList[0] || null;
  const yearsNote = [ai.yearsNote, local.yearsNote].find(n => parseYearsRequirement(n)?.max != null)
    || ai.yearsNote || local.yearsNote || '';
  return {
    minYears: parsedYears?.min ?? ai.minYears ?? local.minYears ?? null,
    maxYears: parsedYears?.max ?? ai.maxYears ?? local.maxYears ?? null,
    yearsNote,
    usCitizenshipText: ai.usCitizenshipText || local.usCitizenshipText || '',
    workAuthorizationText: ai.workAuthorizationText || local.workAuthorizationText || '',
    education: ai.education || local.education || '',
    workAuthorization: {
      usCitizenRequired: !!(ai.workAuthorization?.usCitizenRequired || local.workAuthorization?.usCitizenRequired),
      usCitizenPreferred: !!(ai.workAuthorization?.usCitizenPreferred || local.workAuthorization?.usCitizenPreferred),
      authorizedToWorkRequired: !!(ai.workAuthorization?.authorizedToWorkRequired || local.workAuthorization?.authorizedToWorkRequired),
      noSponsorship: !!(ai.workAuthorization?.noSponsorship || local.workAuthorization?.noSponsorship),
      sponsorshipAvailable: !!(ai.workAuthorization?.sponsorshipAvailable || local.workAuthorization?.sponsorshipAvailable),
      h1bMentioned: !!(ai.workAuthorization?.h1bMentioned || local.workAuthorization?.h1bMentioned),
      h1bRequired: !!(ai.workAuthorization?.h1bRequired || local.workAuthorization?.h1bRequired),
      optMentioned: !!(ai.workAuthorization?.optMentioned || local.workAuthorization?.optMentioned),
      clearanceRequired: !!(ai.workAuthorization?.clearanceRequired || local.workAuthorization?.clearanceRequired),
      clearanceLevel: ai.workAuthorization?.clearanceLevel || local.workAuthorization?.clearanceLevel || '',
      notes: uniqTerms([...(ai.workAuthorization?.notes || []), ...(local.workAuthorization?.notes || [])]),
    },
    location: {
      onsiteRequired: !!(ai.location?.onsiteRequired || local.location?.onsiteRequired),
      hybrid: !!(ai.location?.hybrid || local.location?.hybrid),
      remoteOk: !!(ai.location?.remoteOk || local.location?.remoteOk),
      locationNote: ai.location?.locationNote || local.location?.locationNote || '',
    },
    otherRequirements: uniqTerms([...(ai.otherRequirements || []), ...(local.otherRequirements || [])]),
  };
}

const MONTH_INDEX = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function monthIndexFromName(name) {
  const k = String(name || '').toLowerCase().replace(/\./g, '').trim();
  if (MONTH_INDEX[k] != null) return MONTH_INDEX[k];
  const short = k.slice(0, 3);
  return MONTH_INDEX[short] != null ? MONTH_INDEX[short] : null;
}

function nowYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), present: true };
}

/** Parse a resume date like February 2025, Feb 2025, 2025, Present. */
function parseResumeDate(raw, { asEnd = false } = {}) {
  const t = String(raw || '').replace(/[–—]/g, '-').trim();
  if (!t) return null;
  if (/^(present|current|now|today|ongoing)$/i.test(t)) return nowYearMonth();
  const md = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*[-./]?\s*(\d{4})\b/i);
  if (md) {
    const month = monthIndexFromName(md[1]);
    const year = Number(md[2]);
    if (month == null || !Number.isFinite(year)) return null;
    return { year, month, present: false };
  }
  const iso = t.match(/\b((?:19|20)\d{2})[-/](\d{1,2})\b/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Math.max(0, Math.min(11, Number(iso[2]) - 1));
    return { year, month, present: false };
  }
  const y = t.match(/\b((?:19|20)\d{2})\b/);
  if (y) {
    const year = Number(y[1]);
    return { year, month: asEnd ? 11 : 0, present: false };
  }
  return null;
}

function dateToMonths(d) {
  return d.year * 12 + d.month;
}

function parseExperienceDateRange(startRaw, endRaw) {
  const start = parseResumeDate(startRaw, { asEnd: false });
  if (!start) return null;
  const end = parseResumeDate(endRaw, { asEnd: true }) || nowYearMonth();
  const a = dateToMonths(start);
  const b = dateToMonths(end);
  if (b < a) return null;
  return { start: a, end: b };
}

function mergeMonthRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const last = merged[merged.length - 1];
    if (r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

function monthsToYears(totalMonths) {
  return Math.round((totalMonths / 12) * 10) / 10;
}

const EXP_ROLE_DATE_RE = /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*[-./]?\s*)?((?:19|20)\d{2})\s*[-–—\/to]+\s*((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*[-./]?\s*)?((?:19|20)\d{2}|present|current|now|today|ongoing)\b/i;

function rangesFromExperienceJobs(jobs) {
  const ranges = [];
  for (const job of jobs || []) {
    const r = parseExperienceDateRange(job.start_date, job.end_date);
    if (r) ranges.push(r);
  }
  return ranges;
}

function rangesFromExperienceSection(resumeText) {
  const roles = extractRolesFromResume(resumeText || '');
  const ranges = [];
  for (const role of roles) {
    if (/\b(university|college|bachelor|master|b\.?s\.?|m\.?s\.?|ph\.?d|polytechnic)\b/i.test(role)) continue;
    const m = String(role).match(EXP_ROLE_DATE_RE);
    if (!m) continue;
    const startRaw = `${m[1] || ''} ${m[2]}`.trim();
    const endRaw = /present|current|now|today|ongoing/i.test(m[4]) ? 'Present' : `${m[3] || ''} ${m[4]}`.trim();
    const r = parseExperienceDateRange(startRaw, endRaw);
    if (r) ranges.push(r);
  }
  return ranges;
}

function estimateResumeExperienceYears(resumeText, resumeJson) {
  const master = String(
    (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value)
    || resumeText
    || ''
  );
  let ranges = rangesFromExperienceSection(master);
  if (!ranges.length && typeof extractExperienceRoleRecords === 'function') {
    for (const rec of extractExperienceRoleRecords(master)) {
      const m = String(rec.dates || '').match(EXP_ROLE_DATE_RE);
      if (!m) continue;
      const startRaw = `${m[1] || ''} ${m[2]}`.trim();
      const endRaw = /present|current|now|today|ongoing/i.test(m[4]) ? 'Present' : `${m[3] || ''} ${m[4]}`.trim();
      const r = parseExperienceDateRange(startRaw, endRaw);
      if (r) ranges.push(r);
    }
  }
  if (!ranges.length) ranges = rangesFromExperienceJobs(resumeJson?.professional_experience);
  if (!ranges.length) {
    return { years: null, roleCount: (resumeJson?.professional_experience || []).length, note: 'Could not parse experience dates from the EXPERIENCE section' };
  }
  const merged = mergeMonthRanges(ranges);
  const totalMonths = merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  return {
    years: monthsToYears(totalMonths),
    roleCount: ranges.length,
    note: '',
  };
}

function formatTenureForSummary(years) {
  if (years == null || !Number.isFinite(Number(years))) return '';
  const n = Number(years);
  if (n < 0.05) return '';
  if (n < 1) return '1 year';
  const whole = Math.floor(n);
  const hasMonths = (n - whole) >= 0.05;
  if (hasMonths) return `${whole}+ years`;
  return `${whole} years`;
}

const YEARS_CLAIM_RE = /\b\d+(?:\.\d+)?\s*\+?\s*years?\b/i;

function collapseDuplicateTenure(s) {
  let out = String(s || '');
  out = out.replace(/\b(\d+\+?\s*years(?:\s+of(?:\s+(?:professional|relevant|related))?\s+experience)?)\s+\1\b/gi, '$1');
  out = out.replace(/\bwith\s+(\d+\+?\s*years(?:\s+of experience)?)\s+\1\b/gi, 'with $1');
  return out.replace(/\s{2,}/g, ' ').trim();
}

function formatLockedTenureBlock(resumeText, resumeJson) {
  const master = ($('resumeInput') && $('resumeInput').value) || resumeText || '';
  const tenure = estimateResumeExperienceYears(
    master,
    resumeJson || frozenMasterResumeJson(),
  );
  const label = tenure.years != null ? formatTenureForSummary(tenure.years) : '';
  if (!label) {
    return `LOCKED SUMMARY YEARS: could not parse job dates. Do not copy a JD years range into SUMMARY (not "2-5 years", "3-4 years", "2-5+ years").`;
  }
  const role = masterExperienceRoleTitle(master) || 'the most recent EXPERIENCE job title';
  return `LOCKED SUMMARY YEARS — calculated from EXPERIENCE job dates only (month+year, gaps not counted, education ignored):
  ${label} (exact ${tenure.years} years across ${tenure.roleCount} role(s)).
  If leftover months exist, write the whole years with a plus (7.2 → "7+ years"). Never write a decimal like "7.2 years".
  Weave this exact tenure after the job title: "${role} with ${label} of experience…".
  Do NOT start SUMMARY with a number (never "${label} of experience…" as the first words).
  NEVER write a range: not "2-5 years", "3-4 years", "2-5+ years", "1 to 6 years".
  NEVER copy the JD years requirement into SUMMARY. NEVER use a different number from the master summary. Do not use college dates.`;
}

function rewriteSummaryTenureLine(line, label) {
  let s = String(line || '');
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?\s*\+?\s*years?\b/gi, label);
  s = s.replace(/\b\d+(?:\.\d+)?\s*\+\s*years?\b/gi, label);
  s = s.replace(/\b\d+(?:\.\d+)?\s*\+?\s*years?\s+of(?:\s+(?:professional|relevant|related))?\s+experience\b/gi, `${label} of experience`);
  s = s.replace(/\bwith\s+\d+(?:\.\d+)?\s*\+?\s*years?\b/gi, `with ${label}`);
  s = s.replace(/\b(?:over|about|around|approximately)\s+\d+(?:\.\d+)?\s*\+?\s*years?\b/gi, label);
  return collapseDuplicateTenure(s);
}

function summaryLeadRoleTitle() {
  const master = (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value) || '';
  return masterExperienceRoleTitle(master) || '';
}

function fixSummaryLeadingNumber(line, label) {
  const s = String(line || '').trim();
  if (!/^\d/.test(s)) return s;
  const role = summaryLeadRoleTitle();
  const stripped = s
    .replace(/^(?:(?:An?|With)\s+)?\d[\d.+–—to\s-]*years?(?:\s+of(?:\s+(?:professional|relevant|related))?\s+experience)?(?:\s+as(?:\s+an?)?)?\s*[–—,-]*\s*/i, '')
    .replace(/^(?:who|that)\s+/i, '')
    .trim();
  if (!stripped) {
    return role ? `${role} with ${label} of experience.` : s;
  }
  const roleRe = role ? new RegExp('^' + role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : null;
  if (role && roleRe.test(stripped)) {
    if (/\b\d+(?:\.\d+)?\s*\+?\s*years?\b/i.test(stripped)) return stripped;
    return stripped.replace(new RegExp('^(' + role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\s*', 'i'), `$1 with ${label} of experience `);
  }
  if (role) {
    if (/\b\d+(?:\.\d+)?\s*\+?\s*years?\b/i.test(stripped)) return `${role} ${stripped}`.replace(/\s{2,}/g, ' ').trim();
    return `${role} with ${label} of experience ${stripped}`.replace(/\s{2,}/g, ' ').trim();
  }
  return `Professional with ${label} of experience ${stripped}`.replace(/\s{2,}/g, ' ').trim();
}

function injectSummaryTenure(line, label) {
  const t = String(line || '').trim();
  if (YEARS_CLAIM_RE.test(t)) return t;
  if (/\bwith\s+experience\b/i.test(t)) {
    return t.replace(/\bwith\s+experience\b/i, `with ${label} of experience`);
  }
  const withHit = t.match(/^(.{6,90}?)(\s+with\s+)/);
  if (withHit) {
    const after = t.slice(withHit.index + withHit[0].length);
    if (YEARS_CLAIM_RE.test(after)) return t;
    return t.replace(withHit[2], ` with ${label} of experience `).replace(/\s{2,}/g, ' ');
  }
  return t.replace(/^((?:An?\s+)?[A-Za-z][A-Za-z0-9 /+&-]{2,55})(\s+)/, `$1 with ${label} of experience `);
}

function restoreSummaryTenure(text, master) {
  const tenure = estimateResumeExperienceYears(
    master || text,
    frozenMasterResumeJson(),
  );
  if (tenure.years == null || !Number.isFinite(tenure.years)) return text;
  const label = formatTenureForSummary(tenure.years);
  if (!label) return text;
  const lines = String(text || '').split('\n');
  const bounds = summaryBounds(lines);
  if (!bounds) return text;
  let sawYears = false;
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    if (!lines[i].trim() || isSectionHeader(lines[i]) || isBulletLine(lines[i])) continue;
    lines[i] = rewriteSummaryTenureLine(lines[i], label);
    if (YEARS_CLAIM_RE.test(lines[i])) sawYears = true;
  }
  if (!sawYears) {
    for (let i = bounds.start + 1; i < bounds.end; i++) {
      if (!lines[i].trim() || isSectionHeader(lines[i]) || isBulletLine(lines[i])) continue;
      lines[i] = injectSummaryTenure(lines[i], label);
      break;
    }
  }
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    if (!lines[i].trim() || isSectionHeader(lines[i]) || isBulletLine(lines[i])) continue;
    lines[i] = collapseDuplicateTenure(fixSummaryLeadingNumber(lines[i], label));
    break;
  }
  return lines.join('\n');
}

function parseYearNumber(s) {
  const n = Number(String(s || '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse JD years as { min, max }. "1–6 years" → min 1 max 6. "5+ years" → min 5 max null. */
function parseYearsRequirement(text) {
  const t = String(text || '').replace(/[–—]/g, '-').trim();
  if (!t) return null;
  const n = '(\\d+(?:\\.\\d+)?)';
  const range = t.match(new RegExp(`${n}\\s*(?:-|to)\\s*${n}\\s*\\+?\\s*years?`, 'i'));
  if (range) {
    let min = parseYearNumber(range[1]);
    let max = parseYearNumber(range[2]);
    if (min != null && max != null && min > max) [min, max] = [max, min];
    return { min, max, raw: range[0] };
  }
  const minOf = t.match(new RegExp(`(?:minimum\\s+(?:of\\s+)?|at\\s+least\\s+)${n}\\s*year`, 'i'));
  if (minOf) return { min: parseYearNumber(minOf[1]), max: null, raw: minOf[0] };
  const plus = t.match(new RegExp(`${n}\\s*\\+\\s*years?`, 'i'));
  if (plus) return { min: parseYearNumber(plus[1]), max: null, raw: plus[0] };
  const simple = t.match(new RegExp(`${n}\\s*years?(?:\\s+of)?(?:\\s+(?:relevant|professional|related))?\\s*(?:of\\s+)?experience`, 'i'));
  if (simple) return { min: parseYearNumber(simple[1]), max: null, raw: simple[0] };
  const yearExp = t.match(new RegExp(`${n}\\s*year\\(?s?\\)?\\s*(?:of\\s+)?experience`, 'i'));
  if (yearExp) return { min: parseYearNumber(yearExp[1]), max: null, raw: yearExp[0] };
  const required = t.match(new RegExp(`${n}\\s*years?\\s*(?:is\\s+)?required`, 'i'));
  if (required) return { min: parseYearNumber(required[1]), max: null, raw: required[0] };
  return null;
}

function parseRequiredYearsFromText(text) {
  return parseYearsRequirement(text)?.min ?? null;
}

function getJdYearsRequirement(eligibility, yearsJdText) {
  const note = eligibility?.yearsNote || yearsJdText || '';
  const parsed = parseYearsRequirement(note);
  const minRaw = Number(eligibility?.minYears);
  const maxRaw = Number(eligibility?.maxYears);
  const min = parsed?.min ?? (Number.isFinite(minRaw) && minRaw > 0 ? minRaw : null);
  const max = parsed?.max ?? (Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : null);
  if (min == null && max == null) return null;
  return { min, max };
}

function getJdRequiredYears(eligibility, yearsJdText) {
  return getJdYearsRequirement(eligibility, yearsJdText)?.min ?? null;
}

function yearsRequirementSatisfied(req, candidateYears) {
  if (!req || (req.min == null && req.max == null)) return true;
  if (candidateYears == null || !Number.isFinite(Number(candidateYears))) return false;
  const years = Number(candidateYears);
  if (req.min != null && years < Number(req.min) - 1) return false;
  if (req.max != null && years > Number(req.max) + 0.51) return false;
  return true;
}

function resumeYearsForAlignment(rj, resumeText) {
  const est = estimateResumeExperienceYears(resumeText || '', rj);
  return est.years;
}

function getExperienceGap(requiredYears, candidateYears) {
  return Math.round((candidateYears - requiredYears) * 100) / 100;
}

function buildExperienceEligibility(required, candidateYears) {
  const req = required && typeof required === 'object'
    ? required
    : (required != null ? { min: required, max: null } : null);
  const min = req?.min ?? null;
  const max = req?.max ?? null;
  const need = formatYearsNeed(min, max);
  if (min == null && max == null) {
    return {
      status: 'neutral',
      tag: '',
      sub: candidateYears != null ? `Your resume: ~${candidateYears} years` : '',
    };
  }
  if (candidateYears == null) {
    return {
      status: 'neutral',
      tag: '',
      sub: `JD asks for ${need || 'experience'} · could not parse dates on your resume`,
    };
  }
  if (yearsRequirementSatisfied(req, candidateYears)) {
    const underMin = min != null && candidateYears < min;
    return {
      status: 'pass',
      tag: underMin ? 'Within 1 year' : 'Eligible',
      sub: max != null
        ? `Your resume ~${candidateYears} years is inside the JD range (${need})`
        : `Your resume ~${candidateYears} years meets ${need}`,
    };
  }
  if (min != null && candidateYears < min) {
    return {
      status: 'fail',
      tag: 'Not eligible',
      sub: `Your resume ~${candidateYears} years · JD requires ${need}`,
    };
  }
  if (max != null && candidateYears > max) {
    return {
      status: 'fail',
      tag: 'Above the range',
      sub: `Your resume ~${candidateYears} years · JD range is ${need}`,
    };
  }
  return {
    status: 'fail',
    tag: 'Not eligible',
    sub: `Your resume ~${candidateYears} years · JD requires ${need}`,
  };
}

function detectH1bRequiredInText(text, wa) {
  const t = String(text || '');
  if (wa?.h1bRequired) return true;
  return /\b(h-?1b|h1b).{0,35}(required|must have|must hold|mandatory|only)\b/i.test(t)
    || /\b(require|required|must|need).{0,35}(h-?1b|h1b)\b/i.test(t)
    || /\b(valid|active|current)\s+(h-?1b|h1b)\b/i.test(t);
}

function detectOptInText(text, wa) {
  const t = String(text || '');
  if (wa?.optMentioned) return true;
  return /\b(opt|cpt|stem\s*opt|optional practical training|curricular practical training|f-1|f1 status|ead|tn visa|l-1|o-1)\b/i.test(t);
}

function buildWorkAuthEligibility(workAuthJd, wa) {
  const NOT_FOUND = 'Not found';
  const text = String(workAuthJd || '');
  const h1bRequired = detectH1bRequiredInText(text, wa);
  const optFriendly = detectOptInText(text, wa);
  const stated = workAuthJd !== NOT_FOUND
    || wa.noSponsorship
    || wa.h1bMentioned
    || wa.h1bRequired
    || wa.optMentioned
    || wa.authorizedToWorkRequired
    || wa.sponsorshipAvailable
    || wa.clearanceRequired;

  if (!stated) {
    return { status: 'pass', tag: '', sub: 'No work authorization requirement stated in posting' };
  }

  if (wa.clearanceRequired) {
    return {
      status: 'fail',
      tag: 'Clearance required',
      sub: wa.clearanceLevel
        ? `Security clearance required (${wa.clearanceLevel}) — confirm eligibility`
        : 'Security clearance required — confirm eligibility',
    };
  }

  if (h1bRequired) {
    return {
      status: 'fail',
      tag: 'H-1B required',
      sub: 'H-1B is required or not sponsored — verify you meet this before applying',
    };
  }

  if (optFriendly) {
    return {
      status: 'pass',
      tag: 'OPT / CPT',
      sub: 'OPT, CPT, or other visa status mentioned — likely eligible to apply',
    };
  }

  if (wa.sponsorshipAvailable) {
    return { status: 'pass', tag: 'Sponsorship', sub: 'Visa sponsorship may be available per this posting' };
  }

  const noSponsor = wa.noSponsorship
    || /\b(no sponsorship|will not sponsor|without sponsorship|not provide sponsorship|unable to sponsor|does not sponsor|not eligible for sponsorship)\b/i.test(text);

  if (noSponsor) {
    return {
      status: 'pass',
      tag: 'No sponsorship',
      sub: 'Must already have US work authorization',
    };
  }

  if (wa.authorizedToWorkRequired || workAuthJd !== NOT_FOUND) {
    return {
      status: 'pass',
      tag: 'Eligible',
      sub: 'Must already have US work authorization',
    };
  }

  return { status: 'pass', tag: '', sub: 'No H-1B requirement stated in posting' };
}

function buildCitizenshipEligibility(citizenshipJd, wa) {
  const NOT_FOUND = 'Not found';
  const stated = citizenshipJd !== NOT_FOUND || wa.usCitizenRequired || wa.usCitizenPreferred;
  if (!stated) {
    return { status: 'pass', sub: 'No US citizenship requirement in this posting' };
  }
  return {
    status: 'fail',
    sub: wa.usCitizenRequired
      ? 'US citizenship required — verify you meet this before applying'
      : 'US citizenship mentioned in posting — check if this applies to you',
  };
}

function buildEligibilityReport(eligibility, resumeText) {
  const NOT_FOUND = 'Not found';
  const wa = eligibility?.workAuthorization || {};
  const exp = estimateResumeExperienceYears(resumeText, frozenMasterResumeJson());

  let yearsJd = (eligibility?.yearsNote || '').trim();
  let yearsReq = getJdYearsRequirement(eligibility);
  if (!yearsJd && yearsReq) {
    const need = formatYearsNeed(yearsReq.min, yearsReq.max);
    yearsJd = need ? `${need} of experience` : NOT_FOUND;
  }
  if (!yearsJd) yearsJd = NOT_FOUND;
  if (!yearsReq && yearsJd !== NOT_FOUND) {
    yearsReq = getJdYearsRequirement({ yearsNote: yearsJd });
  }

  let citizenshipJd = (eligibility?.usCitizenshipText || '').trim();
  if (!citizenshipJd) {
    if (wa.usCitizenRequired) citizenshipJd = 'US citizenship required';
    else if (wa.usCitizenPreferred) citizenshipJd = 'US citizenship preferred';
    else citizenshipJd = NOT_FOUND;
  }

  let workAuthJd = (eligibility?.workAuthorizationText || '').trim();
  if (!workAuthJd) {
    const parts = [];
    if (wa.h1bRequired) parts.push('H-1B required');
    if (wa.noSponsorship) parts.push('No visa sponsorship');
    if (wa.optMentioned) parts.push('OPT/CPT eligible');
    if (wa.sponsorshipAvailable) parts.push('Visa sponsorship available');
    if (wa.authorizedToWorkRequired) parts.push('Must be authorized to work in the US');
    if (wa.clearanceRequired) {
      parts.push(wa.clearanceLevel ? `Security clearance: ${wa.clearanceLevel}` : 'Security clearance required');
    }
    workAuthJd = parts.length ? parts.join(' · ') : NOT_FOUND;
  }

  const expElig = buildExperienceEligibility(yearsReq, exp.years);
  const workAuthElig = buildWorkAuthEligibility(workAuthJd, wa);
  const citElig = buildCitizenshipEligibility(citizenshipJd, wa);

  const items = [
    {
      label: 'Years of experience required',
      value: yearsJd,
      found: yearsJd !== NOT_FOUND,
      status: expElig.status,
      tag: expElig.tag || '',
      sub: expElig.sub,
    },
    {
      label: 'Work authorization',
      value: workAuthJd,
      found: workAuthJd !== NOT_FOUND,
      status: workAuthElig.status,
      tag: workAuthElig.tag || '',
      sub: workAuthElig.sub,
    },
    {
      label: 'US citizenship',
      value: citizenshipJd,
      found: citizenshipJd !== NOT_FOUND,
      status: citElig.status,
      sub: citElig.sub,
    },
  ];

  return { items, experience: exp, requiredYears: yearsReq?.min ?? null, yearsReq };
}

function renderEligibilityPanel(report) {
  const el = $('eligibilityPanel');
  if (!el) return;
  if (!report?.items?.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const foundCount = report.items.filter(i => i.found).length;
  const passCount = report.items.filter(i => i.status === 'pass').length;
  const failCount = report.items.filter(i => i.status === 'fail').length;
  const badgeClass = failCount ? 'fail' : passCount ? 'pass' : 'warn';
  const badgeText = failCount
    ? `${failCount} blocker${failCount > 1 ? 's' : ''} · ${foundCount}/3 in JD`
    : `${passCount} clear · ${foundCount}/3 in JD`;
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="eligibility-head">
      <div>
        <div class="card-title" style="margin-bottom:4px;">JD particulars</div>
        <p class="hint" style="margin:0;">Green = eligible or no requirement · Red = blocker or not eligible · numbers from JD vs your resume.</p>
      </div>
      <span class="eligibility-badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="eligibility-grid">
      ${report.items.map(item => {
        const status = item.status || (item.found ? 'neutral' : 'neutral');
        const valueClass = status === 'fail' && item.value === 'Not found' ? 'missing' : '';
        return `
        <article class="eligibility-item ${status}${valueClass ? ' ' + valueClass : ''}">
          <div class="eligibility-item-label">${escapeHtml(item.label)}${item.tag ? `<span class="eligibility-chip ${status}">${escapeHtml(item.tag)}</span>` : ''}</div>
          <p class="eligibility-item-value">${escapeHtml(item.value)}</p>
          ${item.sub ? `<p class="eligibility-item-sub ${status === 'pass' || status === 'fail' ? status : ''}">${escapeHtml(item.sub)}</p>` : ''}
        </article>`;
      }).join('')}
    </div>`;
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
    eligibility: parseJdEligibility(parsed),
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

/** JD-only keywords for ATS scoring — never internet/market stretch skills. */
function keywordsForScoring(kw) {
  const base = kw || {};
  const primary = scoredSkillTerms(
    base.jdPrimary?.length ? base.jdPrimary : (base.jdSkills?.length ? base.jdSkills : base.primary || []),
  ).slice(0, 14);
  const secondary = scoredSkillTerms(base.jdSecondary || []).filter(s =>
    !primary.some(p => p.toLowerCase() === String(s).toLowerCase()),
  ).slice(0, 14);
  const atsKeywords = filterExtractedSkills(
    base.atsKeywords?.length ? base.atsKeywords : atsPhrasesFromJdJson(base.jdJson || {}),
  );
  return {
    ...base,
    primary,
    secondary,
    jdPrimary: primary,
    jdSecondary: secondary,
    jdSkills: primary,
    atsKeywords,
    // Keep market fields for rewrite UI, but scoring paths must ignore them.
    internetSkills: base.internetSkills || base.marketSkills || [],
    internetKeywords: base.internetKeywords || [],
    marketSkills: base.marketSkills || base.internetSkills || [],
    aliasMap: buildAliasMap(primary, secondary, atsKeywords, []),
  };
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

  // primary/secondary are always JD-only (used for scoring). Market skills stay in internetSkills for Stretch rewrite only.
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
    aliasMap: buildAliasMap(jdSkills, jdSecondaryOnly, atsKeywords, []),
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
  let jdJson = null;
  try {
    if (typeof setProgress === 'function') setProgress(8, 'AI is analysing the job description…', 'Extracting skills from the posting…');
    jdJson = await parseJdToJson(jd);
    state.lastJdJson = jdJson;

    let jdAi = jdJsonToAnalysis(jdJson, ragJd);
    // Only run legacy extract if structured JSON is thin.
    if ((jdAi.jdPrimary || []).length < 6) {
      try {
        if (typeof setProgress === 'function') setProgress(12, 'AI is analysing the job description…', 'Enriching skills from the posting…');
        const jdRaw = await callGemini(buildJdAnalysisPrompt(jd, ragJd), { json: true, maxTokens: 2800 });
        const legacy = parseJdAnalysis(parseJsonLoose(jdRaw));
        if (legacy?.jdPrimary?.length) {
          jdAi = {
            ...jdAi,
            roleTitle: jdAi.roleTitle || legacy.roleTitle,
            roleLabel: jdAi.roleLabel || legacy.roleLabel,
            roleFamily: legacy.roleFamily || jdAi.roleFamily,
            jdPrimary: uniqTerms([...(jdAi.jdPrimary || []), ...(legacy.jdPrimary || [])]).slice(0, 16),
            jdSecondary: uniqTerms([...(jdAi.jdSecondary || []), ...(legacy.jdSecondary || [])])
              .filter(s => !(jdAi.jdPrimary || []).concat(legacy.jdPrimary || []).some(p => String(p).toLowerCase() === String(s).toLowerCase()))
              .slice(0, 12),
            atsKeywords: uniqTerms([...(jdAi.atsKeywords || []), ...(legacy.atsKeywords || [])]).slice(0, 20),
            eligibility: mergeEligibility(jdAi.eligibility, legacy.eligibility),
            _jdJson: jdJson,
          };
        }
      } catch (legacyErr) {
        console.warn('Legacy JD skill extract failed; using structured JD JSON only:', legacyErr);
      }
    }
    if (!jdAi?.jdPrimary?.length) throw new Error('Gemini returned no JD skills');

    let internetAi = null;
    // Stretch mode removed — never burn a Gemini call on market/job-board skills.
    if (state.mode === 'aggressive') {
      try {
        if (typeof setProgress === 'function') setProgress(16, 'AI is analysing the job description…', 'Researching market skills on job boards…');
        const netRaw = await callGemini(buildInternetSkillsPrompt(jd, jdAi), { json: true, maxTokens: 2000 });
        internetAi = parseInternetSkills(parseJsonLoose(netRaw));
      } catch (err) {
        internetError = err;
      }
    }

    ai = mergeAiExtractions(jdAi, internetAi);
    if (ai) {
      ai.eligibility = mergeEligibility(ai.eligibility, extractLocalEligibilityFromJd(jd));
      ai._jdJson = jdJson;
    }
    if (!ai.internetUsed && internetError) {
      ai.internetError = String(internetError.message || internetError).slice(0, 100);
    }
  } catch (err) {
    geminiError = err;
    ai = null;
    if (!jdJson) {
      try {
        jdJson = parseJdToJsonLocal(jd);
        state.lastJdJson = jdJson;
      } catch { /* ignore */ }
    }
  }
  const built = assembleLockedSkills(jd, ragJd, ai || (jdJson ? jdJsonToAnalysis(jdJson, ragJd) : null), state.mode);
  built.eligibility = ai?.eligibility || mergeEligibility(
    jdJson ? jdJsonToAnalysis(jdJson, ragJd).eligibility : null,
    extractLocalEligibilityFromJd(jd),
  );
  built.jdJson = jdJson || state.lastJdJson || null;
  built.geminiError = geminiError ? String(geminiError.message || geminiError).slice(0, 120) : null;
  built.internetError = ai?.internetError || (internetError && !ai ? String(internetError.message || internetError).slice(0, 100) : null);
  return built;
}

function buildUnderstandingPrompt(jd, resume) {
  return `You are a resume and job-description analyst. Do NOT assign a numeric score yet.
Read both documents carefully and map facts into the A–I JD-alignment categories for a later scorer.
This is alignment analysis, not a predicted ATS/Workday percentage.

JOB DESCRIPTION:
${String(jd || '').slice(0, 7000)}

RESUME:
${String(resume || '').slice(0, 11000)}

Return JSON only:
{
  "roleTitle": "exact JD job title",
  "jdYearsRequired": null,
  "resumeYears": null,
  "hardQualifications": {
    "jdRequires": ["years, degree, work auth, clearance, license, location — only if the JD actually gates on them"],
    "resumeHas": [],
    "gaps": [],
    "knockouts": ["absolute screen-outs such as clearance, license, or required location if unmet"]
  },
  "skillsKeywords": {
    "jdRequires": ["must-have tools/tech from JD"],
    "resumeHas": [],
    "resumeMissing": [],
    "skillsOnly": ["JD must-have tools that appear only in Skills, not experience"]
  },
  "responsibilities": {
    "jdDuties": ["key duties / type of work the JD is hiring for"],
    "resumeEvidence": ["how experience bullets match those duties"],
    "gaps": []
  },
  "seniority": {
    "jdLevel": "junior|mid|senior|lead|staff|manager|unknown",
    "resumeLevel": "junior|mid|senior|lead|staff|manager|unknown",
    "fit": "strong|partial|weak",
    "ownershipSignals": ["ownership, production, decisions, troubleshooting, mentoring if present"]
  },
  "requiredIndustry": {
    "jdRequiresIndustry": false,
    "industries": ["only if the JD explicitly requires healthcare/mortgage/retail/finance/etc experience"],
    "resumeHas": [],
    "note": "If the JD does not require industry experience, leave jdRequiresIndustry false even if the company is in that industry."
  },
  "evidenceNotes": ["how convincingly skills are demonstrated — listing vs used in work vs scale/result"],
  "achievementNotes": ["results, business impact, real metrics — never invent numbers"],
  "structureNotes": ["headers, sections, parse risk, single-column, selectable text"],
  "titleAlignment": {
    "jdTitle": "",
    "resumeTitles": [],
    "sameFamily": true,
    "note": "Do not expect past job titles to be rewritten to the JD title."
  },
  "readabilityNotes": ["10-second scan: role, years, strongest tech, employers, recent-work fit"],
  "primary": ["up to 10 must-have tech keywords from JD, exact spelling"],
  "secondary": ["up to 10 secondary tech keywords"]
}

Rules:
- Be factual. Quote tools with JD spelling.
- Ignore certifications as requirements unless the JD makes them a hard gate.
- Do not invent employers, degrees, or skills not in the resume.
- Do not treat company industry as a requirement unless the JD explicitly requires that experience.
- This is understanding only — no numeric score.`;
}

/** Structured resume schema (see resume_test/jsonresume.txt). Built BEFORE JD matching / scoring. */
function buildResumeJsonPrompt(resume) {
  return `You are a resume parser. Convert the resume into structured JSON only.
Use ONLY facts present in the resume. Do not invent employers, dates, degrees, or skills.

RESUME:
${String(resume || '').slice(0, 14000)}

Return JSON with exactly this shape:
{
  "personal_information": {
    "name": "",
    "title": "",
    "location": "",
    "phone": "",
    "email": "",
    "linkedin": "",
    "github": ""
  },
  "professional_summary": "",
  "skill_lines": [
    { "label": "Languages", "value": "Python, SQL" }
  ],
  "education": [
    {
      "degree": "",
      "start_date": "",
      "end_date": "",
      "institution": "",
      "location": ""
    }
  ],
  "skills": {
    "languages": [],
    "frameworks_and_tools": [],
    "databases": [],
    "cloud_platforms": [],
    "visualization": [],
    "ai_ml": [],
    "version_control_and_devops": [],
    "certifications": []
  },
  "professional_experience": [
    {
      "company": "",
      "role": "",
      "start_date": "",
      "end_date": "",
      "location": "",
      "responsibilities": []
    }
  ],
  "projects": [
    { "name": "", "bullets": [] }
  ],
  "certifications": [
    { "name": "", "date": "" }
  ]
}

Rules:
- Put every skill into the best skills.* bucket; leave unused buckets as [].
- skill_lines = the Skills section as shown (category label + comma list). Keep the master's labels.
- responsibilities = experience bullets only (no Skills-section dump).
- professional_summary = SUMMARY paragraph only.
- personal_information.title = headline under the name. If none, use the most recent job role. Never a section heading.
- personal_information.linkedin = the exact linkedin.com/in/slug if present. Never invent linkedin.com/in/username. Empty string if there is no real profile URL.
- personal_information.github = github.com/username if present. Empty if only the word GitHub.
- personal_information.location = the candidate's home/current city from the HEADER only (under the name or on the phone/email line). Never use a college, university, or employer city.
- professional_experience[].location = city/state/Remote ONLY if that role header already has it. Empty string if the role has no location. Never copy the header city, never guess company HQ.
- education.end_date = passout year when there is no from–to range.
- projects = PROJECTS section only. Empty [] if none.
- certifications = CERTIFICATIONS section as name + date. Empty [] if none. Do not invent certificates.
- Empty string / [] when unknown — never guess.`;
}

function emptyOther() {
  return { section_name: '', heading: '', data: '' };
}

function emptyResumeJson() {
  return {
    personal_information: { name: '', title: '', location: '', phone: '', email: '', linkedin: '', github: '' },
    professional_summary: '',
    skill_lines: [],
    education: [],
    skills: {
      languages: [],
      frameworks_and_tools: [],
      databases: [],
      cloud_platforms: [],
      visualization: [],
      ai_ml: [],
      version_control_and_devops: [],
      certifications: [],
    },
    professional_experience: [],
    projects: [],
    certifications: [],
    other_sections: [],
  };
}

function normalizeSkillLines(list) {
  return (Array.isArray(list) ? list : []).map(row => {
    if (typeof row === 'string') {
      const idx = row.indexOf(':');
      if (idx > 0 && idx < 60) return { label: row.slice(0, idx).trim(), value: row.slice(idx + 1).trim() };
      return { label: '', value: String(row).trim() };
    }
    return {
      label: String(row?.label || '').trim(),
      value: String(row?.value || '').trim(),
    };
  }).filter(r => r.label || r.value);
}

function skillLinesFromBuckets(sk) {
  const labels = {
    languages: 'Languages',
    frameworks_and_tools: 'Tools',
    databases: 'Databases',
    cloud_platforms: 'Cloud',
    visualization: 'Visualization',
    ai_ml: 'AI / ML',
    version_control_and_devops: 'DevOps',
    certifications: 'Certifications',
  };
  return Object.keys(labels).map(key => {
    const value = uniqTerms(sk?.[key] || []).join(', ');
    return value ? { label: labels[key], value } : null;
  }).filter(Boolean);
}

function bucketsFromSkillLines(lines) {
  const buckets = emptyResumeJson().skills;
  const blob = (lines || []).map(r => [r.label, r.value].filter(Boolean).join(': ')).join('\n');
  const parts = blob.split(/[:|•,;/]|\n/)
    .map(s => s.replace(/^[-•\s]+/, '').trim())
    .filter(s => s.length > 1 && s.length < 48 && !/^(languages?|packages?|tools?|cloud|databases?|frameworks?|visualization|management|other skills)$/i.test(s));
  for (const s of uniqTerms(parts).slice(0, 80)) {
    if (/\b(python|java|scala|sql|javascript|typescript|bash|shell|php|go|r\b|hack|graphql|rest)\b/i.test(s)) buckets.languages.push(s);
    else if (/\b(aws|gcp|azure|google cloud)\b/i.test(s)) buckets.cloud_platforms.push(s);
    else if (/\b(mysql|postgres|snowflake|redshift|bigquery|mongodb|cassandra|dynamodb|netezza|hive)\b/i.test(s)) buckets.databases.push(s);
    else if (/\b(tableau|power bi|looker|streamlit|metabase|quicksight)\b/i.test(s)) buckets.visualization.push(s);
    else if (/\b(tensorflow|pytorch|scikit|langchain|rag|llm|ml|nlp|xgboost)\b/i.test(s)) buckets.ai_ml.push(s);
    else if (/\b(git|docker|jenkins|ci\/cd|kubernetes|terraform|composer|step functions)\b/i.test(s)) buckets.version_control_and_devops.push(s);
    else if (/certif/i.test(s)) buckets.certifications.push(s);
    else buckets.frameworks_and_tools.push(s);
  }
  for (const k of Object.keys(buckets)) buckets[k] = uniqTerms(buckets[k]);
  return buckets;
}

function normalizeResumeJson(parsed) {
  const base = emptyResumeJson();
  if (!parsed || typeof parsed !== 'object') return base;
  const pi = parsed.personal_information || {};
  base.personal_information = {
    name: String(pi.name || '').trim(),
    title: String(pi.title || '').trim(),
    location: String(pi.location || '').trim(),
    phone: String(pi.phone || '').trim(),
    email: String(pi.email || '').trim(),
    linkedin: shortenLinkedIn(pi.linkedin) || (/^linkedin$/i.test(String(pi.linkedin || '').trim()) ? '' : String(pi.linkedin || '').trim()),
    github: extractGithubHandle(pi.github) || '',
  };
  base.professional_summary = String(parsed.professional_summary || '').trim();
  base.education = (Array.isArray(parsed.education) ? parsed.education : []).map(e => ({
    degree: String(e?.degree || '').trim(),
    start_date: String(e?.start_date || '').trim(),
    end_date: String(e?.end_date || '').trim(),
    institution: String(e?.institution || '').trim(),
    location: String(e?.location || '').trim(),
  })).filter(e => e.degree || e.institution);
  const sk = parsed.skills || {};
  for (const key of Object.keys(base.skills)) {
    base.skills[key] = uniqTerms(sk[key] || []).map(s => String(s).trim()).filter(Boolean);
  }
  base.skill_lines = normalizeSkillLines(parsed.skill_lines);
  if (!base.skill_lines.length) base.skill_lines = skillLinesFromBuckets(base.skills);
  else base.skills = bucketsFromSkillLines(base.skill_lines);
  base.professional_experience = (Array.isArray(parsed.professional_experience) ? parsed.professional_experience : [])
    .map(job => ({
      company: String(job?.company || '').trim(),
      role: String(job?.role || '').trim(),
      start_date: String(job?.start_date || '').trim(),
      end_date: String(job?.end_date || '').trim(),
      location: String(job?.location || '').trim(),
      responsibilities: (Array.isArray(job?.responsibilities) ? job.responsibilities : [])
        .map(b => String(b || '').trim().replace(/^[-•]\s+/, ''))
        .filter(Boolean),
    }))
    .filter(j => j.company || j.role || j.responsibilities.length);
  base.projects = (Array.isArray(parsed.projects) ? parsed.projects : []).map(p => ({
    name: String(p?.name || '').trim(),
    bullets: (Array.isArray(p?.bullets) ? p.bullets : [])
      .map(b => String(b || '').trim().replace(/^[-•]\s+/, ''))
      .filter(Boolean),
  })).filter(p => p.name || p.bullets.length);
  base.certifications = (Array.isArray(parsed.certifications) ? parsed.certifications : []).map(c => {
    if (typeof c === 'string') return { name: c.trim(), date: '' };
    return { name: String(c?.name || '').trim(), date: String(c?.date || '').trim() };
  }).filter(c => c.name);
  base.other_sections = (Array.isArray(parsed.other_sections) ? parsed.other_sections : []).map(o => ({
    section_name: String(o?.section_name || o?.name || '').trim(),
    heading: String(o?.heading || '').trim(),
    data: String(o?.data || '').trim(),
  })).filter(o => o.section_name || o.heading || o.data);
  return base;
}

function resumeJsonToMasterText(rj) {
  const r = normalizeResumeJson(rj);
  const pi = r.personal_information || {};
  const contact = [pi.phone, pi.email, pi.linkedin, pi.github, pi.location].filter(Boolean).join(' | ');
  const skills = (r.skill_lines || []).map(row => row.label ? `${row.label}: ${row.value}` : row.value).filter(Boolean);
  const jobs = (r.professional_experience || []).map(job => {
    const dates = [job.start_date, job.end_date].filter(Boolean).join(' – ');
    const header = typeof formatRoleLineFromParts === 'function'
      ? formatRoleLineFromParts({ company: job.company, location: job.location, title: job.role, dates })
      : [job.company, job.location, job.role, dates].filter(Boolean).join(' | ');
    const bullets = (job.responsibilities || []).map(b => `- ${String(b).replace(/^[-•]\s+/, '')}`);
    return [header, ...bullets].filter(Boolean).join('\n');
  }).filter(Boolean);
  const edu = (r.education || []).map(e => {
    const years = [e.start_date, e.end_date].filter(Boolean).join(' – ');
    const school = [e.institution, e.location].filter(Boolean).join(', ');
    const schoolLine = [school, years].filter(Boolean).join(', ');
    // Pipe keeps degree as a known field — parser must not re-guess from wording.
    if (e.degree && schoolLine) return `${String(e.degree).trim()} | ${schoolLine}`;
    return [e.degree, schoolLine].filter(Boolean).join('\n');
  }).filter(Boolean);
  const projects = (r.projects || []).map(p => [
    p.name,
    ...(p.bullets || []).map(b => `- ${String(b).replace(/^[-•]\s+/, '')}`),
  ].filter(Boolean).join('\n')).filter(Boolean);
  const certs = (r.certifications || []).map(c => [c.name, c.date].filter(Boolean).join(' | ')).filter(Boolean);
  const others = (r.other_sections || []).map(o => {
    const name = String(o.section_name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const heading = String(o.heading || '').trim();
    const dataLines = String(o.data || '').split(/\n+/).map(l => l.trim()).filter(Boolean)
      .map(l => (/^[-•]/.test(l) ? `- ${l.replace(/^[-•]\s+/, '')}` : l));
    return [name, heading, ...dataLines].filter(Boolean).join('\n');
  }).filter(Boolean);
  return [
    pi.name,
    pi.title,
    contact,
    '',
    r.professional_summary ? 'SUMMARY' : '',
    r.professional_summary,
    '',
    skills.length ? 'TECHNICAL SKILLS' : '',
    ...skills,
    '',
    jobs.length ? 'PROFESSIONAL EXPERIENCE' : '',
    jobs.join('\n\n'),
    '',
    edu.length ? 'EDUCATION' : '',
    edu.join('\n'),
    '',
    projects.length ? 'PROJECTS' : '',
    projects.join('\n\n'),
    '',
    certs.length ? 'CERTIFICATIONS' : '',
    certs.join('\n'),
    '',
    others.join('\n\n'),
  ].filter((line, i, arr) => !(line === '' && (i === 0 || arr[i - 1] === ''))).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Flat skill list from structured JSON (Skills section only). */
function skillsFromResumeJson(rj) {
  const sk = (rj && rj.skills) || {};
  const fromBuckets = uniqTerms(Object.values(sk).flat().map(s => String(s || '').trim()).filter(Boolean));
  const fromLines = (rj?.skill_lines || []).flatMap(row => String(row.value || '').split(/[,;|]/)).map(s => s.trim()).filter(Boolean);
  return uniqTerms([...fromBuckets, ...fromLines]);
}

/** Experience bullet corpus from structured JSON. */
function experienceTextFromResumeJson(rj) {
  return ((rj && rj.professional_experience) || [])
    .flatMap(j => [j.role, j.company, ...(j.responsibilities || [])])
    .filter(Boolean)
    .join('\n');
}

/** Full searchable corpus from structured JSON (for presence checks). */
function corpusFromResumeJson(rj) {
  if (!rj) return '';
  const pi = rj.personal_information || {};
  const edu = (rj.education || []).map(e => [e.degree, e.institution, e.location].filter(Boolean).join(' '));
  const projects = (rj.projects || []).flatMap(p => [p.name, ...(p.bullets || [])]);
  const certs = (rj.certifications || []).map(c => [c.name, c.date].filter(Boolean).join(' '));
  return [
    pi.name, pi.title, pi.location, pi.email, pi.phone, pi.linkedin, pi.github,
    rj.professional_summary,
    ...skillsFromResumeJson(rj),
    experienceTextFromResumeJson(rj),
    ...edu,
    ...projects,
    ...certs,
  ].filter(Boolean).join('\n');
}

function bulletsFromResumeJson(rj) {
  return ((rj && rj.professional_experience) || []).flatMap(j => j.responsibilities || []).filter(Boolean);
}

function tenSecondTestFromJson(rj, jj, primary, aliasMap) {
  const summary = String(rj?.professional_summary || '');
  const skills = skillsFromResumeJson(rj).join('\n');
  const exp = experienceTextFromResumeJson(rj);
  const corpus = corpusFromResumeJson(rj);
  const found = (primary || []).filter(k => keywordPresent(k, corpus, aliasMap));
  const bullets = bulletsFromResumeJson(rj);
  const title = String(jj?.job_information?.title || '');
  return {
    role: !!(summary || (rj?.professional_experience || [])[0]?.role),
    years: /\d+\+?\s*years?/i.test(summary),
    strongestTech: found.length >= Math.min(3, Math.max((primary || []).length, 1)),
    cloud: /\b(aws|gcp|azure|google cloud|amazon web services)\b/i.test(`${skills}\n${exp}`),
    problemsSolved: IMPACT_VERB_RE.test(exp) || OWNERSHIP_RE.test(exp),
    measurableResults: bullets.filter(b => /\d/.test(b)).length >= Math.max(2, Math.floor(bullets.length * 0.3)),
    jdMatch: found.length / Math.max((primary || []).length, 1) >= 0.7,
    notes: [],
    titleHint: title,
  };
}

/** Seed a score object from resume JSON + JD JSON only — no raw-text RAG. */
function seedUnifiedFromJson(resumeJson, jdJson, keywords) {
  const jj = jdJson || emptyJdJson();
  const rj = resumeJson || emptyResumeJson();
  const kw = keywordsForScoring(keywords || keywordsFromJdJson(jj));
  ensureAliasMap(kw);
  const primary = dropCertTerms(kw.primary || jj.must_have_skills || []);
  const secondary = dropCertTerms(kw.secondary || jj.nice_to_have_skills || []);
  const aliasMap = kw.aliasMap || {};
  const bullets = bulletsFromResumeJson(rj);
  const missingSections = [];
  if (!rj.professional_summary) missingSections.push('SUMMARY');
  if (!skillsFromResumeJson(rj).length) missingSections.push('SKILLS');
  if (!(rj.professional_experience || []).length) missingSections.push('EXPERIENCE');
  if (!(rj.education || []).length) missingSections.push('EDUCATION');
  return {
    title: jj.job_information?.title || kw.title || '',
    primary,
    secondary,
    aliasMap,
    resumeJson: rj,
    jdJson: jj,
    resumeUsed: resumeJsonToScoreText(rj),
    tenSecondTest: tenSecondTestFromJson(rj, jj, primary, aliasMap),
    scorecard: {
      bulletsWithMetrics: bullets.filter(b => /\d/.test(b)).length,
      bulletsTotal: bullets.length,
      formatCheck: missingSections.length ? 'WARNING' : 'PASS',
      formatIssues: [],
      sectionCheck: missingSections.length ? 'FAIL' : 'PASS',
      missingSections,
      jsonScore: true,
    },
  };
}

/**
 * Heuristic local parse when Gemini is unavailable — same schema as jsonresume.txt.
 */
function parseResumeToJsonLocal(resume) {
  const text = String(resume || '');
  const lines = (typeof mergeHangingRoleDates === 'function'
    ? mergeHangingRoleDates(text.split(/\r?\n/).map(l => l.trim()))
    : text.split(/\r?\n/).map(l => l.trim()));
  const out = emptyResumeJson();
  const headerIdx = (re) => lines.findIndex(l => re.test(l) && String(l).length < 60);
  const nextHeader = (from) => {
    for (let i = from + 1; i < lines.length; i++) {
      if (/^(SUMMARY|PROFESSIONAL SUMMARY|OBJECTIVE|SKILLS|TECHNICAL SKILLS|PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EXPERIENCE|EDUCATION|PROJECTS|CERTIFICATIONS)\b/i.test(lines[i])
        && lines[i].length < 60) return i;
    }
    return lines.length;
  };
  const sliceSection = (re) => {
    const s = headerIdx(re);
    if (s < 0) return [];
    return lines.slice(s + 1, nextHeader(s)).filter(Boolean);
  };

  const top = [];
  for (const l of lines.slice(0, 10)) {
    if (!l) continue;
    if (typeof isSectionHeader === 'function' ? isSectionHeader(l) : /^(SUMMARY|SKILLS|EXPERIENCE|EDUCATION)\b/i.test(l)) break;
    top.push(l);
  }
  const cf = typeof extractContactFields === 'function' ? extractContactFields(text) : {};
  out.personal_information.name = (top.find(l => !(typeof isHeaderContactLine === 'function' && isHeaderContactLine(l))) || '').replace(/,$/, '');
  const titleLine = top.find(l => l !== out.personal_information.name && !(typeof isHeaderContactLine === 'function' && isHeaderContactLine(l)));
  out.personal_information.title = titleLine && titleLine.length < 70 ? titleLine : '';
  out.personal_information.email = cf.email || '';
  out.personal_information.phone = cf.phone || '';
  out.personal_information.linkedin = cf.linkedin || '';
  out.personal_information.github = cf.github || githubFromHeader(top.join('\n')) || '';
  const headerLoc = extractPersonalLocation(text, null);
  if (headerLoc) out.personal_information.location = headerLoc;

  const sumLines = sliceSection(/^(SUMMARY|PROFESSIONAL SUMMARY|OBJECTIVE)\b/i);
  out.professional_summary = sumLines.filter(l => !/^[-•]/.test(l)).join(' ').trim();

  const skillLines = sliceSection(/^(SKILLS|TECHNICAL SKILLS)\b/i);
  out.skill_lines = skillLines.map(l => {
    const idx = l.indexOf(':');
    if (idx > 1 && idx < 55) return { label: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim() };
    return { label: '', value: l.replace(/^[-•]\s*/, '') };
  }).filter(r => r.value);
  out.skills = bucketsFromSkillLines(out.skill_lines);

  const expLines = sliceSection(/^(PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EXPERIENCE)\b/i);
  let cur = null;
  for (const l of expLines) {
    const dateRe = /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|Present|Current)/i;
    if (dateRe.test(l) || (/\|/.test(l) && !/^[-•]/.test(l) && l.length < 120)) {
      if (cur) out.professional_experience.push(cur);
      const dm = l.match(dateRe);
      const parsed = typeof parseRoleLineParts === 'function' ? parseRoleLineParts(l) : { company: l, title: '', location: '', dates: '' };
      cur = {
        company: parsed.company || '',
        role: parsed.title || '',
        location: parsed.location || '',
        start_date: dm ? dm[1] : (parsed.dates || '').split(/[–—-]/)[0]?.trim() || '',
        end_date: dm ? dm[2] : '',
        responsibilities: [],
      };
      if (!dm && parsed.dates) {
        const bits = String(parsed.dates).split(/\s*[–—-]\s*/);
        cur.start_date = bits[0] || '';
        cur.end_date = bits[1] || '';
      }
      continue;
    }
    if (/^[-•]/.test(l) || (cur && l.length > 40)) {
      if (!cur) {
        cur = { company: '', role: '', start_date: '', end_date: '', location: '', responsibilities: [] };
      }
      cur.responsibilities.push(l.replace(/^[-•\s]+/, '').trim());
    }
  }
  if (cur) out.professional_experience.push(cur);

  const eduLines = sliceSection(/^EDUCATION\b/i);
  const eduRangeRe = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*(?:[-–—]|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}|Present)/i;
  for (let i = 0; i < eduLines.length; i++) {
    const l = eduLines[i].replace(/^[-•]\s*/, '');
    if (!l) continue;
    const range = l.match(eduRangeRe);
    const year = !range && l.match(/\b((?:19|20)\d{2})\b/);
    const stripped = l.replace(range?.[0] || '', '').replace(/[.,]+$/, '').trim();
    if (/university|college|school|institute|polytechnic/i.test(stripped) && out.education.length && !out.education[out.education.length - 1].institution) {
      const last = out.education[out.education.length - 1];
      last.institution = stripped.replace(/,\s*$/, '').trim();
      if (!last.end_date) last.end_date = range ? range[2] : (year ? year[1] : '');
      if (!last.start_date && range) last.start_date = range[1];
      continue;
    }
    if (/bachelor|master|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|ph\.?d|mba|diploma|associate|degree|sciences?/i.test(stripped) || /[|—–]/.test(l)) {
      const next = eduLines[i + 1] || '';
      const schoolNext = next && /university|college|school|institute|polytechnic/i.test(next) ? next.replace(/^[-•]\s*/, '').replace(/[.,]+$/, '') : '';
      const parts = stripped.split(/\s*[|—–]\s+|\s+-\s+/).map(s => s.trim()).filter(Boolean);
      let degree = parts[0] || stripped;
      let institution = parts[1] || '';
      let location = parts[2] || '';
      if (!institution) {
        const uni = degree.match(/^(.*?)[,]\s+((?:University|College|Institute|School|Polytechnic)\b.*)$/i);
        if (uni) {
          degree = uni[1].trim();
          institution = uni[2].trim();
        }
      }
      if (!institution && schoolNext) institution = schoolNext.replace(eduRangeRe, '').replace(/[.,]+$/, '').trim();
      out.education.push({
        degree,
        start_date: range ? range[1] : '',
        end_date: range ? range[2] : (year ? year[1] : ''),
        institution,
        location,
      });
      if (schoolNext && !parts[1]) i += 1;
    }
  }

  const projLines = sliceSection(/^PROJECTS?\b/i);
  let pcur = null;
  for (const l of projLines) {
    if (/^[-•]/.test(l) || (pcur && l.length > 90)) {
      if (!pcur) pcur = { name: '', bullets: [] };
      pcur.bullets.push(l.replace(/^[-•\s]+/, '').trim());
      continue;
    }
    if (pcur) out.projects.push(pcur);
    pcur = { name: l.replace(/[.,]+$/, ''), bullets: [] };
  }
  if (pcur) out.projects.push(pcur);
  if (!out.personal_information.title && out.professional_experience[0]?.role) {
    out.personal_information.title = out.professional_experience[0].role;
  }

  const certLines = sliceSection(/^CERTIF/i);
  for (const l of certLines) {
    const t = l.replace(/^[-•]\s*/, '');
    const m = t.match(/[,|]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|(?:19|20)\d{2})\s*$/i);
    out.certifications.push({
      name: (m ? t.slice(0, m.index) : t).replace(/[|,]\s*$/, '').trim(),
      date: m ? m[1] : '',
    });
  }

  return applyPersonalLocationFromHeader(normalizeResumeJson(out), text);
}

async function parseResumeToJson(resume) {
  const text = String(resume || '');
  const local = parseResumeToJsonLocal(text);
  try {
    const raw = await callGemini(buildResumeJsonPrompt(text), { json: true, maxTokens: 4000 });
    const parsed = normalizeResumeJson(parseJsonLoose(raw));
    const hasSignal = parsed.personal_information.name
      || parsed.professional_experience.length
      || skillsFromResumeJson(parsed).length;
    if (hasSignal) {
      const merged = applyPersonalLocationFromHeader(parsed, text);
      if (!merged.personal_information.github) merged.personal_information.github = local.personal_information.github;
      if (!merged.personal_information.title) merged.personal_information.title = local.personal_information.title;
      if (!merged.skill_lines.length) merged.skill_lines = local.skill_lines;
      if (!merged.projects.length) merged.projects = local.projects;
      if (!merged.certifications.length) merged.certifications = local.certifications;
      return merged;
    }
  } catch (err) {
    console.warn('Resume JSON parse (Gemini) failed:', err);
  }
  return local;
}

function buildScorePrompt(jd, resume, locked, understanding) {
  const lockedBlock = locked?.primary?.length
    ? `LOCKED KEYWORDS — score ONLY against these lists. Return them unchanged as "primary" and "secondary". Do not extract a new keyword list.
PRIMARY: ${locked.primary.join(', ')}
SECONDARY: ${(locked.secondary || []).join(', ')}
A keyword is FOUND if it or a close variant appears (Spark counts for Apache Spark, Airflow for Apache Airflow).

Score each ${SCORE_RULE_NAME} category using the weights below. Be strict and evidence-based.
IMPORTANT: Score ONLY against JD skills above. Do NOT require or deduct for internet/market/job-board stretch skills.`
    : `Extract exactly 10 primary and 10 secondary ATS keywords using the JD's exact spelling (Apache Spark not just Spark when the JD says Apache Spark).
Keywords must be technologies, tools, platforms, and role skills ONLY from the JD — not generic market skills.`;

  const understandingBlock = understanding
    ? `PRIOR UNDERSTANDING (from a separate analysis pass — treat as ground truth for what the JD wants and what the resume shows):
${JSON.stringify(understanding).slice(0, 6500)}

Use this understanding to score. Do not contradict clear facts in the analysis. Still verify against the resume text.`
    : 'No prior analysis was provided — infer carefully from the JD and resume, then score.';

  return `You are a strict JD-alignment scorer, not an ATS vendor simulator. A prior analyst already mapped the JD and resume.
Now score ONLY with the ${SCORE_RULE_NAME} (sums to 100). Do NOT use any other rubric. Return ONLY JSON.
${SCORE_INTERPRETATION}

${understandingBlock}

SCORE RULE (sum to 100):
A. hardQualifications 0-20 — years vs JD, education/degree, work authorization if stated. Score industry ONLY if the JD explicitly requires that industry experience. Identify absolute knockouts separately (clearance, license, required location) — a resume can score well overall and still be screened out.
B. skillsKeywords 0-20 — important JD skills appear naturally. Skills-section hits help; experience bullets that connect the tool to real work are stronger. Do not reward stuffing the same keyword.
C. semanticResponsibilityMatch 0-20 — has this person done the type of work the JD is hiring for? Keyword overlap without matching responsibilities is weak.
D. skillsEvidenceContext 0-10 — listing a skill is weak; using it in a bullet is better; action + scale/result is strongest. Never assume invented metrics.
E. experienceSeniorityMatch 0-10 — appropriate for the JD level: ownership, production systems, technical decisions, troubleshooting, optimization, collaboration, mentoring if relevant. Not just "worked on tickets."
F. achievementsImpact 0-8 — results vs activities. Real metrics help; never invent numbers.
G. resumeParsingStructure 0-5 — clear SUMMARY/SKILLS/EXPERIENCE/EDUCATION, company/title/dates identifiable, single-column, no graphics, selectable text.
H. jobTitleAlignment 0-2 — role-family alignment only (any role). Similar families count as aligned. Do not expect past titles to be rewritten.
I. recruiterReadability 0-5 — 10-second scan: role, years, strongest tech, employers, recent-work fit.

Do NOT score generic company industry. Do NOT treat the total as a Workday/Greenhouse prediction.
CALIBRATION: Typical tailored resume 75-88. 90+ needs strong A/B/C plus solid D. 95+ is rare.

${lockedBlock}
Do NOT extract certifications or deduct for missing CERTIFICATIONS.

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
    "hardQualifications": 0,
    "skillsKeywords": 0,
    "semanticResponsibilityMatch": 0,
    "skillsEvidenceContext": 0,
    "experienceSeniorityMatch": 0,
    "achievementsImpact": 0,
    "resumeParsingStructure": 0,
    "jobTitleAlignment": 0,
    "recruiterReadability": 0
  },
  "hardKnockouts": [],
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

/** Build locked scoring keywords from structured JD JSON. */
function keywordsFromJdJson(jdJson) {
  const j = jdJson || emptyJdJson();
  const primary = scoredSkillTerms(j.must_have_skills || []).slice(0, 14);
  const secondary = scoredSkillTerms(j.nice_to_have_skills || [])
    .filter(s => !primary.some(p => p.toLowerCase() === String(s).toLowerCase())).slice(0, 14);
  const atsKeywords = atsPhrasesFromJdJson(j);
  const analysis = jdJsonToAnalysis(j);
  const title = j.job_information?.title || '';
  return keywordsForScoring({
    primary,
    secondary,
    jdPrimary: primary,
    jdSecondary: secondary,
    jdSkills: primary,
    atsKeywords,
    title,
    role: { title, label: title, family: roleFamilyFromTitle(title) },
    jdJson: j,
    eligibility: analysis.eligibility,
    source: 'jd-json',
    geminiUsed: true,
    aliasMap: buildAliasMap(primary, secondary, atsKeywords),
  });
}

/** Flatten JD JSON into short text for local score helpers. */
function jdJsonToScoreText(jdJson) {
  const j = jdJson || {};
  return [
    j.job_information?.title,
    j.job_information?.location,
    j.overview,
    j.years_of_experience?.note,
    `Must-have: ${(j.must_have_skills || []).join(', ')}`,
    `Nice-to-have: ${(j.nice_to_have_skills || []).join(', ')}`,
    `ATS phrases: ${(j.ats_phrases || []).join(', ')}`,
    `Responsibilities:\n${(j.responsibilities || []).map(r => `- ${r}`).join('\n')}`,
    j.requirements?.education,
    j.requirements?.experience,
    ...(j.requirements?.hard_gates || []),
    j.requirements?.work_authorization,
    `Industry (score only if JD requires it): ${(j.domain_industry || []).join(', ')}`,
  ].filter(Boolean).join('\n');
}

/** Flatten resume JSON into plain text for local score helpers. */
function resumeJsonToScoreText(resumeJson) {
  const r = resumeJson || {};
  const pi = r.personal_information || {};
  const skills = skillsFromResumeJson(r);
  const jobs = (r.professional_experience || []).map(job => [
    [job.company, job.role, job.start_date, job.end_date].filter(Boolean).join(' | '),
    ...(job.responsibilities || []).map(b => `- ${b}`),
  ].join('\n')).join('\n\n');
  const edu = (r.education || []).map(e =>
    [e.degree, e.institution, e.location, e.start_date, e.end_date].filter(Boolean).join(' | ')
  ).join('\n');
  return [
    pi.name,
    pi.title,
    [pi.location, pi.phone, pi.email, pi.linkedin, pi.github].filter(Boolean).join(' | '),
    'SUMMARY',
    r.professional_summary || '',
    'SKILLS',
    skills.join(', '),
    'PROFESSIONAL EXPERIENCE',
    jobs,
    'EDUCATION',
    edu,
    (r.projects || []).length ? 'PROJECTS' : '',
    (r.projects || []).map(p => [p.name, ...(p.bullets || []).map(b => `- ${b}`)].join('\n')).join('\n\n'),
    (r.certifications || []).length ? 'CERTIFICATIONS' : '',
    (r.certifications || []).map(c => [c.name, c.date].filter(Boolean).join(' | ')).join('\n'),
  ].filter(Boolean).join('\n');
}

function buildScoreRulePrompt(resumeJson, jdJson, locked) {
  const primary = locked?.primary || jdJson?.must_have_skills || [];
  const secondary = locked?.secondary || jdJson?.nice_to_have_skills || [];
  return `You are a strict JD-alignment scorer (not an ATS vendor simulator).
Score ONLY from the structured RESUME JSON and JD JSON below using the ${SCORE_RULE_NAME} (sum 100).
Do not invent skills or experience that are not in the resume JSON.
Do not use internet/market skills.
${SCORE_INTERPRETATION}

SCORE RULE (sum to 100) — points = round((matched ÷ total) × weight).
A. hardQualifications 0-20 — applicable gates (years, education, work auth if stated, industry ONLY if the JD explicitly requires it). List absolute knockouts separately.
B. skillsKeywords 0-20 — must-have credit: missing=0, Skills-only=0.45, in experience=1.0. Do not reward stuffing.
C. semanticResponsibilityMatch 0-20 — JD responsibilities mirrored in experience ÷ duty count × 20.
D. skillsEvidenceContext 0-10 — evidence quality of must-haves (list=weak, used in work=better, scale/result=strongest).
E. experienceSeniorityMatch 0-10 — seniority/ownership/production checks ÷ checks × 10.
F. achievementsImpact 0-8 — result/impact checks ÷ checks × 8. Never invent metrics.
G. resumeParsingStructure 0-5 — SUMMARY/SKILLS/EXPERIENCE/EDUCATION present ÷ 4 × 5.
H. jobTitleAlignment 0-2 — role-family alignment, not exact past-title rewrite.
I. recruiterReadability 0-5 — 10-second scan checks ÷ checks × 5.

Do not score generic company industry. Do not invent other formulas. Return ruleScores that match this coverage math.

LOCKED PRIMARY (must-haves): ${primary.join(', ')}
LOCKED SECONDARY: ${secondary.join(', ')}

A skill is FOUND only if it appears in resume JSON skills buckets or experience responsibilities (or close variant).
Return primary/secondary unchanged.

JD JSON:
${JSON.stringify(jdJson || {}).slice(0, 7000)}

RESUME JSON:
${JSON.stringify(resumeJson || {}).slice(0, 10000)}

Return JSON only:
{
  "title": "<JD job title>",
  "primary": ${JSON.stringify(primary.slice(0, 14))},
  "secondary": ${JSON.stringify(secondary.slice(0, 14))},
  "atsScore": <sum of ruleScores>,
  "ruleScores": {
    "hardQualifications": 0,
    "skillsKeywords": 0,
    "semanticResponsibilityMatch": 0,
    "skillsEvidenceContext": 0,
    "experienceSeniorityMatch": 0,
    "achievementsImpact": 0,
    "resumeParsingStructure": 0,
    "jobTitleAlignment": 0,
    "recruiterReadability": 0
  },
  "hardKnockouts": [],
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
  "confidenceReason": "Scored from structured resume JSON + JD JSON using ${SCORE_RULE_NAME}.",
  "gaps": [],
  "improvementSuggestions": [],
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

/**
 * Score a resume against a JD using ONLY the 9-point alignment rubric.
 * Same function for the base resume and the tailored resume.
 * JSON structure is input; Gemini does not assign the numeric score.
 */
function scoreWithNinePointRule(jd, resume, { resumeJson = null, jdJson = null, keywords = null } = {}) {
  const jj = jdJson || state.lastJdJson || null;
  const rj = resumeJson || state.lastResumeJson || null;
  const kw = keywordsForScoring(keywords || state.keywords || (jj ? keywordsFromJdJson(jj) : {}) || {});
  ensureAliasMap(kw);

  let seed;
  if (rj && jj) {
    seed = seedUnifiedFromJson(rj, jj, kw);
  } else {
    const resumeText = String(resume || '');
    const jdText = String(jd || '') || (jj ? jdJsonToScoreText(jj) : '');
    seed = ragToUnified(jdText, resumeText, kw);
    seed.resumeJson = rj;
    seed.jdJson = jj;
    seed.resumeUsed = resumeText;
    seed.primary = kw.primary || seed.primary;
    seed.secondary = kw.secondary || [];
    seed.aliasMap = kw.aliasMap || seed.aliasMap;
    seed.title = kw.title || jj?.job_information?.title || seed.title;
  }

  const resumeText = seed.resumeUsed || String(resume || '');
  const unified = reconcileKeywordPresence(seed, resumeText, rj);
  syncDisplayedAlignmentScore(unified);
  unified.source = 'nine-point-json';
  unified.resumeJson = rj;
  unified.jdJson = jj;
  if (jj?.job_information?.title) unified.title = jj.job_information.title;
  if (unified.scorecard) {
    unified.scorecard.ruleScores = unified.ruleScores;
    unified.scorecard.atsScore = unified.atsScore;
    unified.scorecard.scoreRule = SCORE_RULE_NAME;
    unified.scorecard.resumeJsonUsed = !!rj;
    unified.scorecard.jdJsonUsed = !!jj;
    unified.scorecard.jsonScore = !!(rj && jj);
    unified.scorecard.scoreInterpretation = SCORE_INTERPRETATION;
    unified.scorecard.tenSecondTest = unified.tenSecondTest || seed.tenSecondTest || unified.scorecard.tenSecondTest;
    unified.scorecard.confidenceReason = rj && jj
      ? `Scored from resume JSON + JD JSON with the 9-point rubric. ${SCORE_INTERPRETATION}`
      : `9-point JD alignment (A–I sum only). ${SCORE_INTERPRETATION}`;
  }
  return unified;
}

/**
 * Score using structured resume JSON + JD JSON and the 100-point JD-alignment rule.
 * Skips internet skills and raw-text inventing. Numeric score is the 9-point rubric only.
 */
async function scoreFromStructuredJson(resumeJson, jdJson, { resumeText = '', jdText = '' } = {}) {
  const rj = resumeJson || state.lastResumeJson;
  const jj = jdJson || state.lastJdJson;
  if (!rj || !jj) throw new Error('Structure resume + JD into JSON first');

  const kw = keywordsFromJdJson(jj);
  state.keywords = { ...(state.keywords || {}), ...kw, jdJson: jj };
  ensureAliasMap(state.keywords);

  const resumeForLocal = resumeText || resumeJsonToScoreText(rj);
  const jdForLocal = jdText || jdJsonToScoreText(jj);

  updateAiProcessing(`Scoring with the 9-point ${SCORE_RULE_NAME}…`);
  const unified = scoreWithNinePointRule(jdForLocal, resumeForLocal, {
    resumeJson: rj,
    jdJson: jj,
    keywords: state.keywords,
  });
  unified.title = jj.job_information?.title || unified.title;
  return { unified, resume: resumeForLocal, resumeJson: rj, jdJson: jj };
}

function missingSkillReport(keywords, resume) {
  const kw = keywords || {};
  const aliasMap = kw.aliasMap || {};
  const text = String(resume || '');
  const profile = detectCandidateProfile(text);
  const important = filterTermsForCandidateProfile(
    dropCertTerms(kw.primary || []).filter(k => !keywordPresent(k, text, aliasMap)),
    text,
    profile,
  );
  const extra = filterTermsForCandidateProfile(
    dropCertTerms(kw.secondary || []).filter(k => !keywordPresent(k, text, aliasMap)),
    text,
    profile,
  );
  const ats = atsPhraseReport(kw, text);
  const atsMissing = filterAtsPhrasesForCandidate(ats.missing, text, profile);
  return {
    important,
    extra,
    all: uniqTerms([...important, ...extra]),
    atsPhrases: ats.phrases,
    atsFound: ats.found,
    atsMissing,
    candidateProfile: profile,
  };
}

function skillsPresentOnMaster(terms, masterText, aliasMap) {
  const text = String(masterText || '');
  const map = aliasMap || state.keywords?.aliasMap || {};
  return (terms || []).filter(k => keywordPresent(k, text, map));
}

function skillsMissingFromMaster(terms, masterText, aliasMap) {
  const text = String(masterText || '');
  const map = aliasMap || state.keywords?.aliasMap || {};
  return (terms || []).filter(k => k && !keywordPresent(k, text, map));
}

/** Preferred / secondary / market tools — Stretch mode only. */
function stretchOnlyGaps(keywords, masterText, missingReport) {
  const master = String(masterText || '');
  const aliasMap = keywords?.aliasMap || state.keywords?.aliasMap || {};
  const fromKw = uniqTerms([
    ...dropCertTerms(keywords?.secondary || []),
    ...dropCertTerms(keywords?.jdSecondary || []),
    ...dropCertTerms(keywords?.internetSkills || keywords?.marketSkills || []),
  ]);
  const fromReport = dropCertTerms((missingReport && missingReport.extra) || []);
  return dropEligibilityTerms(uniqTerms([...fromKw, ...fromReport]))
    .filter(k => !keywordPresent(k, master, aliasMap));
}

function skillsToInject(missingReport, resumeText) {
  const important = dropEligibilityTerms(dropCertTerms((missingReport && missingReport.important) || []));
  const extra = dropEligibilityTerms(dropCertTerms((missingReport && missingReport.extra) || []));
  const profile = (missingReport && missingReport.candidateProfile) || detectCandidateProfile(resumeText || '');

  // Stay truthful: add JD must-have (primary) skills only — never Stretch-only preferred/secondary/market.
  // Stretch mode: add must-haves + stretch gaps.
  const list = state.mode === 'aggressive'
    ? uniqTerms([...important, ...extra])
    : important;

  return filterTermsForCandidateProfile(list, resumeText || '', profile);
}

/** Scrub Stretch-only tools not on master. Keep JD must-haves that truthful mode intentionally added. */
function scrubSkillsNotOnMaster(resume, masterResume, keywords) {
  const master = String(masterResume || '');
  const text = String(resume || '');
  if (!master || !text || state.mode === 'aggressive') return text;
  const aliasMap = keywords?.aliasMap || {};
  const primary = new Set(
    dropEligibilityTerms(dropCertTerms(uniqTerms([
      ...(keywords?.primary || []),
      ...(keywords?.jdPrimary || []),
    ]))).map(s => String(s).toLowerCase()),
  );
  const stretchTools = uniqTerms([
    ...dropCertTerms(keywords?.secondary || []),
    ...dropCertTerms(keywords?.jdSecondary || []),
    ...dropCertTerms(keywords?.internetSkills || keywords?.marketSkills || []),
    ...filterExtractedSkills(keywords?.atsKeywords || []),
  ]).filter(k => !primary.has(String(k).toLowerCase()));
  const invented = uniqTerms([
    ...skillsMissingFromMaster(stretchTools, master, aliasMap),
    ...stretchTools.filter(isEligibilityTerm),
  ]);
  if (!invented.length) return text;

  const lines = text.split('\n');
  const bounds = skillsSectionBounds(lines);
  if (!bounds) return text;
  const inventLower = invented.map(s => String(s).toLowerCase()).sort((a, b) => b.length - a.length);
  for (let i = bounds.start; i < bounds.end; i++) {
    let line = lines[i];
    if (!line.trim() || isSectionHeader(line)) continue;
    const labelMatch = line.match(/^(\s*[^:]{2,40}:\s*)/);
    const label = labelMatch ? labelMatch[1] : '';
    let body = labelMatch ? line.slice(label.length) : line;
    for (const inv of inventLower) {
      if (inv.length < 3) continue;
      if (primary.has(inv)) continue;
      const re = new RegExp(escapeRegExp(inv).replace(/\s+/g, '\\s+'), 'ig');
      body = body.replace(re, ' ');
    }
    const parts = body.split(/([,;|/])/);
    const kept = [];
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      if (/^[,;|/]$/.test(part)) {
        if (kept.length && !/^[,;|/]$/.test(kept[kept.length - 1])) kept.push(part);
        continue;
      }
      const token = part.trim();
      if (!token) {
        kept.push(part);
        continue;
      }
      const tok = token.toLowerCase();
      if (primary.has(tok)) {
        kept.push(part);
        continue;
      }
      const isInvented = isEligibilityTerm(token)
        || (inventLower.some(inv => tok === inv || (inv.length >= 4 && (tok.includes(inv) || inv.includes(tok))))
          && !keywordPresent(token, master, aliasMap));
      if (!isInvented) kept.push(part);
    }
    let nextBody = kept.join('')
      .replace(/\s*([,;|/])\s*([,;|/])+/g, '$1 ')
      .replace(/^\s*[,;|/]+\s*/, '')
      .replace(/\s*[,;|/]+\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    lines[i] = nextBody ? `${label}${nextBody}` : '';
  }
  return lines.filter((l, idx) => {
    if (idx < bounds.start || idx >= bounds.end) return true;
    if (!String(l).trim()) return true;
    return !/^\s*[^:]{2,40}:\s*$/.test(l);
  }).join('\n');
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function importantHrKeywords(keywords, resumeText) {
  const list = uniqTerms([
    ...dropCertTerms(keywords?.primary || []),
    ...dropCertTerms(keywords?.jdSkills || []),
  ]);
  return filterTermsForCandidateProfile(list, resumeText || '');
}

function isGenericMultiCloudPhrase(term) {
  const t = String(term || '').toLowerCase();
  const hits = [/\baws\b/, /\bazure\b/, /\bgcp\b/, /\bgoogle cloud\b/].filter(re => re.test(t));
  return hits.length >= 2;
}

function summaryKeywordList(keywords, resumeText) {
  const list = dropEligibilityTerms(uniqTerms([
    ...dropCertTerms(keywords?.jdSkills || keywords?.primary || []),
  ])).filter(t => !isGenericMultiCloudPhrase(t));
  const filtered = filterTermsForCandidateProfile(list, resumeText || '');
  const profile = detectCandidateProfile(resumeText || '');
  const primary = profile.primaryCloud;
  const out = [];
  for (const t of filtered) {
    const c = exclusiveCloudOfTerm(t);
    if (c && primary && c !== primary) continue;
    if (c && out.some(x => exclusiveCloudOfTerm(x) && exclusiveCloudOfTerm(x) !== c)) continue;
    out.push(t);
  }
  if (out.length <= 8) return out;
  return out.slice(0, 9);
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

const COMPANY_CLOUD_HINTS = [
  { cloud: 'aws', re: /\b(amazon|aws|amazon\.com|amazon web services)\b/i },
  { cloud: 'azure', re: /\b(microsoft|msft|azure|xbox|linkedin|github|bing)\b/i },
  { cloud: 'gcp', re: /\b(google|alphabet|gcp|google cloud|youtube|waymo)\b/i },
];

function companyPreferredCloud(roleText) {
  const t = String(roleText || '');
  const companyPart = t.split('|')[0] || t;
  for (const hint of COMPANY_CLOUD_HINTS) {
    if (hint.re.test(companyPart) || hint.re.test(t)) return hint.cloud;
  }
  return null;
}

function roleBlockTextOnMaster(roleLine, master) {
  const lines = String(master || '').split('\n');
  const blocks = experienceRoleBlocks(lines);
  if (!blocks.length) return '';
  const key = projectTitleKey(String(roleLine || '').split('|')[0] || roleLine);
  const idx = blocks.findIndex(b => {
    const company = projectTitleKey(String(b.text || '').split('|')[0] || b.text);
    return key && company && (company === key || company.includes(key) || key.includes(company));
  });
  if (idx < 0) return '';
  const end = idx + 1 < blocks.length ? blocks[idx + 1].line : experienceBounds(lines).end;
  return lines.slice(blocks[idx].line, end).join('\n');
}

function cloudsPresentInRole(roleLine, master) {
  const chunk = roleBlockTextOnMaster(roleLine, master);
  if (!chunk) return new Set();
  return cloudsInLine(chunk);
}

function assignCloudsToRoles(roles, profile, master) {
  const evidenced = evidencedCloudList(profile);
  return (roles || []).map(text => {
    const preferred = companyPreferredCloud(text);
    const onRole = cloudsPresentInRole(text, master);
    if (preferred && evidenced.includes(preferred)) {
      return { text, cloud: preferred, cloudLocked: true, reason: 'company' };
    }
    if (onRole.size === 1) {
      const only = [...onRole][0];
      if (evidenced.includes(only)) {
        return { text, cloud: only, cloudLocked: true, reason: 'master-role' };
      }
    }
    if (onRole.size > 1) {
      const ordered = evidenced.filter(c => onRole.has(c));
      if (ordered[0]) {
        return { text, cloud: ordered[0], cloudLocked: true, reason: 'master-role' };
      }
    }
    return { text, cloud: null, cloudLocked: false, reason: '' };
  });
}

function filterTermsForRoleCloud(terms, cloud, roleLine, master) {
  const onRole = roleLine && master ? cloudsPresentInRole(roleLine, master) : new Set();
  return (terms || []).filter(t => {
    const c = exclusiveCloudOfTerm(t);
    if (!c) return true;
    if (cloud) return c === cloud;
    return onRole.has(c);
  });
}

function planExperienceKeywords(resume, keywords) {
  const important = importantHrKeywords(keywords, resume);
  const roles = extractRolesFromResume(resume);
  const profile = detectCandidateProfile(resume);
  const cloudAssign = assignCloudsToRoles(roles, profile, resume);
  if (!roles.length) return [];
  if (!important.length) {
    return cloudAssign.map(a => ({
      text: a.text,
      cloud: a.cloud,
      reason: a.reason,
      terms: [],
    }));
  }
  const ranked = roles.map((text, i) => ({
    text,
    i,
    w: roleTenureWeight(text),
    cloud: cloudAssign[i]?.cloud,
    reason: cloudAssign[i]?.reason,
  }));
  const totalW = ranked.reduce((a, r) => a + r.w, 0) || ranked.length;
  const bags = ranked.map(r => ({ text: r.text, i: r.i, cloud: r.cloud, reason: r.reason, terms: [] }));
  const counts = ranked.map(r => Math.max(1, Math.round(important.length * (r.w / totalW))));
  let diff = important.length - counts.reduce((a, n) => a + n, 0);
  counts[0] = Math.max(1, counts[0] + diff);
  let cursor = 0;
  ranked.forEach((r, idx) => {
    const take = important.slice(cursor, cursor + Math.min(counts[idx], important.length - cursor));
    cursor += take.length;
    bags[idx].terms = uniqTerms(filterTermsForRoleCloud(take, r.cloud, r.text, resume));
  });
  if (cursor < important.length && bags[0]) {
    bags[0].terms = uniqTerms([
      ...bags[0].terms,
      ...filterTermsForRoleCloud(important.slice(cursor), bags[0].cloud, bags[0].text, resume),
    ]);
  }
  return bags.sort((a, b) => a.i - b.i);
}

function formatRoleKeywordPlan(plan) {
  if (!plan.length) return 'Put more important skills in the current role, then earlier companies by years in the role.';
  return plan.map((p, i) => {
    const label = i === 0 ? 'Current / most recent' : `Role ${i + 1}`;
    const cloudName = p.cloud ? (CANDIDATE_STACKS[p.cloud]?.label || p.cloud.toUpperCase()) : '';
    const cloudRule = p.cloud
      ? `If weaving a cloud tool here, use ${cloudName} only${p.reason === 'company' ? ' (employer match)' : p.reason === 'master-role' ? ' (already on this role in the master)' : ''}. Do not invent other clouds for this company.`
      : 'Do not force-add AWS/Azure/GCP tools into this role unless that cloud already appears on this role in the master resume.';
    return `  ${label} — ${p.text}\n    ${cloudRule}\n    Weave only if needed (JD/missing skills): ${p.terms.join(', ') || 'no extra cloud dump — keep existing honest stack'}`;
  }).join('\n');
}

function buildRewritePrompt(jd, resume, keywords, missingReport, scoreUnified) {
  const primary = dropEligibilityTerms(keywords.primary || []);
  const secondary = dropEligibilityTerms(keywords.secondary || []);
  const roles = extractRolesFromResume(resume);
  const headline = currentHeadline();
  const pageTitle = masterExperienceRoleTitle(resume) || headline;
  const aggressive = state.mode === 'aggressive';
  const masterSkills = masterSkillsBlock(resume);
  const candidateProfile = detectCandidateProfile(resume);
  const scoreUnifiedSafe = scoreUnified || state.lastAtsUnified;
  const mustAdd = uniqTerms([
    ...skillsToInject(missingReport, resume),
    ...primarySkillsOnly(scoreUnifiedSafe),
  ]);
  const stretchGaps = stretchOnlyGaps(keywords, resume, missingReport);
  const atsMustAdd = filterAtsPhrasesForCandidate(
    atsPhrasesToInject(missingReport),
    resume,
    candidateProfile,
  );
  // Truthful: ATS phrases from JD are OK; Stretch-only preferred phrases stay out
  const atsAll = filterExtractedSkills(keywords.atsKeywords || [])
    .filter(p => aggressive || !stretchGaps.some(s => String(s).toLowerCase() === String(p).toLowerCase()));
  const summaryKw = summaryKeywordList(keywords, resume);
  const rolePlan = planExperienceKeywords(resume, keywords);
  const extraBlock = extraSectionsPromptBlock(resume);
  const profileBlock = formatCandidateProfileBlock(candidateProfile);
  const scoreReport = formatScoreRuleGapReport(scoreUnifiedSafe);
  const rolePivot = formatRolePivotBlock(jd, resume, keywords);
  const jdContract = formatJdProfileContract(jd, resume, keywords);
  const closeList = formatMandatoryCloseList(scoreUnifiedSafe, mustAdd, atsMustAdd);
  const formatMust = formatMandatoryTemplateBlock(headline, resume);

  const stretchBan = !aggressive
    ? `STRETCH-ONLY — DO NOT ADD (only when Stretch mode is selected):
${(stretchGaps.length ? stretchGaps : secondary).slice(0, 20).map(s => `  - ${s}`).join('\n') || '  - (none listed)'}
These preferred/secondary/market items must stay OFF the page in Stay truthful.`
    : `STRETCH MODE — you MAY add these stack-aligned stretch skills when honest enough to defend:
${mustAdd.filter(s => stretchGaps.some(g => String(g).toLowerCase() === String(s).toLowerCase())).join(', ') || stretchGaps.slice(0, 14).join(', ') || 'none'}`;

  const integrityBlock = aggressive
    ? `STRETCH FOR THE POSTING MODE:
- SUCCESS METRIC: ${SCORE_RULE_NAME} score must be ${SCORE_THRESHOLD}+ / 100. Every missing JD must-have must appear in SKILLS AND at least one EXPERIENCE bullet.
- ADD JD must-have skills AND Stretch-only gaps that fit the candidate stack.
- MUST ADD THESE SKILLS (stack-aligned): ${mustAdd.join(', ') || 'none — already covered'}
- MUST WEAVE THESE JD ATS PHRASES naturally (only if they fit the candidate stack): ${atsMustAdd.join(' · ') || 'none — already covered'}
- Preserve name, contact, companies, PAST job titles, dates, education (past titles stay as on master; Line 2 = most recent EXPERIENCE job title, not the JD title).
- NEVER add certifications that are not in the master resume.
- Do not invent employers, degrees, or job titles.
${stretchBan}`
    : `STAY TRUTHFUL MODE:
- SUCCESS METRIC: ${SCORE_RULE_NAME} score must be ${SCORE_THRESHOLD}+ / 100. Every missing JD must-have must appear in SKILLS AND at least one EXPERIENCE bullet.
- ADD every JD must-have (primary) into SKILLS + EXPERIENCE bullets (exact JD spelling). Skills-only is not enough.
- MUST ADD THESE JD SKILLS (missing entirely — put in Skills AND a work bullet): ${mustAdd.join(', ') || 'none — already covered'}
- MUST WEAVE THESE JD ATS PHRASES naturally: ${atsMustAdd.filter(p => !stretchGaps.some(s => String(s).toLowerCase() === String(p).toLowerCase())).join(' · ') || 'none — already covered'}
- If AWS (or another evidenced cloud) is already on the master, name the JD services on that cloud (e.g. S3) in those bullets. That is tailoring, not a new employer.
- If a must-have is already in Skills (SQL, GCP, …), it MUST also appear in a work bullet.
- Do NOT add Stretch-only / preferred / secondary / market skills unless Stretch mode is selected.
- Do NOT add clearances, DOD Secret, citizenship, or eligibility into SKILLS or SUMMARY.
- Do NOT add certifications. Do not invent employers, degrees, or fake job history.
- Keep companies, PAST titles, dates, education, and ownership language honest. Line 2 = most recent EXPERIENCE job title, not the JD title.
${stretchBan}`;

  return `You are a US full-time resume writer. Rewrite the MASTER resume into the EXACT Anirudh Word template (Calibri, US Letter, 1 page preferred / 2 max). Format is mandatory — same priority as closing score-rule gaps.

${integrityBlock}

${formatMust}

${jdContract}

${rolePivot}

${closeList}

${formatTwentyRulesRewriteBlock()}

${formatAiRubricRewriteTargets()}

SCORE-RULE REPORT (what failed / what we got — close these gaps completely):
${scoreReport}

${profileBlock}

${formatExternalAtsBlock(jd, keywords)}

LOCKED CONTACT — use exactly these formatted values:
${formatLockedContactBlock(resume)}

${formatVerifiedOmitBlock(resume)}

EXPERIENCE TENURE / SUMMARY YEARS:
${formatLockedTenureBlock(resume, frozenMasterResumeJson())}

${roles.length ? `MANDATORY ROLES (${roles.length}) — output all of them:\n${roles.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}` : ''}

${masterSkills ? `MASTER SKILLS LAYOUT — keep these category names and this order of labels. Inside each line, put JD must-have skills FIRST, then remaining honest tools that support this JD. Demote or omit master-only tools from a different career family that are not on this posting:\n${masterSkills}` : ''}

${extraBlock}

ROLE DETECTED: ${(keywords.role && keywords.role.label) || headline || 'from JD'}
LOCKED SKILL SET (${keywords.geminiUsed ? 'Gemini AI' : (keywords.analysisSource || keywords.source || 'rag')}):
  JD must-have (ALWAYS add in Stay truthful + Stretch): ${(keywords.jdPrimary || keywords.jdSkills || primary).join(', ') || 'n/a'}
  Stretch-only / secondary (ONLY if Stretch mode): ${(keywords.jdSecondary || secondary).join(', ') || 'n/a'}
  JD ATS phrases: ${(keywords.atsKeywords || []).join(' · ') || 'n/a'}
  From internet / job boards: ${(keywords.internetSkills || keywords.marketSkills || []).join(', ') || 'n/a'}
  Mode: ${aggressive ? 'STRETCH — include stretch-only gaps' : 'STAY TRUTHFUL — JD must-haves only; stretch-only stay off the page'}.
Apply the 20 US full-time resume rules above. Keep the master's skill category labels. Put JD must-have tools FIRST on each line. Demote off-role master tools. ${aggressive ? 'Also add Stretch-only tools.' : 'Do not add Stretch-only tools.'}
Obey FORMAT IS MANDATORY above exactly — do not invent a different layout.

OUTPUT LAYOUT — match the Anirudh Word template exactly (this is how the downloaded .doc must look):

Line 1: Full Name in Title Case (not ALL CAPS)
Line 2: Most recent EXPERIENCE job title only — ${pageTitle || 'the first job title in EXPERIENCE'}. Do NOT put the JD title here. Never append JD section headings such as "Primary Responsibilities", "Why [Company]?", "Job Description", "Requirements", or "Duties".
${formatContactLineInstruction(resume)}
Line 4: blank
SUMMARY
<one paragraph, 4-6 lines, no bullets. Written for an HR 6-second scan.>
TECHNICAL SKILLS
<COPY the master resume skill categories and their order exactly — same labels, same grouping. Header may be SKILLS if that is what the master uses.>
(Add missing JD technologies into the matching existing line — JD must-haves first on each line.)
(Demote master-only tools from a different career family; do not leave them dominating SKILLS.)
(Do NOT invent a new "Technical Skills:" line unless the master already has one.)
(Do NOT repeat the same skill twice — each tool appears only once across the whole SKILLS section.)
PROFESSIONAL EXPERIENCE
Company | <exact master title> Month YYYY – Month YYYY
(or Company | Location | <exact master title> ... ONLY if that same role already has a location on the master — never invent one)
- Bullet ending with a period.

STOP after PROFESSIONAL EXPERIENCE. Do NOT print EDUCATION, PROJECTS, or CERTIFICATIONS — the app injects those once from verified fields (format only).

${formatVerifiedStaticLockBlock()}

HR SCAN — SUMMARY AND EXPERIENCE (these are what recruiters actually read):
The SUMMARY opens as ${pageTitle || 'the most recent EXPERIENCE job title'} — keep that title. Do not rename the person to ${headline ? headline.split('|')[0].trim() : 'the JD title'}.
SUMMARY must naturally include AT LEAST 8 and AT MOST 9 of these IMPORTANT JD skills, exact spelling:
  ${summaryKw.join(', ') || primary.slice(0, 9).join(', ')}
Do not dump a comma list. Weave them into one readable paragraph that opens with the EXPERIENCE job title (never a number, never the JD title), then the LOCKED SUMMARY YEARS (example: "${pageTitle || 'the experience job title'} with 7+ years of experience" when tenure is 7.2 — never "7.2 years", never "6 years of experience…" first, and never a JD range like "2-5 years").
Write in natural English — a recruiter should hear a career story, not a keyword checklist.
Do NOT put percentages, dollar amounts, ROI figures, or quantified wins in SUMMARY (no "40%", no "$500K", no "valued at…"). Put metrics only in experience bullets.
Do NOT mention H1B, H-1B, visa sponsorship, work authorization, citizenship, or any immigration/eligibility language in SUMMARY — those are posting gates, not professional skills.
Do NOT stuff every secondary/market skill into the summary — only these important ones.
SUMMARY names ONE primary cloud only. Never end with "including AWS, Azure, or GCP" or mix BigQuery with Redshift/S3 in the summary. Other evidenced clouds belong in SKILLS and in separate experience bullets.

EXPERIENCE must keep every real company and date. Place remaining important skills by tenure (current / longer roles get more):
${formatRoleKeywordPlan(rolePlan)}
Weave tools into bullets where the work actually happened — each bullet is action → technology → problem → result.
Older or shorter roles can carry fewer tools and still sound like real work.

ATS PHRASES: weave only phrases that fit the candidate stack. Use the posting's wording when honest — never as a comma dump.
${atsAll.length ? atsAll.map((p, i) => `  ${i + 1}. ${p}`).join('\n') : '  none'}
Still missing from source resume — add these: ${atsMustAdd.join(' · ') || 'none — already covered'}
Spread phrases across roles; do not stack them all in one bullet.

BOLDING: do not wrap words in ** in the output. The dashboard bolds the important JD skills after you write.

ROLE LINE FORMAT (Anirudh template — mandatory):
  Display: Company | real title on the LEFT; Location (only if on the master) | Month YYYY – Present on the RIGHT.
  If the master role HAS a location: Company | Location | <exact master title> Month YYYY – Present
  If the master role has NO location: Company | <exact master title> Month YYYY – Present
  Example with location: Netflix | Los Angeles, CA | Machine Learning Engineer June 2024 – Present
  Example without location: Stripe | Software Engineer September 2024 – Present
  Do NOT invent Remote, a city, a state, or company HQ. Do NOT copy the header city onto a role.
  Do NOT put dates on a second line. Do NOT write Company | Title | Location | Dates.
  Never output the placeholder words "Job Title" or "Month YYYY" — use the real title and dates from the master.

PROJECTS / EDUCATION / CERTIFICATIONS:
- Do not print these sections. The app injects verified fields once after you write (format only — no content changes).

BULLETS:
- Start with hyphen-space "- "
- Action → Technology → Problem → Result
- Each role MUST have 6 or 7 bullets (7 for the current/most recent role, 6-7 for others). Not 4, not 8+.
- 1-2 lines each
- Every bullet ends with a period
- Tight spacing: no blank lines between bullets
- NEVER tack a skill onto the end of a bullet as a comma dump (bad: "...decisions, Tableau." or "...latency, NumPy."). Work each tool into the sentence (good: "Built Tableau dashboards to..." or "...using NumPy to reduce pipeline latency by 30%.").
- NEVER repeat the same verb pattern across bullets. Vary how you weave skills: "using X", "with X", "via X", "through X", "in X". Do NOT use the word "leveraging" or "leveraged" — use natural alternatives instead.

Do NOT use tables, columns, icons, photos, skill bars, or ALL-CAPS name.

CERTIFICATIONS AND EXTRA SECTIONS:
- Do not print EDUCATION, PROJECTS, or CERTIFICATIONS.
- Do not invent certificates, schools, or projects.
- Awards / Volunteer / Languages only if already on the master — once, unchanged facts.

TARGET SCORE: ${SCORE_THRESHOLD}+ / ${SCORE_MAX} on ${SCORE_RULE_NAME} (Push aims for ${SCORE_TARGET}+). Write with the 20 rules so score-rule categories pass.

PRIMARY KEYWORDS / JD MUST-HAVES (add in Stay truthful AND Stretch — SKILLS + SUMMARY + experience): ${primary.join(', ')}
STRETCH-ONLY / SECONDARY (${aggressive ? 'ADD in Stretch mode' : 'DO NOT ADD — Stretch mode only'}): ${secondary.join(', ') || 'none'}

JOB DESCRIPTION:
${jd.slice(0, 7000)}

MASTER RESUME:
${resume}

OUTPUT the resume only. Start with the candidate name on line 1.`;
}

function buildBoostPrompt(jd, resume, sc, keywords) {
  const master = ($('resumeInput') && $('resumeInput').value) || resume;
  const profile = detectCandidateProfile(master);
  const missingP = filterTermsForCandidateProfile(dropCertTerms(sc.keywordsMissing || []), master, profile);
  const missingS = filterTermsForCandidateProfile(dropCertTerms(sc.secondaryMissing || []), master, profile);
  const gaps = stripCertGaps(sc.gaps || []);
  const suggestions = stripCertGaps(sc.improvementSuggestions || []);
  const aggressive = state.mode === 'aggressive';
  const mustAdd = dropEligibilityTerms(
    aggressive ? uniqTerms([...missingP, ...missingS]) : missingP,
  );
  const ats = atsPhraseReport(keywords, resume);
  const atsMissing = filterAtsPhrasesForCandidate(ats.missing, master, profile);
  const summaryKw = summaryKeywordList(keywords, master);
  const rolePlan = planExperienceKeywords(resume, keywords);
  const profileBlock = formatCandidateProfileBlock(profile);
  const scoreUnifiedSafe = { scorecard: sc, ruleScores: sc.ruleScores || {}, atsScore: sc.atsScore };
  return `You are a precision ATS editor. The ${SCORE_RULE_NAME} scored this below ${SCORE_TARGET}/100. Apply the 20 US resume writing rules to raise each weak score-rule category. Output the complete resume. Format is mandatory.

${formatMandatoryTemplateBlock(currentHeadline(), resume)}

${formatJdProfileContract(jd, resume, keywords)}

${formatRolePivotBlock(jd, resume, keywords)}

${formatMandatoryCloseList(scoreUnifiedSafe, mustAdd, atsMissing)}

${formatTwentyRulesRewriteBlock()}

${formatAiRubricRewriteTargets()}

SCORE-RULE REPORT (what still failed — close these completely):
${formatScoreRuleGapReport(scoreUnifiedSafe)}

${formatExternalAtsBlock(jd, keywords)}
${profileBlock}

Mode: ${aggressive ? 'AGGRESSIVE' : 'INTEGRITY / HONEST'}
Preserve name, contact, companies, PAST titles, and dates. Tailor ONLY SUMMARY, SKILLS, and EXPERIENCE.
Do NOT print EDUCATION, PROJECTS, or CERTIFICATIONS — the app injects verified fields once (format only).
Do not invent new schools, projects, or certificates.

${formatVerifiedStaticLockBlock()}

HR SCAN: SUMMARY must contain 8-9 of these important skills (exact spelling) — only stack-aligned tools: ${summaryKw.join(', ') || 'keep current summary stack'}
SUMMARY must start with the most recent EXPERIENCE job title, not a number and not the JD title. Tenure comes after the title (example: "${masterExperienceRoleTitle(master) || 'the experience job title'} with 7+ years of experience" if calculated tenure is 7.2 — never "7.2 years").
${formatLockedTenureBlock(master, frozenMasterResumeJson())}
Write naturally — a career story, not a keyword dump. Never mention H1B, visa sponsorship, work authorization, or citizenship in SUMMARY.
Never put percentages, dollar amounts, or quantified metrics in SUMMARY (no "40%", "$500K", "valued at…"). Keep metrics in experience bullets only.
Never close SUMMARY with "including AWS, Azure, or GCP" or mix BigQuery with Redshift/S3 in that paragraph. Name one primary cloud in SUMMARY; put other evidenced clouds in SKILLS and separate bullets.
Place remaining important skills by company and years:
${formatRoleKeywordPlan(rolePlan)}
Do not bold with **. Do not dump every secondary skill into the summary. Match cloud to employer when evidenced (Microsoft→Azure, Amazon→AWS, Google→GCP). Never put AWS tools on a Microsoft role.

${aggressive
    ? `ADD remaining missing stack-aligned skills from the ATS REPORT (JD must-haves + Stretch-only) into SKILLS and weave each into experience bullets where the work actually happened.`
    : `ADD remaining JD must-have (IMPORTANT/primary) skills into SKILLS and experience. Do NOT add Stretch-only / secondary / preferred tools (Ignition, FactoryLogix, OSHA, clearance, etc.) — those only when Stretch mode is selected.`}

MUST ADD THESE SKILLS (stack-aligned): ${mustAdd.join(', ') || 'none — already covered'}
MUST WEAVE THESE JD ATS PHRASES naturally (only if they fit the candidate stack): ${atsMissing.join(' · ') || 'none — already covered'}

CERTIFICATIONS: never invent certificates. Do not print EDUCATION / PROJECTS / CERTIFICATIONS — injected from verified fields.

MISSING IMPORTANT (PRIMARY / JD must-have — add in Stay truthful): ${missingP.join(', ') || 'none'}
MISSING EXTRA (SECONDARY / STRETCH — ${aggressive ? 'ADD in Stretch mode' : 'DO NOT ADD in Stay truthful'}): ${missingS.join(', ') || 'none'}
MISSING JD ATS PHRASES (${atsMissing.length}/${ats.phrases.length}): ${atsMissing.join(' · ') || 'none'}
CURRENT RULE SCORES (${SCORE_RULE_NAME}): ${JSON.stringify(sc.ruleScores || {})}
POINTS STILL NEEDED: ${Math.max(0, SCORE_TARGET - Number(sc.atsScore || 0))} — raise weak score-rule categories using the 20 writing rules.
Put every skill in MUST ADD into SKILLS and weave into experience bullets using exact spelling — inside the sentence, not tacked on at the end.
Weave each tool into the sentence body — never append a trailing comma skill dump (bad: "...decisions, Tableau.").
NEVER use the word "leveraging" or "leveraged" — use natural alternatives (using, with, via, through, employing). Vary verb patterns across bullets.
If a bullet has no number, add a metric already used elsewhere on this resume (or a modest % / count).
Never break an existing metric — keep full values like "by 40%" intact. Do not write "by 4" or insert skills before a metric clause.
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
  const master = ($('resumeInput') && $('resumeInput').value) || resume;
  const profile = detectCandidateProfile(master);
  const kw = keywords || {};
  const aggressive = state.mode === 'aggressive';
  const pool = uniqTerms([
    ...summaryKeywordList(kw, master),
    ...importantHrKeywords(kw, master),
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
  return sanitizeBoldTerms(filterTermsForCandidateProfile(pool, master, profile), resume);
}

function buildBoldPassPrompt(jd, resume, keywords) {
  const master = ($('resumeInput') && $('resumeInput').value) || resume;
  const important = summaryKeywordList(keywords, master);
  const primary = importantHrKeywords(keywords, master);
  const secondary = dropCertTerms(keywords?.jdSecondary || keywords?.secondary || []);
  const atsPhrases = filterAtsPhrasesForCandidate(
    filterExtractedSkills(keywords?.atsKeywords || []),
    master,
  );
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

async function finalizeBolding(jd, resume, { useGemini = false } = {}) {
  state.boldTerms = [];
  state.boldFinalized = false;
  if (!resume || resume.length < 80) return;
  const pool = buildBoldTermPool(state.keywords || {}, resume);
  const seeded = pool.slice();
  if (!useGemini) {
    state.boldTerms = seeded;
    state.boldFinalized = seeded.length > 0;
    return;
  }
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
  let ruleScores = migrateLegacyRuleScores(parsed.ruleScores || {});
  if (!ruleScores.hardQualifications && !ruleScores.skillsKeywords && parsed.atsScore) {
    ruleScores = fallbackRules({ ...parsed, primary, secondary });
  }
  // Migrate legacy keys if an old cached response slips through
  if (ruleScores.keywordsInExperience != null && parsed.ruleScores?.hardQualifications == null) {
    ruleScores = migrateLegacyRuleScores({
      hardQualifications: Math.min(20, Math.round(Number(parsed.ruleScores?.tenSecond || 0) * 20 / 12)),
      skillsKeywords: Math.min(20, Math.round(Number(parsed.ruleScores?.keywordsInExperience || 0) * 20 / 25)),
      semanticResponsibilityMatch: Math.min(20, Math.round(Number(parsed.ruleScores?.achievementsNotDuties || 0) * 20 / 8)),
      experienceSeniorityMatch: Math.min(10, Math.round(Number(parsed.ruleScores?.tenSecond || 0) * 10 / 12)),
      skillsEvidenceContext: Math.min(10, Number(parsed.ruleScores?.keywordCredibility || 0)),
      achievementsImpact: Math.min(8, Math.round(Number(parsed.ruleScores?.quantified || 0) * 8 / 15)),
      resumeParsingStructure: Math.min(5, Math.round((Number(parsed.ruleScores?.format || 0) + Number(parsed.ruleScores?.structure || 0)) * 5 / 14)),
      recruiterReadability: Math.min(5, Math.round(Number(parsed.ruleScores?.bulletQuality || 0) * 5 / 8)),
      jobTitleAlignment: 1,
    });
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
    ruleScores = clampRuleScores({
      ...ruleScores,
      resumeParsingStructure: Math.min(5, Number(ruleScores.resumeParsingStructure || 0) + Math.min(2, certDropped)),
    });
  }
  const sum = sumRuleScores(ruleScores);
  const atsScore = Math.min(SCORE_MAX, Math.round(sum || 0));
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
  const cov = found / total;
  return clampRuleScores({
    hardQualifications: Math.round(cov * 12 + 4),
    skillsKeywords: Math.round(cov * 20),
    semanticResponsibilityMatch: Math.round(cov * 14 + 2),
    skillsEvidenceContext: Math.min(10, Math.round((metrics / bullets) * 10)),
    experienceSeniorityMatch: 6,
    achievementsImpact: Math.min(8, Math.round((metrics / bullets) * 8)),
    resumeParsingStructure: parsed.formatCheck === 'PASS' ? 5 : 3,
    jobTitleAlignment: 1,
    recruiterReadability: Math.min(5, Math.round((parsed.summaryScore || 8) * 5 / 12)),
  });
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
        items: dedupeSkillList(l.slice(idx + 1).split(',').map(s => s.trim()).filter(Boolean), {}),
      });
    } else {
      other.push(l);
    }
  }
  return { header, cats, other };
}

function normalizeSkillToken(term) {
  return String(term || '').trim().replace(/\s+/g, ' ');
}

function flattenSkillItems(cats) {
  return (cats || []).flatMap(c => c.items || []);
}

function skillAlreadyListed(term, cats, aliasMap) {
  const key = normalizeSkillToken(term);
  if (!key) return true;
  const all = flattenSkillItems(cats);
  const line = all.join(', ');
  if (keywordPresent(key, line, aliasMap)) return true;
  const lower = key.toLowerCase();
  return all.some(item => {
    const i = normalizeSkillToken(item).toLowerCase();
    if (i === lower) return true;
    if (i.length >= 4 && lower.length >= 4 && (i.includes(lower) || lower.includes(i))) return true;
    return false;
  });
}

function dedupeSkillList(items, aliasMap) {
  const out = [];
  for (const raw of items || []) {
    const term = normalizeSkillToken(raw);
    if (!term) continue;
    const line = out.join(', ');
    if (keywordPresent(term, line, aliasMap || {})) continue;
    const lower = term.toLowerCase();
    const nearIdx = out.findIndex(s => {
      const sl = s.toLowerCase();
      return sl !== lower && sl.length >= 4 && lower.length >= 4 && (sl.includes(lower) || lower.includes(sl));
    });
    if (nearIdx >= 0) {
      if (term.length > out[nearIdx].length) out[nearIdx] = term;
      continue;
    }
    if (!out.some(s => s.toLowerCase() === lower)) out.push(term);
  }
  return out;
}

function dedupeSkillCategories(cats, aliasMap) {
  const seen = [];
  for (const cat of cats || []) {
    cat.items = dedupeSkillList(cat.items, aliasMap);
    const next = [];
    for (const item of cat.items) {
      const key = normalizeSkillToken(item);
      const line = [...seen, ...next].join(', ');
      if (keywordPresent(key, line, aliasMap || {})) continue;
      const lower = key.toLowerCase();
      if (seen.some(s => s.toLowerCase() === lower)) continue;
      next.push(item);
    }
    cat.items = next;
    seen.push(...next);
  }
  return cats;
}

function addSkillItem(cats, term, labelRe, aliasMap) {
  const key = normalizeSkillToken(term);
  if (!key || skillAlreadyListed(key, cats, aliasMap)) return;
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

function applyMasterSkills(lines, masterResume, extraTerms, aliasMap) {
  const master = extractSkillCategories(masterResume);
  const extra = dropCertTerms(extraTerms || []);
  const tailored = extractSkillCategories(lines.join('\n'));
  const map = aliasMap || state.keywords?.aliasMap || {};

  if (!master.cats.length && !tailored.cats.length) {
    const bounds = skillsSectionBounds(lines);
    if (!bounds || !extra.length) return lines;
    let target = -1;
    for (let i = bounds.start + 1; i < bounds.end; i++) {
      if (isSkillCategoryLine(lines[i]) || lines[i].trim()) target = i;
    }
    if (target >= 0) {
      const t = lines[target].replace(/\s+$/, '');
      const skillsLine = lines.slice(bounds.start, bounds.end).join('\n');
      const missing = extra.filter(k => !keywordPresent(k, skillsLine, map));
      if (missing.length) {
        const prefix = t.endsWith(',') || t.endsWith(':') ? ' ' : (t.includes(':') ? ' ' : ', ');
        lines[target] = t + prefix + dedupeSkillList(missing, map).join(', ');
      }
    }
    return lines;
  }

  const base = tailored.cats.length ? tailored : master;
  const cats = base.cats.map(c => ({
    label: c.label,
    items: dedupeSkillList([...c.items], map),
  }));

  for (const t of extra) addSkillItem(cats, t, skillBucketRe(t), map);
  dedupeSkillCategories(cats, map);

  const header = (tailored.cats.length ? tailored.header : master.header) || 'SKILLS';
  const other = tailored.cats.length ? tailored.other : master.other;
  const bounds = skillsSectionBounds(lines);
  const block = [header, ...cats.map(c => c.label + ': ' + c.items.join(', ')), ...other];
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

function regexEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termInLine(term, line) {
  return new RegExp(`\\b${regexEscape(term)}\\b`, 'i').test(String(line || ''));
}

function bulletLineParts(line) {
  const m = String(line || '').match(/^(\s*[-•*·◦▸▶]\s+)([\s\S]*)$/);
  if (!m) return null;
  let body = m[2].trim();
  const punct = /[.!?]$/.test(body) ? body.slice(-1) : '.';
  const core = /[.!?]$/.test(body) ? body.slice(0, -1).trim() : body.trim();
  return { mark: m[1], core, punct };
}

function isTrailingKeywordDump(core, pool, aliasMap) {
  const m = String(core || '').match(/^(.+?),\s*([A-Za-z0-9.#+\-/]{2,48})$/);
  if (!m) return null;
  const [, main, tail] = m;
  if (termInLine(tail, main)) return { main: main.trim(), tail };
  const hit = (pool || []).some(k =>
    String(k).toLowerCase() === tail.toLowerCase() || keywordPresent(k, tail, aliasMap)
  );
  return hit ? { main: main.trim(), tail } : null;
}

function hasQuantifiedResult(core) {
  return /\bby\s+[\d,.]+(?:%|percent|x|ms|sec|min|hr|hours?|days?|weeks?|months?|years?)\b/i.test(core)
    || /\b\d+(?:\.\d+)?%\b/.test(core)
    || /\b(reduced|increased|improved|decreased|cut|boosted|grew|saved)\s+(?:by\s+)?\d/i.test(core);
}

function repairBrokenBulletMetrics(line) {
  return line;
}

function weaveTermIntoBullet(line, term, profile) {
  const kw = String(term || '').trim();
  if (!kw || termInLine(kw, line)) return line;
  if (termConflictsWithLine(kw, line, profile?.primaryCloud)) return line;
  const parts = bulletLineParts(line);
  if (!parts) return line;

  let { mark, core, punct } = parts;
  const dump = isTrailingKeywordDump(core, [kw], {});
  if (dump) core = dump.main;

  const tryWeave = () => {
    const toHit = core.match(/^(.+?)(\s+to\s+(?:boost|reduce|improve|enhance|drive|enable|deliver|streamline|cut|increase|support|accelerate|optimize).+)$/i);
    if (toHit && toHit[1].length > 12 && !hasQuantifiedResult(toHit[2])) {
      return `${toHit[1]} with ${kw}${toHit[2]}`;
    }

    const actionHit = core.match(/^((?:Developed|Built|Engineered|Implemented|Designed|Optimized|Automated|Created|Led|Managed|Performed|Deployed|Integrated|Streamlined|Enhanced|Delivered|Established|Utilized|Leveraged|Architected)\w*)[^,]{0,90}?(?=\s+(?:to|by|through|across|for)\s+)/i);
    if (actionHit) {
      const idx = actionHit.index + actionHit[0].length;
      const before = core.slice(0, idx).trim();
      const after = core.slice(idx);
      if (after && !/^using\s/i.test(after)) return `${before} with ${kw} ${after}`;
    }

    if (!hasQuantifiedResult(core)) {
      const words = core.split(/\s+/);
      if (words.length >= 6) {
        words.splice(Math.min(4, words.length - 3), 0, `with ${kw}`);
        return words.join(' ');
      }
    }
    return null;
  };

  const woven = tryWeave();
  if (woven && !/\s+using\s+.+\s+by\s+\d{1,2}$/i.test(woven)) {
    return `${mark}${woven}${punct}`;
  }
  const coreNoEnd = core.replace(/[.]+$/, '');
  if (/\b(using|with|via|through)\s+\S+/i.test(coreNoEnd)) {
    const joined = coreNoEnd.replace(
      /(\b(?:using|with|via|through)\s+[A-Za-z0-9.#+\-/]+(?:\s+and\s+[A-Za-z0-9.#+\-/]+)*)/i,
      `$1 and ${kw}`,
    );
    if (joined !== coreNoEnd) return `${mark}${joined}${punct || '.'}`;
  }
  return `${mark}${coreNoEnd} using ${kw}${punct || '.'}`;
}

function cleanTrailingKeywordDumps(lines, keywords) {
  const pool = uniqTerms([
    ...(keywords?.primary || []),
    ...(keywords?.secondary || []),
    ...(keywords?.jdPrimary || []),
    ...(keywords?.marketSkills || []),
    ...(keywords?.internetSkills || []),
  ]);
  const aliasMap = keywords?.aliasMap || {};
  return lines.map(line => {
    if (!isBulletLine(line)) return line;
    const parts = bulletLineParts(line);
    if (!parts) return line;
    const dump = isTrailingKeywordDump(parts.core, pool, aliasMap);
    if (!dump) return line;
    const stripped = `${parts.mark}${dump.main}${parts.punct}`;
    return weaveTermIntoBullet(stripped, dump.tail, detectCandidateProfile(lines.join('\n')));
  });
}

function appendTermsToLine(line, terms, profile) {
  const missing = (terms || []).filter(Boolean);
  if (!missing.length) return line;
  const safe = missing.filter(t => !termConflictsWithLine(t, line, profile?.primaryCloud));
  if (!safe.length) return line;
  if (isBulletLine(line)) {
    let out = line;
    for (const t of safe) out = weaveTermIntoBullet(out, t, profile);
    return out;
  }
  const trimmed = String(line || '').replace(/\s+$/, '');
  const punct = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : '.';
  const core = /[.!?]$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
  return core + ' using ' + safe.join(', ') + punct;
}

function appendAtsPhraseToLine(line, phrase) {
  const p = String(phrase || '').trim();
  if (!p || atsPhrasePresent(p, line)) return line;
  if (isBulletLine(line)) {
    const parts = bulletLineParts(line);
    if (!parts) return line;
    const woven = parts.core.match(/^(.+?)(\s+to\s+.+)$/i)
      ? `${parts.core.replace(/\s+to\s+/i, `, including ${p}, to `)}`
      : `${parts.core}, supporting ${p}`;
    return `${parts.mark}${woven}${parts.punct}`;
  }
  const trimmed = String(line || '').replace(/\s+$/, '');
  const hasEnd = /[.!?]$/.test(trimmed);
  const punct = hasEnd ? trimmed.slice(-1) : '.';
  const core = hasEnd ? trimmed.slice(0, -1) : trimmed;
  return `${core}, including ${p}${punct}`;
}

function polishResumeForAts(resume, keywords, masterResume) {
  if (!resume) return resume;
  const master = masterResume || resume;
  const profile = detectCandidateProfile(master);
  const primary = dropCertTerms(keywords.primary || []);
  const secondary = dropCertTerms(keywords.secondary || []);
  const aliasMap = keywords.aliasMap || {};
  // Integrity: inject JD must-haves. Stretch: also inject secondary/preferred.
  const rawInject = state.mode === 'aggressive'
    ? uniqTerms([...primary, ...secondary])
    : primary;
  const inject = dropEligibilityTerms(filterTermsForCandidateProfile(rawInject, master, profile));
  let lines = sanitizeResumeHeadline(resume).split('\n');
  const full = () => lines.join('\n');

  const missingAnywhere = inject.filter(k => !keywordPresent(k, full(), aliasMap));
  const skillsBounds = skillsSectionBounds(lines);
  const skillsText = skillsBounds ? lines.slice(skillsBounds.start, skillsBounds.end).join('\n') : '';
  const toSkills = uniqTerms(missingAnywhere.filter(k => !keywordPresent(k, skillsText || full(), aliasMap)));
  lines = applyMasterSkills(lines, master, toSkills, aliasMap);

  const plan = planExperienceKeywords(master, keywords);
  const blocks = experienceRoleBlocks(lines);
  let bulletAdds = 0;
  const maxBulletAdds = 10;
  blocks.forEach((block, i) => {
    const roleCloud = plan[i] && plan[i].cloud;
    const terms = filterTermsForRoleCloud(
      (plan[i] && plan[i].terms) || (i === 0 ? importantHrKeywords(keywords, master) : []),
      roleCloud,
      block.text,
      master,
    );
    const missing = terms.filter(k => !keywordPresent(k, block.bullets.map(idx => lines[idx]).join('\n'), aliasMap));
    let bi = 0;
    for (const kw of missing.slice(0, 3)) {
      if (!block.bullets.length || bulletAdds >= maxBulletAdds) break;
      let placed = false;
      for (let t = 0; t < block.bullets.length && !placed; t++) {
        const idx = block.bullets[(bi + t) % block.bullets.length];
        if (keywordPresent(kw, lines[idx], aliasMap)) continue;
        if (termConflictsWithLine(kw, lines[idx], roleCloud)) continue;
        const next = appendTermsToLine(lines[idx], [kw], profile);
        if (next === lines[idx]) continue;
        lines[idx] = next;
        bulletAdds += 1;
        placed = true;
      }
      bi += 1;
    }
  });

  const expAfter = experienceBounds(lines);
  const expText = lines.slice(expAfter.start, expAfter.end).join('\n');
  const stillMissing = inject.filter(k => !keywordPresent(k, expText, aliasMap));
  let bi = 0;
  for (const kw of stillMissing.slice(0, Math.max(0, maxBulletAdds - bulletAdds))) {
    const termCloud = exclusiveCloudOfTerm(kw);
    const targetBullets = blocks.flatMap((b, i) => {
      const roleCloud = plan[i] && plan[i].cloud;
      if (termCloud) {
        if (roleCloud && termCloud !== roleCloud) return [];
        if (!roleCloud) {
          const onRole = cloudsPresentInRole(b.text, master);
          if (!onRole.has(termCloud)) return [];
        }
      }
      return b.bullets;
    });
    if (!targetBullets.length) continue;
    let placed = false;
    for (let t = 0; t < targetBullets.length && !placed; t++) {
      const idx = targetBullets[(bi + t) % targetBullets.length];
      if (keywordPresent(kw, lines[idx], aliasMap)) continue;
      if (termConflictsWithLine(kw, lines[idx], termCloud || profile.primaryCloud)) continue;
      const next = appendTermsToLine(lines[idx], [kw], profile);
      if (next === lines[idx]) continue;
      lines[idx] = next;
      bulletAdds += 1;
      placed = true;
    }
    bi += 1;
  }

  let missingAts = filterAtsPhrasesForCandidate(
    atsPhraseReport(keywords, lines.join('\n')).missing,
    master,
    profile,
  );
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
        const forSummary = missingAts.splice(0, Math.min(2, Math.ceil(missingAts.length / 4)));
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
    for (const phrase of missingAts.slice(0, 4)) {
      if (!atsBulletIdx.length) break;
      const idx = atsBulletIdx[atsBi % atsBulletIdx.length];
      atsBi += 1;
      lines[idx] = appendAtsPhraseToLine(lines[idx], phrase);
    }
  }

  lines = trimExperienceBullets(lines, 7);
  lines = cleanTrailingKeywordDumps(lines, keywords);
  lines = lines.map(repairBrokenBulletMetrics);
  const joined = restoreExtraSections(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), master);
  return stripEligibilityFromSummary(joined);
}

function calibrateLocalScore(unified) {
  const merged = clampRuleScores(unified.ruleScores || {});
  const atsScore = Math.min(SCORE_MAX, sumRuleScores(merged));
  return { merged, atsScore };
}

function applyTailoredScoreBoost(unified) {
  return calibrateLocalScore(unified);
}

function stableScore(jd, resume, keywords) {
  return scoreWithNinePointRule(jd, resume, {
    resumeJson: state.lastResumeJson,
    jdJson: state.lastJdJson,
    keywords: keywords || state.keywords,
  });
}

function mergeWithLocalScore(jd, resume, geminiUnified, keywords) {
  return stableScore(jd, resume, keywords);
}

function blendAtsScores(localScore, modelScore) {
  // Numeric score is the 9-point rubric only — never blend a second model %.
  return Math.min(SCORE_MAX, Math.max(0, Math.round(Number(localScore) || 0)));
}

/**
 * Score rule A–I: every category is (matched ÷ total checks) × category weight.
 * Transparent coverage — not a vendor ATS prediction.
 */
function coveragePts(matched, total, weight) {
  const t = Math.max(Number(total) || 0, 1);
  const m = Math.max(0, Math.min(t, Number(matched) || 0));
  return Math.max(0, Math.min(weight, Math.round((m / t) * weight)));
}

function sumRuleScores(ruleScores) {
  return RULE_META.reduce((a, m) => a + Math.max(0, Math.min(m.max, Number(ruleScores?.[m.key] || 0))), 0);
}

function clampRuleScores(ruleScores) {
  const out = {};
  for (const m of RULE_META) {
    out[m.key] = Math.max(0, Math.min(m.max, Math.round(Number(ruleScores?.[m.key] || 0))));
  }
  return out;
}

/** Match / donut always equals the visible A–I bars. Never display a leftover total. */
function syncDisplayedAlignmentScore(unified) {
  if (!unified) return unified;
  const bars = clampRuleScores(unified.ruleScores || unified.scorecard?.ruleScores || {});
  const total = Math.min(SCORE_MAX, sumRuleScores(bars));
  unified.ruleScores = bars;
  unified.atsScore = total;
  if (unified.scorecard) {
    unified.scorecard.ruleScores = { ...bars };
    unified.scorecard.atsScore = total;
  }
  return unified;
}

function migrateLegacyRuleScores(rs) {
  const src = rs && typeof rs === 'object' ? { ...rs } : {};
  if (src.skillsKeywords == null && src.requiredTechnicalSkills != null) {
    src.skillsKeywords = src.requiredTechnicalSkills;
  }
  if (src.achievementsImpact == null && src.credibilityDefensibility != null) {
    src.achievementsImpact = Math.min(8, Math.round(Number(src.credibilityDefensibility) * 8 / 5));
  }
  if (src.jobTitleAlignment == null) {
    src.jobTitleAlignment = Math.min(2, Math.round(Number(src.hardQualifications || 0) * 2 / 20));
  }
  return clampRuleScores(src);
}

function roleFamilyFromTitle(title) {
  const t = String(title || '').toLowerCase();
  if (/ai engineer|machine learning|ml engineer|llm|genai|deep learning/.test(t)) return 'ml';
  if (/automation engineer|test automation|\bsdet\b|qa automation|rpa engineer|process automation/.test(t)) return 'automation';
  if (/qa engineer|quality assurance|test engineer/.test(t)) return 'qa';
  if (/data scientist/.test(t)) return 'data-scientist';
  if (/data analyst|bi analyst|business intelligence|analytics analyst/.test(t)) return 'analyst';
  if (/data engineer|big data|data platform|cloud data|spark engineer|etl engineer/.test(t)) return 'data-engineer';
  if (/software engineer|full.?stack|backend|frontend|sde\b/.test(t)) return 'swe';
  if (/devops|sre|platform engineer|site reliability/.test(t)) return 'devops';
  if (/cloud engineer|solutions architect/.test(t)) return 'cloud';
  if (/network engineer|network admin|network technician/.test(t)) return 'network';
  if (/security engineer|security analyst|soc |cybersecurity/.test(t)) return 'security';
  if (/help desk|desktop support|it support|service desk|sysadmin|systems administrator/.test(t)) return 'support';
  if (/business analyst|product owner/.test(t)) return 'ba';
  if (/product manager|program manager|project manager/.test(t)) return 'pm';
  if (/data center|technician/.test(t)) return 'infra';
  return t.split(/\s+/).slice(0, 2).join(' ') || 'other';
}

function isToolDumpBullet(bullet) {
  const b = String(bullet || '');
  return (b.match(/,/g) || []).length >= 4 && b.split(/\s+/).length < 28;
}

function jdRequiresIndustryExperience(jdJson, jdText) {
  const jj = jdJson || {};
  const gateBlob = [
    ...(jj.requirements?.hard_gates || []),
    jj.requirements?.experience,
    ...(jj.requirements?.other || []),
  ].filter(Boolean).join('\n');
  const lines = `${gateBlob}\n${String(jdText || '')}`.split(/\n/).map(l => l.trim()).filter(Boolean);
  const found = [];
  for (const line of lines) {
    if (!INDUSTRY_GATE_RE.test(line)) continue;
    if (/\b(is revolutioniz|leading provider|our mission|we(?:'| a)re hiring|join our team|transforming)\b/i.test(line)) continue;
    if (!/\b(require|must|need|minimum|experience|background|preferred)\b/i.test(line)) continue;
    const m = line.match(INDUSTRY_GATE_RE);
    if (m) found.push(m[0]);
  }
  return uniqTerms(found);
}

function skillEvidenceStrength(skill, bullets, aliasMap) {
  const hits = (bullets || []).filter(b => keywordPresent(skill, b, aliasMap));
  if (!hits.length) return 0;
  const ACTION = /\b(built|developed|designed|implemented|owned|led|created|migrated|orchestrat|optimized|engineered|automated|deployed)\b/i;
  if (hits.some(b => ACTION.test(b) && SCALE_EVIDENCE_RE.test(b))) return 1;
  if (hits.some(b => ACTION.test(b) && !isToolDumpBullet(b))) return 0.75;
  if (hits.every(isToolDumpBullet)) return 0.35;
  return 0.5;
}

function coverageStat(matched, total, weight, pts) {
  const t = Math.max(Number(total) || 0, 1);
  const m = Math.max(0, Math.min(t, Number(matched) || 0));
  const pct = Math.round((m / t) * 100);
  return {
    matched: m,
    total: t,
    missing: Math.max(0, t - m),
    pct,
    weight,
    pts: pts != null ? pts : coveragePts(m, t, weight),
  };
}

function applyScoreRuleFromCoverage(unified) {
  if (!unified) return unified;
  const primary = dropCertTerms(unified.primary || []);
  const sc = { ...(unified.scorecard || {}) };
  const found = listOrEmpty(sc.keywordsFound);
  const missing = listOrEmpty(sc.keywordsMissing);
  const skillsOnly = listOrEmpty(sc.jdSkillsOnly);
  const rj = unified.resumeJson || state.lastResumeJson || null;
  const jj = unified.jdJson || state.lastJdJson || state.keywords?.jdJson || null;
  const text = String(unified.resumeUsed || '');
  const jsonCorpus = rj ? corpusFromResumeJson(rj) : '';
  const resumeLower = (jsonCorpus || text).toLowerCase();
  const expText = rj ? experienceTextFromResumeJson(rj) : text;
  const expLower = String(expText || '').toLowerCase();
  const summary = String(rj?.professional_summary || '').toLowerCase();
  const aliasMap = unified.aliasMap || state.keywords?.aliasMap || {};
  const jdText = String(unified.jdUsed || $('jdInput')?.value || '');

  const inExp = (k) => keywordPresent(k, expText, aliasMap);
  const skillsCorpus = rj ? skillsFromResumeJson(rj).join('\n') : '';
  const inSkills = (k) => skillsCorpus
    ? keywordPresent(k, skillsCorpus, aliasMap)
    : skillsOnly.some(s => String(s).toLowerCase() === String(k).toLowerCase());
  const evidenced = primary.filter(k => inExp(k));
  const bullets = bulletsFromResumeJson(rj);
  const bulletPool = bullets.length ? bullets : String(expText || '').split(/\n/).filter(l => /^[-•*]/.test(String(l).trim()));

  const jdTitle = String(jj?.job_information?.title || unified.title || '').trim();
  const jdYearsNote = jj?.years_of_experience?.note || jj?.requirements?.experience || '';
  const jdEdu = String(jj?.requirements?.education || '').trim();
  const yearsReq = getJdYearsRequirement({
    minYears: jj?.years_of_experience?.minimum,
    maxYears: jj?.years_of_experience?.maximum,
    yearsNote: jdYearsNote,
  }, jdYearsNote);
  const jdYearsMin = yearsReq?.min ?? jj?.years_of_experience?.minimum;
  const jdYearsMax = yearsReq?.max ?? jj?.years_of_experience?.maximum;
  const resumeYears = resumeYearsForAlignment(rj, text);
  const yearsHit = yearsReq
    ? yearsRequirementSatisfied(yearsReq, resumeYears)
      || (resumeYears == null && (/\d+\+?\s*years?/.test(summary) || /\d+\+?\s*years?/.test(resumeLower)))
    : true;
  const eduHit = jdEdu
    ? !!(rj?.education || []).length || /\b(bachelor|master|b\.?s\.?|m\.?s\.?|mba|phd|degree|b\.?tech)\b/i.test(text)
    : true;

  const workAuthText = String(jj?.requirements?.work_authorization || '').trim();
  const workAuthRequired = !!(workAuthText || jj?.eligibility?.us_citizen_required);
  const workAuthHit = !workAuthRequired || !/\b(not authorized|require sponsorship|need sponsorship)\b/i.test(resumeLower);

  const requiredIndustries = jdRequiresIndustryExperience(jj, jdJsonToScoreText(jj));
  const industryHit = !requiredIndustries.length
    || requiredIndustries.some(ind => resumeLower.includes(String(ind).toLowerCase()));

  const aChecks = [];
  const yearsNeed = shortYearsNeed(jdYearsNote, jdYearsMin, jdYearsMax);
  if (jdYearsNote || jdYearsMin) {
    aChecks.push({
      id: 'years',
      ok: !!yearsHit,
      label: yearsHit
        ? (yearsNeed ? `${yearsNeed} is on the resume` : 'Years of experience are listed')
        : (yearsNeed ? `Needs ${yearsNeed} on the resume` : 'Add years of experience to the summary'),
    });
  }
  if (jdEdu) {
    const degreeNeed = shortDegreeNeed(jdEdu);
    aChecks.push({
      id: 'education',
      ok: !!eduHit,
      label: eduHit ? `${degreeNeed || 'Education'} is listed` : `Needs ${degreeNeed || 'education'} on the resume`,
    });
  }
  if (workAuthRequired) {
    aChecks.push({
      id: 'workAuth',
      ok: workAuthHit,
      label: workAuthText || 'US work authorization',
    });
  }
  requiredIndustries.forEach(ind => {
    aChecks.push({
      id: `industry:${ind}`,
      ok: resumeLower.includes(String(ind).toLowerCase()),
      label: `Needs ${ind} experience`,
    });
  });
  if (!aChecks.length) {
    aChecks.push({ id: 'years', ok: !!yearsHit || resumeYears > 0, label: 'Years of experience stated' });
    aChecks.push({ id: 'education', ok: !!(rj?.education || []).length || /\bEDUCATION\b/i.test(text), label: 'Education section' });
  }
  const aMatched = aChecks.filter(c => c.ok).length;
  const ptsA = coveragePts(aMatched, aChecks.length, 20);

  const hardKnockouts = [];
  const elig = jj?.eligibility || {};
  const gateBlob = [...(jj?.requirements?.hard_gates || []), ...(jj?.requirements?.other || [])].join(' ');
  if (elig.clearance_required) {
    const ok = /\b(clearance|secret|ts\/sci|public trust)\b/i.test(resumeLower);
    hardKnockouts.push({
      id: 'clearance',
      ok,
      knockout: true,
      label: 'Security clearance',
      detail: elig.notes?.[0] || 'JD requires clearance — confirm it is evidenced if you hold it',
    });
  }
  if (LICENSE_GATE_RE.test(gateBlob) || LICENSE_GATE_RE.test(jdText)) {
    const ok = LICENSE_GATE_RE.test(resumeLower);
    hardKnockouts.push({
      id: 'license',
      ok,
      knockout: true,
      label: 'Required license',
      detail: 'JD appears to require a license — missing license language can screen you out',
    });
  }
  if (jj?.job_information?.work_mode === 'onsite' && jj?.job_information?.location) {
    hardKnockouts.push({
      id: 'location',
      ok: true,
      knockout: true,
      review: true,
      label: `On-site in ${shortPlace(jj.job_information.location)}`,
      detail: `This job is on-site in ${shortPlace(jj.job_information.location)} — confirm you can work there`,
    });
  }
  const screenOutRisk = hardKnockouts.some(k => k.knockout && k.ok === false);

  // —— B. Skills and keywords (20): skills help; experience is stronger; stuffing does not extra-credit ——
  const bCredits = primary.map(k => {
    if (inExp(k)) {
      const hits = bulletPool.filter(b => keywordPresent(k, b, aliasMap));
      if (hits.length && hits.every(isToolDumpBullet)) return 0.7;
      return 1;
    }
    if (inSkills(k) || skillsOnly.some(s => String(s).toLowerCase() === String(k).toLowerCase())) return 0.45;
    return 0;
  });
  const bMatched = bCredits.reduce((a, n) => a + n, 0);
  const bTotal = Math.max(primary.length, 1);
  const ptsB = coveragePts(bMatched, bTotal, 20);

  const duties = listOrEmpty(jj?.responsibilities);
  const dutyStop = new Set(['with', 'from', 'that', 'this', 'have', 'will', 'your', 'their', 'into', 'using', 'ability', 'strong', 'years', 'experience', 'including', 'related', 'working', 'team', 'role', 'work', 'must', 'should', 'across', 'other', 'such', 'about', 'which', 'and', 'the', 'for']);
  const jdSenior = /\b(senior|lead|principal|staff|manager|architect)\b/i.test(
    [jj?.job_information?.seniority_level, jj?.job_information?.title, jdYearsNote].join(' '),
  );
  const ownershipHit = OWNERSHIP_RE.test(expText);
  const roleCount = (rj?.professional_experience || []).length
    || (text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/gi) || []).length;

  const cChecks = duties.length
    ? duties.map(d => {
      const terms = String(d).toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ').split(/\s+/)
        .filter(w => w.length >= 5 && !dutyStop.has(w));
      const ok = !terms.length
        ? expLower.includes(String(d).toLowerCase().slice(0, 40))
        : terms.filter(t => expLower.includes(t)).length >= Math.max(1, Math.ceil(terms.length * 0.35));
      return {
        ok,
        label: ok ? clipWords(d, 72) : `Does not show: ${clipWords(d, 64)}`,
      };
    })
    : [{ ok: true, label: 'No JD duties listed to mirror' }];
  const cMatched = cChecks.filter(c => c.ok).length;
  const ptsC = coveragePts(cMatched, cChecks.length, 20);

  // —— D. Skill evidence (10) ——
  const dStrengths = primary.map(k => {
    if (inExp(k)) return skillEvidenceStrength(k, bulletPool, aliasMap);
    if (inSkills(k)) return 0.25;
    return 0;
  });
  const dMatched = dStrengths.reduce((a, n) => a + n, 0);
  const ptsD = coveragePts(dMatched, Math.max(primary.length, 1), 10);

  // —— E. Seniority (10) ——
  const jdLevel = String(jj?.job_information?.seniority_level || '').trim() || (jdSenior ? 'senior+' : 'not specified');
  const eChecks = [
    {
      ok: yearsHit,
      label: yearsHit
        ? (yearsNeed ? `${yearsNeed} is listed` : 'Years of experience are listed')
        : (yearsNeed ? `Needs ${yearsNeed} in the summary` : 'Add years of experience to the summary'),
    },
    {
      ok: ownershipHit,
      label: ownershipHit
        ? 'Shows ownership of real work'
        : 'Needs clearer ownership of the work',
    },
    {
      ok: !jdSenior || ownershipHit || /\b(senior|lead|principal|staff|manager|architect|mentor)\b/i.test(text),
      label: !jdSenior
        ? 'This posting is not a senior-only role'
        : (ownershipHit || /\b(senior|lead|staff|mentor)\b/i.test(text)
          ? 'Seniority looks like a fit'
          : 'This posting wants a more senior signal'),
    },
    {
      ok: roleCount >= 2,
      label: roleCount >= 2
        ? `${roleCount} jobs with dates`
        : 'Needs at least two jobs with dates',
    },
  ];
  const eMatched = eChecks.filter(c => c.ok).length;
  const ptsE = coveragePts(eMatched, eChecks.length, 10);

  // —— F. Achievements / impact (8) ——
  const impactBullets = bulletPool.filter(b => IMPACT_VERB_RE.test(b));
  const metricBullets = bulletPool.filter(b => /\d/.test(b));
  const activityOnly = bulletPool.filter(b => /^(responsible for|worked on|assisted with|helped|involved in)\b/i.test(String(b).replace(/^[-•\s]+/, '')));
  const fChecks = [
    {
      ok: bulletPool.length ? (impactBullets.length / bulletPool.length) >= 0.35 : false,
      label: bulletPool.length && (impactBullets.length / bulletPool.length) >= 0.35
        ? `Result language in ${impactBullets.length}/${bulletPool.length} bullets`
        : 'Failed: too few bullets show a result (automated, reduced, improved, reliability)',
    },
    {
      ok: !bulletPool.length || metricBullets.length > 0 || impactBullets.length >= Math.ceil(bulletPool.length * 0.5),
      label: metricBullets.length
        ? `${metricBullets.length} bullets have real numbers (do not invent more)`
        : (impactBullets.length >= Math.ceil((bulletPool.length || 1) * 0.5)
          ? 'Impact language present without forcing metrics'
          : 'Failed: add real results when they exist — never manufacture numbers'),
    },
    {
      ok: !bulletPool.length || (activityOnly.length / bulletPool.length) <= 0.35,
      label: bulletPool.length && (activityOnly.length / bulletPool.length) <= 0.35
        ? 'Most bullets are not “responsible for / worked on”'
        : 'Failed: too many activity-only bullets',
    },
  ];
  const fMatched = fChecks.filter(c => c.ok).length;
  const ptsF = coveragePts(fMatched, fChecks.length, 8);

  // —— G. ATS parseability (5) ——
  const REQUIRED = ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'EDUCATION'];
  const hasSection = (name) => {
    if (name === 'SUMMARY') return !!(rj?.professional_summary) || /\b(SUMMARY|PROFESSIONAL SUMMARY|OBJECTIVE)\b/i.test(text);
    if (name === 'SKILLS') return skillsFromResumeJson(rj || {}).length > 0 || /\b(SKILLS|TECHNICAL SKILLS)\b/i.test(text);
    if (name === 'EXPERIENCE') return (rj?.professional_experience || []).length > 0 || /\b(EXPERIENCE|WORK HISTORY)\b/i.test(text);
    if (name === 'EDUCATION') return (rj?.education || []).length > 0 || /\bEDUCATION\b/i.test(text);
    return false;
  };
  const datedRoles = (rj?.professional_experience || []).filter(j => j.company && j.role && (j.start_date || j.end_date));
  const tableLike = text.split('\n').some(l => l.split('|').length >= 4 && !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|present)\b/i.test(l));
  const gChecks = [
    {
      ok: !!(rj?.professional_summary),
      label: rj?.professional_summary ? 'Summary is present' : 'Missing a summary',
    },
    {
      ok: skillsFromResumeJson(rj || {}).length > 0,
      label: skillsFromResumeJson(rj || {}).length ? 'Skills are listed' : 'Missing a skills list',
    },
    {
      ok: (rj?.professional_experience || []).length > 0,
      label: (rj?.professional_experience || []).length ? 'Work history is present' : 'Missing work history',
    },
    {
      ok: (rj?.education || []).length > 0,
      label: (rj?.education || []).length ? 'Education is listed' : 'Missing education',
    },
    {
      ok: datedRoles.length >= 1,
      label: datedRoles.length >= 1
        ? 'Company, title, and dates are clear'
        : 'Work history needs company, title, and dates',
    },
  ];
  const gMatched = gChecks.filter(c => c.ok).length;
  const ptsG = coveragePts(gMatched, gChecks.length, 5);

  // —— H. Title / role alignment (2) — keep most recent experience title on Line 2 / SUMMARY ——
  const resumeRoles = (rj?.professional_experience || []).map(j => j.role).filter(Boolean);
  const jdFam = roleFamilyFromTitle(jdTitle);
  const resumeFams = resumeRoles.map(roleFamilyFromTitle);
  const summaryFam = roleFamilyFromTitle(summary.slice(0, 80));
  const pageTitle = masterExperienceRoleTitle(
    (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value) || text,
    rj,
  );
  const headerBlob = String(text || '').split('\n').slice(0, 8).join('\n');
  const pageTitleHit = !!(pageTitle && (
    new RegExp('\\b' + (typeof escapeRegExp === 'function' ? escapeRegExp(pageTitle) : pageTitle) + '\\b', 'i').test(summary.slice(0, 120))
    || new RegExp('\\b' + (typeof escapeRegExp === 'function' ? escapeRegExp(pageTitle) : pageTitle) + '\\b', 'i').test(headerBlob)
  ));
  const familyHit = !jdTitle
    || resumeFams.includes(jdFam)
    || summaryFam === jdFam
    || resumeFams.some(f => familiesAligned(f, jdFam))
    || familiesAligned(summaryFam, jdFam)
    || familiesAligned(roleFamilyFromTitle(pageTitle), jdFam);
  const adjacentHit = familyHit || pageTitleHit || resumeFams.some(f => f === jdFam);
  const hTitleChecks = [
    {
      ok: pageTitleHit || familyHit,
      label: pageTitleHit
        ? `Line 2 / SUMMARY keep ${pageTitle}`
        : familyHit
          ? `Reads in the ${jdTitle || 'matching'} family`
          : `Keep Line 2 and SUMMARY as ${pageTitle || 'the most recent experience title'}`,
    },
    {
      ok: adjacentHit || familyHit,
      label: 'Past job titles can stay as they were',
    },
  ];
  const hTitleMatched = hTitleChecks.filter(c => c.ok).length;
  const ptsH = coveragePts(hTitleMatched, hTitleChecks.length, 2);

  // —— I. Recruiter readability (5) — 10-second scan ——
  const companiesVisible = (rj?.professional_experience || []).some(j => j.company)
    || /\b(inc\.|llc|corp|technologies|systems|labs)\b/i.test(text);
  const strongestTech = primary.filter(k => keywordPresent(k, `${rj?.professional_summary || ''}\n${skillsFromResumeJson(rj || {}).join(' ')}`, aliasMap)).length;
  const longBullets = bulletPool.filter(b => String(b).length > 220).length;
  const iChecks = [
    {
      ok: !!(rj?.professional_summary || summary),
      label: (rj?.professional_summary || summary) ? 'Role is stated in the summary' : 'Failed: no summary',
    },
    {
      ok: /\d+\+?\s*years?/.test(summary) || yearsHit,
      label: /\d+\+?\s*years?/.test(summary) || yearsHit ? 'Years of experience are visible' : 'Failed: years not obvious in 10 seconds',
    },
    {
      ok: strongestTech >= Math.min(3, Math.max(primary.length, 1)),
      label: strongestTech >= 3
        ? 'Strongest technologies are visible up top'
        : 'Failed: strongest JD tools are not obvious in summary/skills',
    },
    {
      ok: companiesVisible,
      label: companiesVisible ? 'Where you worked is obvious' : 'Failed: employers are not obvious',
    },
    {
      ok: bulletPool.length ? (longBullets / bulletPool.length) <= 0.35 : false,
      label: bulletPool.length && (longBullets / bulletPool.length) <= 0.35
        ? 'Recent work is scannable'
        : 'Failed: too many long bullets for a 10-second scan',
    },
  ];
  const iMatched = iChecks.filter(c => c.ok).length;
  const ptsI = coveragePts(iMatched, iChecks.length, 5);

  const withFailed = (stat, checks) => ({
    ...stat,
    checks,
    failed: (checks || []).filter(c => !c.ok).map(c => c.label),
    passed: (checks || []).filter(c => c.ok).map(c => c.label),
  });

  const bFailed = [
    ...missing.slice(0, 10).map(s => `Failed: must-have missing — ${s}`),
    ...skillsOnly.slice(0, 8).map(s => `Partial: Skills only (experience would be stronger) — ${s}`),
  ].slice(0, 14);
  const dFailed = primary.map((k, idx) => {
    const w = dStrengths[idx];
    if (w >= 0.75) return null;
    if (w === 0) return `Failed: not on resume — ${k}`;
    if (w <= 0.25) return `Weak: listed only — ${k}`;
    if (w <= 0.5) return `Partial: mentioned without action/scale — ${k}`;
    return `Partial: used in work but thin context — ${k}`;
  }).filter(Boolean).slice(0, 14);

  const coverage = {
    hardQualifications: withFailed(coverageStat(aMatched, aChecks.length, 20, ptsA), aChecks.map(c => ({
      ...c,
      label: c.ok ? `Pass: ${c.label}` : `Failed: ${c.label}`,
    }))),
    skillsKeywords: {
      ...coverageStat(bMatched, bTotal, 20, ptsB),
      failed: bFailed,
      passed: evidenced.slice(0, 10).map(s => `Pass: in experience — ${s}`),
    },
    semanticResponsibilityMatch: withFailed(coverageStat(cMatched, cChecks.length, 20, ptsC), cChecks),
    skillsEvidenceContext: {
      ...coverageStat(dMatched, Math.max(primary.length, 1), 10, ptsD),
      failed: dFailed,
      passed: primary.filter((_, i) => dStrengths[i] >= 0.75).slice(0, 10).map(s => `Pass: strong evidence — ${s}`),
    },
    experienceSeniorityMatch: withFailed(coverageStat(eMatched, eChecks.length, 10, ptsE), eChecks),
    achievementsImpact: withFailed(coverageStat(fMatched, fChecks.length, 8, ptsF), fChecks),
    resumeParsingStructure: withFailed(coverageStat(gMatched, gChecks.length, 5, ptsG), gChecks),
    jobTitleAlignment: withFailed(coverageStat(hTitleMatched, hTitleChecks.length, 2, ptsH), hTitleChecks),
    recruiterReadability: withFailed(coverageStat(iMatched, iChecks.length, 5, ptsI), iChecks),
  };

  const ruleScores = clampRuleScores({
    hardQualifications: ptsA,
    skillsKeywords: ptsB,
    semanticResponsibilityMatch: ptsC,
    skillsEvidenceContext: ptsD,
    experienceSeniorityMatch: ptsE,
    achievementsImpact: ptsF,
    resumeParsingStructure: ptsG,
    jobTitleAlignment: ptsH,
    recruiterReadability: ptsI,
  });
  const atsScore = Math.min(SCORE_MAX, sumRuleScores(ruleScores));
  const credibilitySoft = skillsOnly.length >= 2 || (skillsOnly.length >= 1 && evidenced.length < Math.ceil(primary.length * 0.7));

  sc.keywordMatch = evidenced.length;
  sc.skillCoverageFound = Math.round(bMatched);
  sc.skillCoverageTotal = bTotal;
  sc.skillCoverageMissing = Math.max(0, bTotal - bMatched);
  sc.skillCoveragePct = Math.round((bMatched / bTotal) * 100);
  sc.coverage = coverage;
  sc.ruleScores = { ...ruleScores };
  sc.atsScore = atsScore;
  sc.scoreRule = SCORE_RULE_NAME;
  sc.credibilitySoft = credibilitySoft;
  sc.hardKnockouts = hardKnockouts;
  sc.screenOutRisk = screenOutRisk;
  sc.scoreInterpretation = SCORE_INTERPRETATION;
  sc.tenSecondTest = unified.tenSecondTest || sc.tenSecondTest;
  sc.jsonScore = !!rj && !!jj;
  sc.confidenceReason = screenOutRisk
    ? `Alignment ${atsScore}/100 from the 9-point rubric, but a hard gate can still screen you out. ${SCORE_INTERPRETATION}`
    : (credibilitySoft
      ? `9-point JD alignment. ${skillsOnly.length} must-have(s) are Skills-only — that already lowers Skills/evidence points. ${SCORE_INTERPRETATION}`
      : `9-point JD alignment: A–I sum only. Not an ATS vendor prediction.`);

  return syncDisplayedAlignmentScore({
    ...unified,
    ruleScores,
    atsScore,
    scorecard: sc,
  });
}

function reconcileKeywordPresence(unified, resume, resumeJson) {
  if (!unified) return unified;
  const text = String(resume || unified.resumeUsed || '');
  const rj = resumeJson || unified.resumeJson || state.lastResumeJson || null;
  const primary = dropCertTerms(unified.primary || state.keywords?.primary || []);
  const secondary = dropCertTerms(unified.secondary || state.keywords?.secondary || []);
  const aliasMap = unified.aliasMap || state.keywords?.aliasMap || {};

  const skillsCorpus = rj ? skillsFromResumeJson(rj).join('\n') : '';
  const expCorpus = rj ? experienceTextFromResumeJson(rj) : '';
  const fullCorpus = rj ? corpusFromResumeJson(rj) : text;

  const present = (k) => keywordPresent(k, fullCorpus, aliasMap);
  const inSkills = (k) => skillsCorpus
    ? keywordPresent(k, skillsCorpus, aliasMap)
    : false;
  const inExperience = (k) => expCorpus
    ? keywordPresent(k, expCorpus, aliasMap)
    : keywordPresent(k, text, aliasMap);

  const keywordsFound = primary.filter(present);
  const keywordsMissing = primary.filter(k => !present(k));
  const secondaryFound = secondary.filter(present);
  const secondaryMissing = secondary.filter(k => !present(k));

  let jdSkillsOnly = [];
  if (rj && skillsCorpus) {
    jdSkillsOnly = uniqTerms([
      ...keywordsFound.filter(k => inSkills(k) && !inExperience(k)),
      ...secondaryFound.filter(k => inSkills(k) && !inExperience(k)),
    ]);
  }

  // Also flag tailored Skills tools that are on the JD but not on the master (invented preferred platforms).
  const masterText = ($('resumeInput') && $('resumeInput').value) || '';
  let inventedSkills = [];
  if (masterText && skillsCorpus) {
    const jdTools = uniqTerms([...primary, ...secondary]);
    inventedSkills = jdTools.filter(k =>
      inSkills(k) && !keywordPresent(k, masterText, aliasMap)
    );
    jdSkillsOnly = uniqTerms([...jdSkillsOnly, ...inventedSkills]);
  }

  const sc = { ...(unified.scorecard || {}) };
  sc.keywordsFound = keywordsFound;
  sc.keywordsMissing = keywordsMissing;
  sc.secondaryFound = secondaryFound;
  sc.secondaryMissing = secondaryMissing;
  sc.jdSkillsOnly = jdSkillsOnly;
  sc.inventedSkills = inventedSkills;
  sc.keywordMatch = keywordsFound.length;

  return applyScoreRuleFromCoverage({
    ...unified,
    primary,
    secondary,
    aliasMap,
    scorecard: sc,
    resumeUsed: text,
    resumeJson: rj || unified.resumeJson || null,
    jdJson: unified.jdJson || state.lastJdJson || state.keywords?.jdJson || null,
  });
}

function mergeExternalAndLocal(local, gemini) {
  const resumeText = local.resumeUsed || gemini?.resumeUsed || '';
  const jdText = jdJsonToScoreText(local.jdJson || gemini?.jdJson || state.lastJdJson) || '';
  const unified = scoreWithNinePointRule(jdText, resumeText, {
    resumeJson: local.resumeJson || gemini?.resumeJson,
    jdJson: local.jdJson || gemini?.jdJson || state.lastJdJson,
    keywords: state.keywords,
  });
  if (!gemini) return unified;
  const gaps = stripCertGaps(uniqTerms([
    ...(gemini.scorecard?.gaps || []),
    ...(local.scorecard?.gaps || []),
    ...(unified.scorecard?.gaps || []),
  ]));
  const suggestions = stripCertGaps(uniqTerms([
    ...(gemini.scorecard?.improvementSuggestions || []),
    ...(local.scorecard?.improvementSuggestions || []),
    ...(unified.scorecard?.improvementSuggestions || []),
  ]));
  unified.scorecard = {
    ...unified.scorecard,
    gaps,
    improvementSuggestions: suggestions,
  };
  unified.source = 'nine-point';
  return unified;
}

async function analyzeJdAndResume(jd, resume) {
  const raw = await callGemini(buildUnderstandingPrompt(jd, resume), { json: true, maxTokens: 3500 });
  const parsed = parseJsonLoose(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Understanding pass returned empty analysis');
  return parsed;
}

function enrichKeywordsFromUnderstanding(keywords, understanding) {
  if (!keywords || !understanding) return keywords;
  // Only JD-side tools from understanding — never fold internet/market lists into scoring keys.
  const primary = dropCertTerms(understanding.primary || []);
  const secondary = dropCertTerms(understanding.secondary || []);
  if (!primary.length && !secondary.length) return keywords;
  const next = { ...keywords };
  if (primary.length) {
    next.jdPrimary = uniqTerms([...(keywords.jdPrimary || keywords.primary || []), ...primary]).slice(0, 14);
    next.jdSkills = next.jdPrimary;
    next.primary = next.jdPrimary;
  }
  if (secondary.length) {
    next.jdSecondary = uniqTerms([...(keywords.jdSecondary || []), ...secondary])
      .filter(s => !(next.primary || []).some(p => p.toLowerCase() === String(s).toLowerCase()))
      .slice(0, 14);
    next.secondary = next.jdSecondary;
  }
  if (understanding.roleTitle) {
    next.title = understanding.roleTitle;
    if (next.role) next.role = { ...next.role, label: understanding.roleTitle, title: understanding.roleTitle };
  }
  const scored = keywordsForScoring(next);
  next.primary = scored.primary;
  next.secondary = scored.secondary;
  next.aliasMap = scored.aliasMap;
  return next;
}

/**
 * 1) Parse resume → structured JSON (jsonresume schema)
 * 2) AI understands JD + resume JSON/text
 * 3) Score with the 100-point JD-alignment rubric only
 * Never polish/inject skills before scoring — that fakes "on the page" hits.
 */
async function scoreWithUnderstandingAndAiRubric(jd, resume) {
  const text = String(resume || '');
  const masterPaste = (typeof $ === 'function' && $('resumeInput') && $('resumeInput').value) || '';
  const scoringMaster = !!(masterPaste && text.trim() === String(masterPaste).trim());
  // Gemini JSON convert — silent (no loader convert copy, no UI dump)
  let resumeJson = scoringMaster ? (verifiedResumeJson() || state.masterResumeJson || null) : null;
  let jdJson = state.lastJdJson;
  try {
    const tasks = [];
    if (!resumeJson) tasks.push(parseResumeToJson(text).then(r => { resumeJson = r; }));
    if (!jdJson) tasks.push(parseJdToJson(jd).then(j => { jdJson = j; }));
    if (tasks.length) await Promise.all(tasks);
  } catch {
    resumeJson = resumeJson || parseResumeToJsonLocal(text);
    jdJson = jdJson || parseJdToJsonLocal(jd);
  }
  state.lastResumeJson = resumeJson;
  state.lastJdJson = jdJson;
  if (scoringMaster && !verifiedResumeJson()) state.masterResumeJson = resumeJson;

  let understanding = null;
  try {
    updateAiProcessing('Analysing resume and job description…');
    understanding = await analyzeJdAndResume(jd, text);
    state.lastUnderstanding = understanding;
    if (state.keywords) {
      state.keywords = enrichKeywordsFromUnderstanding(state.keywords, understanding);
    }
  } catch (err) {
    state.lastUnderstanding = null;
    understanding = null;
    console.warn('Understanding pass failed:', err);
  }

  updateAiProcessing(`Scoring with the 9-point ${SCORE_RULE_NAME}…`);
  const unified = scoreWithNinePointRule(jd, text, {
    resumeJson,
    jdJson,
    keywords: state.keywords || {},
  });
  unified.understanding = understanding;
  unified.source = 'nine-point';
  if (unified.scorecard) {
    unified.scorecard.understandingUsed = !!understanding;
    unified.scorecard.resumeJsonUsed = !!resumeJson;
    unified.scorecard.jdJsonUsed = !!jdJson;
    unified.scorecard.scoreRule = SCORE_RULE_NAME;
  }
  return { unified, resume: text, understanding, resumeJson };
}

async function scoreTailoredResume(jd, resume, { verifyExternal = false, withUnderstanding = false } = {}) {
  const text = String(resume || '');
  if (withUnderstanding || verifyExternal) {
    return scoreWithUnderstandingAndAiRubric(jd, text);
  }
  return scoreDraftWithScoreRule(jd, text, { structureWithGemini: true });
}

async function scoreWithGemini(jd, resume, { keepKeywords = false, understanding = null } = {}) {
  const locked = keepKeywords && state.keywords?.primary?.length
    ? keywordsForScoring(state.keywords)
    : null;
  const raw = await callGemini(
    buildScorePrompt(jd, resume, locked, understanding || state.lastUnderstanding || null),
    { json: true, maxTokens: 2500 },
  );
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
  cleaned.jdJson = keywords.jdJson || state.lastJdJson || null;
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
  // Score already locked JD skills — do not re-run Gemini JD analysis / market research.
  if (state.keywords?.primary?.length && state.kwHash === h) {
    ensureAliasMap(state.keywords);
    state.keywords._mode = state.mode;
    if (state.lastJdJson) state.keywords.jdJson = state.lastJdJson;
    if (!state.keywords.eligibility) {
      state.keywords.eligibility = mergeEligibility(null, extractLocalEligibilityFromJd(jd));
    }
    return state.keywords;
  }
  if (state.lastJdJson && state.kwHash === h) {
    const fromScore = keywordsFromJdJson(state.lastJdJson);
    fromScore._mode = state.mode;
    cacheKeywords(jd, fromScore, cacheKey);
    return state.keywords;
  }
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
    resumeJson: unified.resumeJson || null,
    jdJson: unified.jdJson || null,
    scorecard: {
      ...sc,
      keywordsFound: [...(sc.keywordsFound || [])],
      keywordsMissing: [...(sc.keywordsMissing || [])],
      secondaryFound: [...(sc.secondaryFound || [])],
      secondaryMissing: [...(sc.secondaryMissing || [])],
      jdSkillsOnly: [...(sc.jdSkillsOnly || [])],
      gaps: [...(sc.gaps || [])],
      tenSecondTest: { ...(sc.tenSecondTest || {}) },
      coverage: sc.coverage || null,
      ruleScores: { ...(unified.ruleScores || sc.ruleScores || {}) },
    },
  };
}

function packedScoreUnified(snap, fallback) {
  if (!snap) return null;
  return {
    ...snap,
    atsScore: Number(snap.atsScore || 0),
    ruleScores: snap.ruleScores || snap.scorecard?.ruleScores || {},
    scorecard: snap.scorecard || {},
    primary: snap.primary || fallback?.primary || [],
    secondary: snap.secondary || fallback?.secondary || [],
    jdJson: snap.jdJson || fallback?.jdJson || state.lastJdJson,
    resumeJson: snap.resumeJson || fallback?.resumeJson || null,
  };
}

function scoreHue(score) {
  const n = Number(score) || 0;
  if (n >= SCORE_THRESHOLD) return '#16a34a';
  if (n >= 70) return '#d97706';
  return '#e11d48';
}

function formatMatchToast(unified) {
  const score = Number(unified?.atsScore || 0);
  const screenOut = !!(unified?.scorecard?.screenOutRisk);
  const skillsOnly = listOrEmpty(unified?.scorecard?.jdSkillsOnly);
  if (screenOut) {
    return `9-point alignment ${score}/${SCORE_MAX} — hard-gate screen-out risk.`;
  }
  if (skillsOnly.length) {
    return `9-point alignment ${score}/${SCORE_MAX} — ${skillsOnly.length} Skills-only must-have(s) already lower B/D.`;
  }
  if (score >= SCORE_TARGET) return `9-point alignment ${score}/${SCORE_MAX}`;
  if (score >= SCORE_THRESHOLD) return `9-point alignment ${score}/${SCORE_MAX} — Push toward ${SCORE_TARGET}+`;
  return `9-point alignment ${score}/${SCORE_MAX} — raise weak A–I categories`;
}

function renderHardKnockoutBanner(sc) {
  const knocks = (sc?.hardKnockouts || []).filter(k => k && typeof k === 'object' && (k.ok === false || k.review));
  if (!knocks.length && !sc?.screenOutRisk) return '';
  const fails = knocks.filter(k => k.ok === false);
  const reviews = knocks.filter(k => k.review && k.ok !== false);
  if (!fails.length && !reviews.length && !sc.screenOutRisk) return '';
  const gateName = (k) => {
    if (k.id === 'location') return k.label || 'on-site work';
    if (k.id === 'clearance') return 'a security clearance';
    if (k.id === 'license') return 'a required license';
    return humanizeScoreLine(k.label) || k.label;
  };
  if (fails.length) {
    return `<div class="gate-banner gate-fail">
      <strong>Must-have missing</strong>
      <p>${escapeHtml(fails.map(gateName).join(' · '))}. A high match score will not get you past this.</p>
    </div>`;
  }
  return `<div class="gate-banner gate-review">
    <strong>Confirm before you apply</strong>
    <p>${escapeHtml(reviews.map(k => k.detail || gateName(k)).join(' · '))}</p>
  </div>`;
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

function listOrEmpty(arr) {
  return (arr || []).map(x => String(x || '').trim()).filter(Boolean);
}

function buildAiCategoryDetails(unified) {
  const sc = unified?.scorecard || {};
  const scores = unified?.ruleScores || sc.ruleScores || {};
  const u = unified?.understanding || state.lastUnderstanding || {};
  const missP = scoredSkillTerms(sc.keywordsMissing);
  const foundP = scoredSkillTerms(sc.keywordsFound);
  const skillsOnly = scoredSkillTerms(sc.jdSkillsOnly);
  const jdJson = unified?.jdJson || state.lastJdJson || state.keywords?.jdJson || null;
  const resumeJson = unified?.resumeJson || state.lastResumeJson || null;
  const jdTitle = jdJson?.job_information?.title || unified?.title || '';
  const jdYears = jdJson?.years_of_experience?.note || jdJson?.years_of_experience?.minimum || '';
  const jdEdu = jdJson?.requirements?.education || '';
  const resumeSummary = String(resumeJson?.professional_summary || '').toLowerCase();
  const resumeYearsHit = resumeSummary && jdYears
    ? /\d+\+?\s*years?/.test(resumeSummary)
    : null;
  const titleOnResume = jdTitle
    ? (resumeSummary.includes(String(jdTitle).toLowerCase())
      || (resumeJson?.professional_experience || []).some(j => String(j.role || '').toLowerCase().includes(String(jdTitle).toLowerCase().split(/\s+/)[0] || '')))
    : null;
  const hard = u.hardQualifications || {};
  const resp = u.responsibilities || {};
  const senior = u.seniority || {};
  const domain = u.requiredIndustry || u.domain || {};
  const knockouts = (sc.hardKnockouts || []).filter(k => k && typeof k === 'object');
  const fmtIssues = listOrEmpty(sc.formatIssues);
  const missingSections = listOrEmpty(sc.missingSections);
  const jdDuties = listOrEmpty(jdJson?.responsibilities).length
    ? listOrEmpty(jdJson.responsibilities)
    : listOrEmpty(resp.jdDuties);

  const cov = sc.coverage || {};
  const failedOf = (key) => humanLines(cov[key]?.failed);
  const passedOf = (key) => humanLines(cov[key]?.passed);
  const yearsNeed = shortYearsNeed(jdYears, jdJson?.years_of_experience?.minimum, jdJson?.years_of_experience?.maximum);
  const degreeNeed = shortDegreeNeed(jdEdu);
  const industryMiss = failedOf('hardQualifications').filter(f => /experience$/i.test(f) || /^Needs /i.test(f));

  const byKey = {
    hardQualifications: {
      failed: [
        ...failedOf('hardQualifications'),
        ...knockouts.filter(k => !k.ok).map(k => k.label || k.detail),
      ],
      findings: [
        ...passedOf('hardQualifications').slice(0, 6),
        ...knockouts.filter(k => k.review && k.ok !== false).map(k => k.detail || k.label),
      ],
      improvements: uniqTerms([
        industryMiss.length ? 'Add that industry experience only if you actually have it.' : null,
        resumeYearsHit === false && yearsNeed ? `Put “${yearsNeed}” in the summary if it is true.` : null,
        jdEdu && Number(scores.hardQualifications || 0) < 14 ? `Keep ${degreeNeed || 'your degree'} easy to see.` : null,
        ...knockouts.filter(k => !k.ok).map(k => k.detail || k.label),
      ].filter(Boolean)).slice(0, 4),
    },
    skillsKeywords: {
      failed: uniqTerms([
        ...missP.map(s => `Missing: ${s}`),
        ...skillsOnly.map(s => `In Skills only: ${s}`),
      ]).slice(0, 12),
      findings: foundP
        .filter(s => !skillsOnly.some(x => String(x).toLowerCase() === String(s).toLowerCase()))
        .slice(0, 8),
      improvements: uniqTerms([
        ...skillsOnly.slice(0, 5).map(s => `Put ${s} in a work bullet — Skills only does not count.`),
        ...missP.slice(0, 5).map(s => `Add ${s} to Skills and a work bullet (JD must-have).`),
        !missP.length && !skillsOnly.length ? 'Keep the important tools visible in both Skills and work history.' : null,
      ].filter(Boolean)).slice(0, 6),
    },
    semanticResponsibilityMatch: {
      failed: failedOf('semanticResponsibilityMatch'),
      findings: passedOf('semanticResponsibilityMatch').slice(0, 6),
      improvements: uniqTerms([
        ...failedOf('semanticResponsibilityMatch').slice(0, 4).map(f =>
          `Add a work bullet for: ${String(f).replace(/^Does not show:\s*/i, '')}`),
        jdTitle ? `Write the page for the ${jdTitle} job. Keep older work only when it overlaps.` : null,
      ].filter(Boolean)).slice(0, 5),
    },
    skillsEvidenceContext: {
      failed: failedOf('skillsEvidenceContext').length
        ? failedOf('skillsEvidenceContext')
        : [
          ...missP.map(s => `Missing: ${s}`),
          ...skillsOnly.map(s => `Listed only: ${s}`),
        ].slice(0, 12),
      findings: passedOf('skillsEvidenceContext').length
        ? passedOf('skillsEvidenceContext')
        : [],
      improvements: uniqTerms([
        ...skillsOnly.slice(0, 5).map(s => `Describe how you used ${s} in a work bullet — do not invent numbers.`),
        ...missP.slice(0, 3).map(s => `Add ${s} into an existing stack-aligned bullet (JD must-have).`),
      ].filter(Boolean)).slice(0, 6),
    },
    experienceSeniorityMatch: {
      failed: failedOf('experienceSeniorityMatch'),
      findings: passedOf('experienceSeniorityMatch'),
      improvements: uniqTerms([
        ...failedOf('experienceSeniorityMatch').map(f => {
          if (/years/i.test(f)) return yearsNeed
            ? `Put “${yearsNeed}” in the summary if it is true.`
            : 'Put your years of experience in the summary.';
          if (/ownership|production|decision/i.test(f))
            return 'Show work you owned, production systems, or decisions you made.';
          if (/role|depth|date/i.test(f))
            return 'Show at least two jobs with dates so growth is obvious.';
          return f;
        }),
        !failedOf('experienceSeniorityMatch').length
          ? 'Seniority already looks clear.'
          : null,
      ].filter(Boolean)).slice(0, 4),
    },
    achievementsImpact: {
      failed: failedOf('achievementsImpact'),
      findings: uniqTerms([
        ...passedOf('achievementsImpact'),
        Number(sc.bulletsWithMetrics || 0)
          ? `${sc.bulletsWithMetrics} bullets already have numbers`
          : 'No numbers yet — that is fine if you do not invent them',
      ]),
      improvements: uniqTerms([
        'Say what changed: faster, fewer errors, more reliable, people helped.',
        'Add a number only if it is already true on your source resume.',
      ]),
    },
    resumeParsingStructure: {
      failed: failedOf('resumeParsingStructure').length
        ? failedOf('resumeParsingStructure')
        : missingSections.map(s => `Missing ${s}`),
      findings: passedOf('resumeParsingStructure'),
      improvements: uniqTerms([
        ...missingSections.map(s => `Add a clear ${s} section.`),
        'Keep one simple column: name, title, summary, skills, work, education.',
      ]),
    },
    jobTitleAlignment: {
      failed: failedOf('jobTitleAlignment'),
      findings: passedOf('jobTitleAlignment'),
      improvements: uniqTerms([
        'Do not rename old jobs to copy this posting.',
        'Keep Line 2 and SUMMARY as the most recent EXPERIENCE job title — do not put the JD title there.',
      ].filter(Boolean)),
    },
    recruiterReadability: {
      failed: failedOf('recruiterReadability'),
      findings: passedOf('recruiterReadability'),
      improvements: uniqTerms([
        Number(scores.recruiterReadability || 0) < 4
          ? 'Open with the most recent experience job title, years, and main tools.'
          : 'Keep the top of the page showing role, years, tools, and employers.',
      ].filter(Boolean)),
    },
  };

  const out = {};
  for (const meta of RULE_META) {
    const val = Number(scores[meta.key] || 0);
    const pack = byKey[meta.key] || { findings: [], improvements: [], failed: [] };
    const ratio = val / Math.max(meta.max, 1);
    out[meta.key] = {
      key: meta.key,
      letter: meta.letter,
      label: meta.label,
      score: val,
      max: meta.max,
      status: ratio >= 0.85 ? 'ok' : ratio >= 0.55 ? 'mid' : 'bad',
      statusLabel: ratio >= 0.85 ? 'Strong' : ratio >= 0.55 ? 'Close' : 'Needs work',
      failed: listOrEmpty(pack.failed),
      findings: listOrEmpty(pack.findings),
      improvements: listOrEmpty(pack.improvements),
      // keep legacy keys empty for any old callers
      missing: [],
      found: [],
      tips: listOrEmpty(pack.improvements),
    };
  }
  return out;
}

function defaultAiCategoryKey(details) {
  if (state.selectedAiCategory && details[state.selectedAiCategory]) return state.selectedAiCategory;
  const weak = RULE_META.find(m => details[m.key] && details[m.key].status !== 'ok');
  return (weak && weak.key) || RULE_META[0].key;
}

function formatScoreRuleDetailHtml(d) {
  if (!d) return '';
  const failed = humanLines(d.failed);
  const subjectOf = (s) => String(s || '')
    .replace(/^(missing|listed only|in skills only|needs a real work example|needs a stronger example):\s*/i, '')
    .replace(/\s+is shown in work history$/i, '')
    .trim()
    .toLowerCase();
  const failedSubjects = new Set(failed.map(subjectOf).filter(Boolean));
  const findings = humanLines(d.findings).filter(f => {
    const sub = subjectOf(f);
    if (failed.some(x => x.toLowerCase() === f.toLowerCase())) return false;
    if (sub && failedSubjects.has(sub)) return false;
    return true;
  });
  const improvements = listOrEmpty(d.improvements).slice(0, 5);
  const blurb = d.key === 'skillsKeywords'
    ? 'Same JD must-have tools as the chip row. Gold = Skills only. Purple nice-to-have chips are not scored here.'
    : d.status === 'ok'
      ? 'This part looks solid.'
      : d.status === 'mid'
        ? 'This part is partly there.'
        : 'This part needs work.';
  const list = (items, kind) => items.length
    ? `<ul class="ai-cat-items">${items.map(m =>
      `<li class="${kind}">${escapeHtml(m)}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="ai-cat-score">
      <strong>${d.score}</strong><span> of ${d.max}</span>
      <span class="ai-cat-status ${d.status}">${escapeHtml(d.statusLabel)}</span>
    </div>
    <p class="ai-cat-blurb">${blurb}</p>
    ${failed.length ? `<div><h4>What's missing</h4>${list(failed, 'miss')}</div>` : ''}
    ${findings.length ? `<div><h4>What's working</h4>${list(findings, 'ok')}</div>` : ''}
    <div>
      <h4>What to do</h4>
      ${improvements.length
        ? `<ul class="ai-cat-tips">${improvements.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
        : '<div class="ai-cat-empty">Nothing to change here.</div>'}
    </div>`;
}

function selectAiCategory(key) {
  state.selectedAiCategory = key;
  const rewriteOpen = $('postRewriteScore') && !$('postRewriteScore').classList.contains('hidden');
  const afterU = state.lastAtsUnified || { scorecard: state.scorecard, ruleScores: state.scorecard?.ruleScores };
  const beforeU = rewriteOpen ? packedScoreUnified(state.preTailor, afterU) : null;
  const panelU = beforeU || afterU;
  const details = buildAiCategoryDetails(panelU);
  renderAiCategoryBars(panelU.ruleScores || {}, key);
  renderAiCategoryDetail(key, details);
  const afterDetails = buildAiCategoryDetails(afterU);
  const d = afterDetails[key] || details[key];
  const titleR = $('aiCategoryDetailTitleResults');
  const elR = $('aiCategoryDetailResults');
  if (titleR && d) titleR.textContent = d.label;
  if (elR && d) elR.innerHTML = formatScoreRuleDetailHtml(d);
  const scorecard = $('scorecardContent');
  if (scorecard) {
    scorecard.querySelectorAll('.bar-row.ai-cat').forEach(row => {
      const label = row.querySelector('.ai-cat-label')?.textContent || '';
      const meta = RULE_META.find(m =>
        label === `${m.letter}. ${m.label}` || label === m.label || label.endsWith(m.label)
      );
      row.classList.toggle('active', !!(meta && meta.key === key));
    });
  }
  if (rewriteOpen && typeof window.selectRewriteCategory === 'function') window.selectRewriteCategory(key);
}

window.selectAiCategory = selectAiCategory;

function renderAiCategoryBars(scores, activeKey) {
  const el = $('ruleBars');
  if (!el) return;
  const active = activeKey || state.selectedAiCategory || RULE_META[0].key;
  el.innerHTML = RULE_META.map(r => {
    const val = Number(scores[r.key] || 0);
    const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
    const on = r.key === active ? ' active' : '';
    return `<div class="bar-row ai-cat${on}" role="button" tabindex="0" onclick="selectAiCategory('${r.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectAiCategory('${r.key}')}">
      <div class="ai-cat-label">${escapeHtml(r.label)}</div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <div>${val}/${r.max}</div>
    </div>`;
  }).join('');
}

function renderAiCategoryDetail(key, detailsMap) {
  const details = detailsMap || (state.lastAtsUnified ? buildAiCategoryDetails(state.lastAtsUnified) : null);
  const d = details && details[key];
  const title = $('aiCategoryDetailTitle');
  const el = $('aiCategoryDetail');
  if (!el) return;
  if (!d) {
    if (title) title.textContent = 'Why this score';
    el.innerHTML = `<p class="hint" style="margin:0;">Click a row on the left to see what that number means.</p>`;
    return;
  }
  if (title) title.textContent = d.label;
  el.innerHTML = formatScoreRuleDetailHtml(d);
}

function syncAiCategoryPanel(unified) {
  state.lastAtsUnified = unified;
  const details = buildAiCategoryDetails(unified);
  const key = defaultAiCategoryKey(details);
  state.selectedAiCategory = key;
  renderAiCategoryBars(unified.ruleScores || {}, key);
  renderAiCategoryDetail(key, details);
}

function renderBarChart(scores) {
  return RULE_META.map(r => {
    const val = Number(scores[r.key] || 0);
    const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
    return `<div class="bar-row"><div>${r.label}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div>${val}/${r.max} pts</div></div>`;
  }).join('');
}

function renderRewriteRuleCompareBars(beforeScores, afterScores, activeKey) {
  const before = beforeScores || {};
  const after = afterScores || {};
  const active = activeKey || state.selectedRewriteCategory || RULE_META[0].key;
  return RULE_META.map(r => {
    const bv = Number(before[r.key] || 0);
    const av = Number(after[r.key] || 0);
    const bp = Math.max(0, Math.min(100, (bv / r.max) * 100));
    const ap = Math.max(0, Math.min(100, (av / r.max) * 100));
    const delta = av - bv;
    const deltaTxt = delta > 0 ? `+${delta}` : String(delta);
    const on = r.key === active ? ' active' : '';
    return `<div class="bar-row ai-cat rewrite-cmp${on}" role="button" tabindex="0" onclick="selectRewriteCategory('${r.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectRewriteCategory('${r.key}')}">
      <div class="ai-cat-label">${escapeHtml(r.label)}</div>
      <div>
        <div class="track" style="margin-bottom:5px;"><div class="fill ghost" style="width:${bp}%"></div></div>
        <div class="track"><div class="fill" style="width:${ap}%"></div></div>
      </div>
      <div class="rewrite-cmp-pts">${bv}→${av}<small>${escapeHtml(deltaTxt)}</small></div>
    </div>`;
  }).join('');
}

function renderBeforeAfterCategoryHtml(beforeD, afterD) {
  return `<div class="ba-split">
    <div class="ba-col">
      <h4>Before rewrite</h4>
      ${beforeD ? formatScoreRuleDetailHtml(beforeD) : '<p class="hint" style="margin:0;">No before score for this category.</p>'}
    </div>
    <div class="ba-col ba-col-after">
      <h4>After rewrite</h4>
      ${afterD ? formatScoreRuleDetailHtml(afterD) : '<p class="hint" style="margin:0;">No after score yet.</p>'}
    </div>
  </div>`;
}

window.selectRewriteCategory = function selectRewriteCategory(key) {
  state.selectedRewriteCategory = key;
  const after = state.lastAtsUnified;
  const before = packedScoreUnified(state.preTailor, after);
  if (!after) return;
  const afterDetails = buildAiCategoryDetails(after);
  const beforeDetails = before ? buildAiCategoryDetails(before) : null;
  const bars = $('rewriteRuleBars');
  if (bars) bars.innerHTML = renderRewriteRuleCompareBars(before?.ruleScores, after.ruleScores, key);
  const meta = RULE_META.find(m => m.key === key);
  const title = $('rewriteCatTitle');
  if (title) title.textContent = meta ? meta.label : 'Why this score';
  const detail = $('rewriteCatDetail');
  if (detail) detail.innerHTML = renderBeforeAfterCategoryHtml(beforeDetails?.[key], afterDetails[key]);
};

function renderCompareChart(before, after) {
  const b = before || {};
  const a = after || {};
  const bRules = before?.ruleScores || b.ruleScores || {};
  const aRules = after?.ruleScores || a.ruleScores || {};
  const rows = [
    ['Match score', Number(before?.atsScore || b.atsScore || 0), Number(after?.atsScore || 0), 100],
    ...RULE_META.map(r => [r.label, Number(bRules[r.key] || 0), Number(aRules[r.key] || 0), r.max]),
    ['Must-have skills', (b.keywordsFound || []).length, (a.keywordsFound || []).length, Math.max((after?.primary || before?.primary || []).length, 1)],
    ['Measured bullets', Number(b.bulletsWithMetrics || 0), Number(a.bulletsWithMetrics || 0), Math.max(Number(a.bulletsTotal || b.bulletsTotal || 1), 1)],
    ['Recruiter glance', glancePassCount(b.tenSecondTest), glancePassCount(a.tenSecondTest), TEN_QUESTIONS.length],
  ];
  return rows.map(([label, bv, av, max]) => {
    const bp = Math.max(0, Math.min(100, (bv / max) * 100));
    const ap = Math.max(0, Math.min(100, (av / max) * 100));
    return `<div class="compare-pair">
      <div class="pair-label">${escapeHtml(label)} · ${bv} → ${av}</div>
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
          : (afterScore >= SCORE_TARGET ? `Strong ${afterScore}/${SCORE_MAX} — tuned for ChatGPT, Claude, and Grok ATS checks.`
            : afterScore >= SCORE_THRESHOLD ? `Above ${SCORE_THRESHOLD} — use Push the score to reach ${SCORE_TARGET}+.` : 'Use Push the score if you want another pass.'),
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
  const unified = state.lastAtsUnified || { ruleScores: scores, scorecard: state.scorecard };
  if (!unified.ruleScores) unified.ruleScores = scores;
  syncAiCategoryPanel(unified);
}

function renderKeywordGrid(targetId, primary, secondary, foundP, foundS, scorecard) {
  const el = $(targetId);
  if (!el) return;
  const sc = scorecard || state.lastAtsUnified?.scorecard || {};
  const scored = scoredSkillTerms(primary || []);
  const extra = scoredSkillTerms(secondary || []).filter(s =>
    !scored.some(p => p.toLowerCase() === String(s).toLowerCase()),
  );
  const phrases = filterExtractedSkills(
    (state.keywords && state.keywords.atsKeywords)
    || (state.lastJdJson && state.lastJdJson.ats_phrases)
    || [],
  ).filter(p =>
    !scored.some(s => s.toLowerCase() === String(p).toLowerCase())
    && !extra.some(s => s.toLowerCase() === String(p).toLowerCase()),
  );
  const cls = (k) => {
    const st = skillStatusOnResume(k, sc);
    if (st === 'work') return 'kw-match';
    if (st === 'skills-only') return 'kw-skills';
    return 'kw-miss';
  };
  const scoredHtml = scored.map(k =>
    `<span class="kw-tag ${cls(k)}">${escapeHtml(k)}</span>`
  ).join('');
  const extraHtml = extra.map(k =>
    `<span class="kw-tag kw-stretch">${escapeHtml(k)}</span>`
  ).join('');
  const resumeText = (state.lastAtsUnified && state.lastAtsUnified.resumeUsed)
    || ($('resumeInput') && $('resumeInput').value)
    || '';
  const atsHtml = phrases.map(p => {
    const on = atsPhrasePresent(p, resumeText);
    return `<span class="kw-tag ${on ? 'kw-ats-on' : 'kw-ats'}">${escapeHtml(p)}</span>`;
  }).join('');
  el.innerHTML = scoredHtml
    + (extraHtml ? `<span class="kw-set-break">Nice-to-have (not scored)</span>${extraHtml}` : '')
    + (atsHtml ? `<span class="kw-set-break">ATS phrases (weave into work bullets)</span>${atsHtml}` : '');
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
        <p class="rp-hero-sub">${(() => {
          const master = inferMasterCareerLabel(($('resumeInput') && $('resumeInput').value) || '');
          const same = familiesAligned(roleFamilyFromTitle(master), roleFamilyFromTitle(displayRole));
          const mode = state.mode === 'aggressive' ? 'Stretch — JD + market skills' : 'Stay truthful — JD skills only';
          return same
            ? `${mode}. Previous role matches this family — rebuild around JD skills and duties, keep overlapping experience.`
            : `${mode}. Previous role is ${escapeHtml(master)}; rewrite is a ${escapeHtml(displayRole)} resume using JD skills/duties plus overlapping prior work.`;
        })()}</p>
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
  const need = score < SCORE_THRESHOLD;
  return `<div class="rp-cta ${need ? 'rp-cta-warn' : 'rp-cta-ok'}">
    <div class="rp-cta-copy">
      ${need ? `<div class="rp-cta-score"><span>${score}</span><small>/100</small></div>` : ''}
      <div>
        <strong>Rewrite this resume for ${title}</strong>
        <p>Skills and work history will be written for this job. Old jobs stay honest.</p>
      </div>
    </div>
    <button class="btn-primary rp-cta-btn" onclick="runAnalysis()">Rewrite resume</button>
  </div>`;
}

function renderAtsPanel(unified) {
  const aligned = syncDisplayedAlignmentScore(unified);
  const sc = aligned.scorecard;
  const score = aligned.atsScore;
  const color = scoreHue(score);
  const kw = state.keywords || aligned;
  const roleLabel = (kw.role && kw.role.label) || aligned.title || 'this job';
  state.preTailor = snapshotScore(aligned);
  $('freeAtsPanel').classList.remove('hidden');
  if ($('postRewriteScore')) $('postRewriteScore').classList.add('hidden');
  if ($('scoreSection')) $('scoreSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  if ($('scoreSourceLabel')) $('scoreSourceLabel').textContent = roleLabel;

  const resumeText = ($('resumeInput') && $('resumeInput').value.trim()) || aligned.resumeUsed || '';
  const candidateProfile = detectCandidateProfile(resumeText);

  const knockEl = $('hardKnockoutBanner');
  if (knockEl) {
    const banner = renderHardKnockoutBanner(sc);
    knockEl.innerHTML = banner || '';
    knockEl.classList.toggle('hidden', !banner);
  }
  if ($('atsDonut')) $('atsDonut').innerHTML = svgDonut(score);
  if ($('freeAtsScore')) {
    $('freeAtsScore').textContent = score;
    $('freeAtsScore').style.color = color;
  }
  if ($('scoreDisclaimer')) {
    $('scoreDisclaimer').textContent = SCORE_UI_BLURB || '9-point alignment to this posting.';
  }

  state.lastAtsUnified = {
    ...unified,
    understanding: unified.understanding || state.lastUnderstanding || null,
    resumeJson: unified.resumeJson || state.lastResumeJson || null,
    jdJson: unified.jdJson || state.lastJdJson || state.keywords?.jdJson || null,
  };
  // 9-point bars + detail report only
  syncAiCategoryPanel(state.lastAtsUnified);

  // Keep gap data for Rewrite — do not dump it into the Score UI
  const missingImportant = filterTermsForCandidateProfile(dropCertTerms(sc.keywordsMissing || []), resumeText, candidateProfile);
  const missingExtra = filterTermsForCandidateProfile(dropCertTerms(sc.secondaryMissing || []), resumeText, candidateProfile);
  const missing = uniqTerms([...missingImportant, ...missingExtra]);
  const ats = atsPhraseReport(kw, resumeText);
  const atsMissingFiltered = filterAtsPhrasesForCandidate(ats.missing, resumeText, candidateProfile);
  state.lastMissingReport = {
    important: missingImportant,
    extra: missingExtra,
    all: missing,
    atsPhrases: ats.phrases,
    atsFound: ats.found,
    atsMissing: atsMissingFiltered,
    candidateProfile,
  };
}

function renderPostRewriteScore(unified, before) {
  const el = $('postRewriteScore');
  if (!el) return;
  const aligned = syncDisplayedAlignmentScore(unified);
  const sc = aligned.scorecard || {};
  const score = Number(aligned.atsScore || 0);
  const prev = before ? Number(before.atsScore || 0) : null;
  const delta = prev != null ? score - prev : null;
  const hue = scoreHue(score);
  const kwFound = (sc.keywordsFound || []).length;
  const kwTotal = Math.max(unified.primary?.length || 0, 1);
  const deltaClass = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? '' : 'flat';
  const deltaText = delta == null
    ? 'After rewrite'
    : `${prev} → ${score} (${delta >= 0 ? '+' : ''}${delta})`;
  const master = ($('resumeInput') && $('resumeInput').value.trim()) || '';
  const stackBlock = master ? stackDetectHtml(detectCandidateProfile(master)) : '';
  const beforeU = packedScoreUnified(before, aligned);
  const afterDetails = buildAiCategoryDetails(aligned);
  const beforeDetails = beforeU ? buildAiCategoryDetails(beforeU) : null;
  const key = state.selectedRewriteCategory || defaultAiCategoryKey(afterDetails);
  state.selectedRewriteCategory = key;
  const catLabel = RULE_META.find(m => m.key === key)?.label || 'Why this score';
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="insight-hero">
      <div class="ba-donuts">
        ${prev != null ? `<div class="ba-donut">
          <div class="donut-wrap">${svgDonut(prev, 120)}</div>
          <div class="score-sub" style="text-align:center;margin-top:4px;">Before rewrite</div>
        </div>` : ''}
        <div class="ba-donut">
          <div class="donut-wrap" id="postRewriteDonut">${svgDonut(score, 140)}</div>
          ${prev != null ? `<div class="post-score-delta ${deltaClass}">${escapeHtml(deltaText)}</div>` : ''}
        </div>
      </div>
      <div>
        <div class="card-title">Match score after rewrite</div>
        ${stackBlock}
        <p class="hint" style="margin-bottom:12px;">${prev != null
    ? `Moved from ${prev}/100 before rewrite to ${score}/100 on the tailored draft. Grey bars = before · colored bars = after.`
    : 'How the rewritten page scores against this posting.'}</p>
        <div class="kpi-mini">
          <div class="score-card">
            <div class="score-label">Match score</div>
            <div class="score-value" style="color:${hue}">${score}</div>
            <div class="score-sub">${prev != null ? `was ${prev}` : `${SCORE_RULE_NAME} · target ${SCORE_TARGET}+`}</div>
          </div>
          <div class="score-card">
            <div class="score-label">Must-have skills</div>
            <div class="score-value blue">${kwFound}/${kwTotal}</div>
            <div class="score-sub">on the rewritten page</div>
          </div>
          <div class="score-card">
            <div class="score-label">Page hygiene</div>
            <div class="score-value" style="font-size:22px;color:${sc.formatCheck === 'PASS' ? '#16a34a' : '#d97706'}">${escapeHtml(sc.formatCheck || '--')}</div>
            <div class="score-sub">parser-safe layout</div>
          </div>
          <div class="score-card">
            <div class="score-label">Measured bullets</div>
            <div class="score-value yellow" style="font-size:22px;">${sc.bulletsWithMetrics || 0}/${sc.bulletsTotal || 0}</div>
            <div class="score-sub">numbers in work history</div>
          </div>
        </div>
      </div>
    </div>
    <div class="chart-grid" style="margin-top:18px;">
      <div class="chart-card">
        <h3>A–I scores before vs after</h3>
        <p class="ai-cat-hint">Grey = before rewrite · color = after. Click a row for the details.</p>
        <div class="bar-chart" id="rewriteRuleBars">${renderRewriteRuleCompareBars(beforeU?.ruleScores, aligned.ruleScores, key)}</div>
      </div>
      <div class="chart-card">
        <h3 id="rewriteCatTitle">${escapeHtml(catLabel)}</h3>
        <div class="ai-cat-detail" id="rewriteCatDetail">${renderBeforeAfterCategoryHtml(beforeDetails?.[key], afterDetails[key])}</div>
      </div>
    </div>`;
}

function renderResults(unified, resumeText) {
  const aligned = syncDisplayedAlignmentScore(unified);
  const sc = aligned.scorecard;
  const score = aligned.atsScore;
  const before = state.preTailor;
  stopAiProcessing();
  setDetailAnalysisOpen(false);
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.remove('hidden');
  renderPostRewriteScore(unified, state.preTailor);
  $('resultsSection').classList.remove('hidden');
  $('atsScore').textContent = score;
  $('atsScore').className = 'score-value ' + (score >= SCORE_THRESHOLD ? 'green' : score >= 70 ? 'yellow' : 'red');
  $('kwMatch').textContent = `${(sc.keywordsFound || []).length}/${Math.max(unified.primary.length, 10)}`;
  $('fmtCheck').textContent = sc.formatCheck || '--';
  $('confScore').textContent = sc.confidenceLevel || '--';
  if ($('afterDonut')) $('afterDonut').innerHTML = svgDonut(score);
  if ($('afterCompareHint')) {
    const prev = before ? Number(before.atsScore || 0) : null;
    const calib = unified.scorecard?.understandingUsed
      ? ` Analysed structured JSON, then scored with ${SCORE_RULE_NAME}.`
      : ` Scored with ${SCORE_RULE_NAME}.`;
    $('afterCompareHint').textContent = prev == null
      ? `How the page moved toward the posting.${calib} ${SCORE_INTERPRETATION}`
      : `Alignment moved ${prev} → ${score}.${calib} ${SCORE_INTERPRETATION}`;
  }
  if ($('compareChart')) {
    $('compareChart').innerHTML = renderCompareChart(
      before ? {
        ...before.scorecard,
        atsScore: before.atsScore,
        primary: before.primary,
        ruleScores: before.ruleScores,
      } : null,
      { ...sc, atsScore: score, primary: unified.primary, ruleScores: unified.ruleScores }
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
  stopResumeEdit({ resetPaper: true });
  showFormattedResume(resumeText);
  setResumeView('formatted');
  state.lastAtsUnified = {
    ...unified,
    understanding: unified.understanding || state.lastUnderstanding || null,
  };
  const aiDetails = buildAiCategoryDetails(state.lastAtsUnified);
  const activeCat = defaultAiCategoryKey(aiDetails);
  state.selectedAiCategory = activeCat;
  $('scorecardContent').innerHTML = [
    ['Match score', score + '/' + SCORE_MAX, score >= SCORE_THRESHOLD ? 'sc-green' : 'sc-yellow'],
    ['Must-have skills', `${(sc.keywordsFound || []).length} found · ${(sc.keywordsMissing || []).length} missing`, 'sc-blue'],
    ['Extra role skills', `${(sc.secondaryFound || []).length} found`, 'sc-blue'],
    ['Measured bullets', `${sc.bulletsWithMetrics}/${sc.bulletsTotal}`, 'sc-yellow'],
    ['Page hygiene', sc.formatCheck, sc.formatCheck === 'PASS' ? 'sc-green' : 'sc-yellow'],
    ['Sections', sc.sectionCheck, sc.sectionCheck === 'PASS' ? 'sc-green' : 'sc-red'],
    ['Read on this', sc.confidenceLevel, 'sc-yellow'],
    ['Why', sc.confidenceReason || SCORE_INTERPRETATION, ''],
  ].map(([l, v, c]) => `<div class="scorecard-row"><span class="sc-label">${l}</span><span class="sc-value ${c}">${v}</span></div>`).join('')
    + renderHardKnockoutBanner(sc)
    + ((sc.jdSkillsOnly || []).length
      ? `<div class="scorecard-row" style="border:1px solid #fecdd3;background:#fff1f2;border-radius:10px;padding:10px 12px;margin-top:8px;">
          <span class="sc-label" style="color:#9f1239;">Credibility risk</span>
          <span class="sc-value sc-red">Skills only (no experience proof): ${(sc.jdSkillsOnly || []).slice(0, 8).map(escapeHtml).join(', ')}${(sc.jdSkillsOnly || []).length > 8 ? '…' : ''}. Recruiters will ask where you used these — omit or prove in bullets.</span>
        </div>`
      : '')
    + ((sc.inventedSkills || []).length
      ? `<div class="scorecard-row" style="border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:10px 12px;margin-top:8px;">
          <span class="sc-label" style="color:#92400e;">Not on master</span>
          <span class="sc-value" style="color:#92400e;">Removed or still listed without master evidence: ${(sc.inventedSkills || []).slice(0, 8).map(escapeHtml).join(', ')}</span>
        </div>`
      : '')
    + `<p class="ai-cat-hint" style="margin-top:14px;">Click a row to see why.</p>`
    + `<div class="bar-chart" style="margin-top:8px;">${RULE_META.map(r => {
      const val = Number((unified.ruleScores || {})[r.key] || 0);
      const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
      const on = r.key === activeCat ? ' active' : '';
      return `<div class="bar-row ai-cat${on}" role="button" tabindex="0" onclick="selectAiCategory('${r.key}')"><div class="ai-cat-label">${escapeHtml(r.label)}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div>${val}/${r.max}</div></div>`;
    }).join('')}</div>`
    + `<div class="chart-card" style="margin-top:12px;"><h3 id="aiCategoryDetailTitleResults">${escapeHtml(aiDetails[activeCat]?.label || 'Why this score')}</h3><div class="ai-cat-detail" id="aiCategoryDetailResults"></div></div>`;
  // Mirror detail into results scorecard panel
  const detailEl = $('aiCategoryDetailResults');
  if (detailEl) {
    const d = aiDetails[activeCat];
    if (d) detailEl.innerHTML = formatScoreRuleDetailHtml(d);
  }
  // Keep the original Score panel as the before-rewrite snapshot.
  if (before && $('freeAtsPanel') && !$('freeAtsPanel').classList.contains('hidden')) {
    const beforeU = packedScoreUnified(before, unified);
    if ($('scoreSourceLabel') && !$('scoreSourceLabel').textContent.includes('before')) {
      $('scoreSourceLabel').textContent = `${$('scoreSourceLabel').textContent} (before rewrite)`;
    }
    renderAiCategoryBars(beforeU.ruleScores || {}, activeCat);
    renderAiCategoryDetail(activeCat, buildAiCategoryDetails(beforeU));
  }

  renderKeywordGrid('kwGrid', unified.primary, unified.secondary, sc.keywordsFound, sc.secondaryFound, sc);
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

  if (score < SCORE_TARGET) $('boostBtn').classList.remove('hidden');
  else $('boostBtn').classList.add('hidden');
  if ($('rerunBtn')) $('rerunBtn').classList.remove('hidden');
  setStep(5);
}

function renderRuleHtml(scores) {
  return '<div class="rule-bars" style="margin-top:12px;">' + RULE_META.map(r => {
    const val = Number(scores[r.key] || 0);
    const pct = Math.max(0, Math.min(100, (val / r.max) * 100));
    return `<div class="rule-row"><div>${r.label}</div><div class="rule-track"><div class="rule-fill" style="width:${pct}%"></div></div><div>${val}/${r.max} pts</div></div>`;
  }).join('') + '</div>';
}

function getInputs() {
  const jd = $('jdInput').value.trim();
  const card = $('resumeFieldsCard');
  const fieldsOpen = !!(card && !card.classList.contains('hidden') && $('resumeFields') && $('resumeFields').querySelector('[data-rf]'));
  if (fieldsOpen) {
    // Flush a pending field edit (should invalidate score if content changed).
    if (resumeFieldTimer) {
      clearTimeout(resumeFieldTimer);
      resumeFieldTimer = null;
      applyResumeFieldsToMaster();
    } else {
      // Quiet sync before Score/Rewrite — do not wipe a fresh score.
      applyResumeFieldsToMaster({ keepScoreGate: true });
    }
  }
  const resume = sanitizeMasterInEditor().trim();
  if (!jd) { showToast('Paste the posting first', '#e11d48'); return null; }
  if (!resume) { showToast('Upload your base resume as PDF, DOC, or DOCX', '#e11d48'); return null; }
  return { jd, resume };
}

function prettyJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj || '');
  }
}

function renderStructuredJsonPanel(resumeJson, jdJson) {
  const panel = $('jsonStructurePanel');
  if (panel) panel.classList.remove('hidden');
  const rView = $('resumeJsonView');
  const jView = $('jdJsonView');
  const rMeta = $('resumeJsonMeta');
  const jMeta = $('jdJsonMeta');
  if (rView) {
    rView.classList.remove('json-empty');
    rView.textContent = resumeJson ? prettyJson(resumeJson) : 'No resume JSON';
  }
  if (jView) {
    jView.classList.remove('json-empty');
    jView.textContent = jdJson ? prettyJson(jdJson) : 'No JD JSON';
  }
  if (rMeta) {
    const name = resumeJson?.personal_information?.name || 'parsed';
    const jobs = (resumeJson?.professional_experience || []).length;
    const skills = resumeJson ? skillsFromResumeJson(resumeJson).length : 0;
    rMeta.textContent = `${name} · ${jobs} roles · ${skills} skills`;
  }
  if (jMeta) {
    const title = jdJson?.job_information?.title || 'parsed';
    const must = (jdJson?.must_have_skills || []).length;
    const duties = (jdJson?.responsibilities || []).length;
    jMeta.textContent = `${title} · ${must} must-haves · ${duties} duties`;
  }
  try {
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch { /* ignore */ }
}

async function copyStructuredJson(which) {
  const obj = which === 'jd' ? state.lastJdJson : state.lastResumeJson;
  if (!obj) {
    showToast('Nothing to copy yet — run Score first', '#d97706');
    return;
  }
  try {
    await navigator.clipboard.writeText(prettyJson(obj));
    showToast(which === 'jd' ? 'JD JSON copied' : 'Resume JSON copied');
  } catch {
    showToast('Copy failed', '#e11d48');
  }
}

function downloadStructuredJson() {
  if (!state.lastResumeJson && !state.lastJdJson) {
    showToast('Nothing to download yet — run Score first', '#d97706');
    return;
  }
  const payload = {
    resume: state.lastResumeJson || null,
    jd: state.lastJdJson || null,
    generated_at: new Date().toISOString(),
  };
  const blob = new Blob([prettyJson(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'structured-resume-jd.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Fast local structure — no Gemini, no UI. Used under Score. */
function fastStructureResumeJson(resume) {
  return parseResumeToJsonLocal(String(resume || ''));
}

function fastStructureJdJson(jd) {
  let parsed = parseJdToJsonLocal(String(jd || ''));
  try {
    if (window.RAGEngine && typeof RAGEngine.buildJdOnlySkillSet === 'function') {
      const rag = RAGEngine.buildJdOnlySkillSet(jd);
      const primary = dropCertTerms(rag.jdPrimary || rag.primary || []);
      const secondary = dropCertTerms(rag.jdSecondary || rag.secondary || []);
      if (primary.length) {
        parsed.must_have_skills = uniqTerms([...(parsed.must_have_skills || []), ...primary]).slice(0, 16);
      }
      if (secondary.length) {
        parsed.nice_to_have_skills = uniqTerms([...(parsed.nice_to_have_skills || []), ...secondary])
          .filter(s => !parsed.must_have_skills.some(p => p.toLowerCase() === String(s).toLowerCase()))
          .slice(0, 12);
      }
      if (rag.role?.title && !parsed.job_information?.title) {
        parsed.job_information = { ...parsed.job_information, title: rag.role.title };
      }
      if (rag.role?.label && !parsed.overview) {
        parsed.overview = String(rag.role.label);
      }
    }
  } catch { /* ignore */ }
  return normalizeJdJson(parsed);
}

/** Score a draft with the JD-alignment rule (structure JSON → coverage A–I). */
async function scoreDraftWithScoreRule(jd, resume, { structureWithGemini = true } = {}) {
  const text = String(resume || '');
  let resumeJson;
  let jdJson = state.lastJdJson;
  if (structureWithGemini) {
    const tasks = [parseResumeToJson(text).then(r => { resumeJson = r; })];
    if (!jdJson) tasks.push(parseJdToJson(jd).then(j => { jdJson = j; }));
    await Promise.all(tasks);
  } else {
    resumeJson = fastStructureResumeJson(text);
    jdJson = jdJson || fastStructureJdJson(jd);
  }
  state.lastResumeJson = resumeJson;
  state.lastJdJson = jdJson;
  if (jdJson && (!state.keywords?.primary?.length || state.keywords?.source === 'jd-json')) {
    const kw = keywordsFromJdJson(jdJson);
    state.keywords = { ...(state.keywords || {}), ...kw, jdJson };
    ensureAliasMap(state.keywords);
  }
  const { unified } = await scoreFromStructuredJson(resumeJson, jdJson, {
    resumeText: text,
    jdText: jd,
  });
  state.lastAtsUnified = unified;
  state.scorecard = unified.scorecard;
  return { unified, resume: text, resumeJson, jdJson };
}

async function runAtsCheck() {
  const inputs = getInputs();
  if (!inputs) return;
  const { jd, resume } = inputs;
  const btn = $('freeAtsBtn');
  btn.disabled = true;
  btn.textContent = 'Scoring…';
  setStep(2);
  // Loader stays on scoring only — JSON convert is silent (no UI, no convert copy)
  showAiProcessing(
    `Scoring with the 9-point ${SCORE_RULE_NAME}…`,
    'Comparing resume to the posting',
  );
  try {
    const verified = verifiedResumeJson();
    const [resumeJson, jdJson] = await Promise.all([
      verified ? Promise.resolve(verified) : parseResumeToJson(resume),
      parseJdToJson(jd),
    ]);
    state.lastResumeJson = resumeJson;
    if (!verified) state.masterResumeJson = resumeJson;
    else state.masterResumeJson = verified;
    state.lastJdJson = jdJson;

    const kw = keywordsFromJdJson(jdJson);
    kw._mode = state.mode;
    state.keywords = { ...(state.keywords || {}), ...kw };
    state.kwHash = jdHash(jd);
    syncJdSessionMeta(getActiveJdSession(), kw);
    renderJdTabs();

    const { unified } = await scoreFromStructuredJson(resumeJson, jdJson, {
      resumeText: resume,
      jdText: jd,
    });
    state.lastAtsUnified = unified;
    state.scorecard = unified.scorecard;
    state.manualScoreKey = scorePairKey(jd, resume);
    state.manualScoreUnified = snapshotScore(unified);
    renderAtsPanel(unified);
    if ($('freeAtsPanel')) $('freeAtsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const role = jdJson.job_information?.title || unified.title || 'this role';
    showToast(`9-point alignment ${unified.atsScore}/100 · ${role}`);
  } catch (err) {
    showToast('Match score failed: ' + String(err.message || err).slice(0, 80), '#e11d48');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Score (score rule)';
    stopAiProcessing();
    stopLoading();
  }
}

function primarySkillsOnly(unified) {
  const invented = new Set(
    listOrEmpty(unified?.scorecard?.inventedSkills).map(s => String(s).toLowerCase()),
  );
  const skillsOnly = listOrEmpty(unified?.scorecard?.jdSkillsOnly)
    .filter(s => !invented.has(String(s).toLowerCase()));
  if (state.mode === 'aggressive') return skillsOnly;
  const primary = new Set(
    (state.keywords?.primary || state.keywords?.jdPrimary || []).map(s => String(s).toLowerCase()),
  );
  return skillsOnly.filter(s => primary.has(String(s).toLowerCase()));
}

function missingAndUnwoven(unified, resumeText) {
  const miss = missingSkillReport(state.keywords || {}, resumeText || '');
  return uniqTerms([...(miss.important || []), ...primarySkillsOnly(unified)]);
}

function rewriteStillNeedsWork(unified, resumeText) {
  // Gap-close target is 90+ on the score rule.
  return Number(unified?.atsScore || 0) < SCORE_THRESHOLD;
}

async function runAnalysis() {
  const inputs = getInputs();
  if (!inputs) return;
  const { jd, resume } = inputs;

  if (!hasFreshManualScore(jd, resume)) {
    showToast('Check the score first', '#d97706');
    return;
  }
  // Keep gate aligned with the synced master text used for this rewrite.
  state.manualScoreKey = scorePairKey(jd, resume);

  const baselineUnified = state.manualScoreUnified || state.lastAtsUnified;
  $('analyzeBtn').disabled = true;
  if ($('postRewriteScore')) $('postRewriteScore').classList.add('hidden');
  $('scoreSection').classList.add('hidden');
  $('resultsSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.add('hidden');
  if ($('detailAnalysisPanel')) $('detailAnalysisPanel').classList.add('hidden');
  if ($('progressSection')) $('progressSection').classList.add('hidden');
  setStep(3);
  showAiProcessing(
    'Rewriting as the JD role using your score-rule report…',
    'Summary, skills, and experience will match that posting…'
  );

  try {
    // Reuse Score JD skills / JSON — no second JD Gemini analysis.
    await lockKeywordsFromJd(jd);
    if (state.lastJdJson) {
      state.keywords = { ...(state.keywords || {}), ...keywordsFromJdJson(state.lastJdJson), jdJson: state.lastJdJson, _mode: state.mode };
    }
    syncJdSessionMeta(getActiveJdSession(), state.keywords);
    renderJdTabs();
    if (!state.keywords.geminiUsed && state.keywords.geminiError) {
      showToast('Gemini unavailable — using local RAG for skills', '#d97706');
    }

    // Use the manual Score report as the gap source — do not re-score before rewrite
    state.preTailor = snapshotScore(baselineUnified);
    state.scorecard = baselineUnified.scorecard;

    const missingReport = missingSkillReport(state.keywords, resume);
    state.lastMissingReport = missingReport;
    updateAiProcessing('Rewriting as the JD role — adding missing skills and weaving them into experience…');

    // 1) Rewrite with Score gaps
    const tailored = cleanupResume(await callGemini(
      buildRewritePrompt(jd, resume, state.keywords, missingReport, baselineUnified),
      { maxTokens: 7000 },
    ));
    if (!tailored || tailored.length < 200) throw new Error('Rewrite was empty');
    state.tailoredResume = tailored;
    $('outputArea').textContent = tailored;

    setStep(4);
    updateAiProcessing(`Scoring the rewrite with the 9-point ${SCORE_RULE_NAME}…`);
    let scored = await scoreDraftWithScoreRule(jd, state.tailoredResume, { structureWithGemini: false });
    let unified = scored.unified;
    state.tailoredResume = scored.resume;
    $('outputArea').textContent = scored.resume;

    // 2) Close gaps until 90+ (local score between passes — no Gemini re-parse)
    let pass = 0;
    while (rewriteStillNeedsWork(unified, state.tailoredResume) && pass < MAX_BOOST_PASSES) {
      pass += 1;
      const liveMissing = missingSkillReport(state.keywords || {}, state.tailoredResume);
      const mustWeave = missingAndUnwoven(unified, state.tailoredResume);
      state.lastMissingReport = liveMissing;
      updateAiProcessing(
        `Closing gaps to ${SCORE_THRESHOLD}+ — pass ${pass} of ${MAX_BOOST_PASSES} (now ${unified.atsScore})…`
      );
      const boosted = cleanupResume(await callGemini(
        buildBoostPrompt(jd, state.tailoredResume, {
          ...unified.scorecard,
          atsScore: unified.atsScore,
          ruleScores: unified.ruleScores,
          keywordsMissing: mustWeave,
        }, state.keywords || {}),
        { maxTokens: 7000 },
      ));
      const nextText = boosted && boosted.length > 200 ? boosted : state.tailoredResume;
      scored = await scoreDraftWithScoreRule(jd, nextText, { structureWithGemini: false });
      state.tailoredResume = scored.resume;
      unified = scored.unified;
      state.scorecard = unified.scorecard;
      state.lastAtsUnified = unified;
      $('outputArea').textContent = scored.resume;
    }

    updateAiProcessing('Finalizing emphasis and formatting…');
    await finalizeBolding(jd, state.tailoredResume, { useGemini: false });
    renderResults(unified, state.tailoredResume);
    persistCurrentJdSession();
    saveWorkspace();
    showToast(formatMatchToast(unified));
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
    `Pushing with ${SCORE_RULE_NAME}…`,
    'Closing score-rule gaps with the 20 writing rules…'
  );
  try {
    let unified = state.lastAtsUnified || {
      scorecard: state.scorecard || {},
      atsScore: Number(state.scorecard?.atsScore || 0),
      ruleScores: state.scorecard?.ruleScores || {},
    };
    // Fresh score-rule baseline on current draft
    if (!unified.scorecard?.coverage) {
      const base = await scoreDraftWithScoreRule(inputs.jd, state.tailoredResume, { structureWithGemini: true });
      unified = base.unified;
    }
    let pass = 0;
    const maxPushPasses = 4;
    while (unified.atsScore < SCORE_TARGET && pass < maxPushPasses) {
      pass += 1;
      updateAiProcessing(`Push pass ${pass} of ${maxPushPasses} — score ${unified.atsScore}, need ${SCORE_TARGET}+…`);
      const missingReport = state.lastMissingReport || missingSkillReport(state.keywords || {}, state.tailoredResume);
      const boosted = cleanupResume(await callGemini(
        buildBoostPrompt(
          inputs.jd,
          state.tailoredResume,
          { ...unified.scorecard, atsScore: unified.atsScore, ruleScores: unified.ruleScores || unified.scorecard?.ruleScores },
          state.keywords || {},
        ),
        { maxTokens: 7000 },
      ));
      if (boosted && boosted.length > 200) {
        state.tailoredResume = boosted;
        $('outputArea').textContent = boosted;
      }
      if (unified.atsScore < SCORE_THRESHOLD || pass === maxPushPasses) {
        updateAiProcessing(`Score-rule polish — pass ${pass}…`);
        const externalPass = cleanupResume(await callGemini(
          buildExternalAtsPassPrompt(inputs.jd, state.tailoredResume, state.keywords, missingReport),
          { maxTokens: 7000 },
        ));
        if (externalPass && externalPass.length > 200) {
          state.tailoredResume = externalPass;
          $('outputArea').textContent = externalPass;
        }
      }
      const scored = await scoreDraftWithScoreRule(inputs.jd, state.tailoredResume, { structureWithGemini: true });
      state.tailoredResume = scored.resume;
      unified = scored.unified;
      state.scorecard = unified.scorecard;
      state.lastAtsUnified = unified;
      $('outputArea').textContent = scored.resume;
      if (unified.atsScore >= SCORE_TARGET) break;
    }
    updateAiProcessing('Final read — top to bottom for format, duplicates, and copy…');
    const proofed = await proofreadTailoredResume(inputs.jd, state.tailoredResume);
    if (proofed && proofed.length > 200) {
      state.tailoredResume = proofed;
      $('outputArea').textContent = proofed;
    }
    {
      const scored = await scoreDraftWithScoreRule(inputs.jd, state.tailoredResume, { structureWithGemini: true });
      state.tailoredResume = scored.resume;
      unified = scored.unified;
      state.scorecard = unified.scorecard;
      state.lastAtsUnified = unified;
      $('outputArea').textContent = scored.resume;
    }

    updateAiProcessing('Finalizing emphasis…');
    await finalizeBolding(inputs.jd, state.tailoredResume);
    renderResults(unified, state.tailoredResume);
    persistCurrentJdSession();
    saveWorkspace();
    showToast(formatMatchToast(unified));
  } catch (err) {
    showToast('Push failed: ' + String(err.message || err).slice(0, 80), '#e11d48');
    stopAiProcessing();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push the score';
    stopLoading();
  }
}

function scrubSummaryMetrics(line) {
  let s = String(line || '');
  s = s.replace(/\([^)]*(?:\$|\d+\s*%|\d+(?:\.\d+)?\s*(?:k|m|b)\b|percent)[^)]*\)/gi, '');
  s = s.replace(/\bvalued at\s+\$?\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|million|billion)?\b/gi, '');
  s = s.replace(/\b(?:saving|saved|worth|costing|generating|delivering)\s+\$?\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|million|billion)?\b/gi, '');
  s = s.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|million|billion)?\b/gi, '');
  s = s.replace(/\ba?\s*\d+(?:\.\d+)?\s*%(?:\s*(?:reduction|increase|improvement|growth|savings?|gain|boost|decrease))?/gi, '');
  s = s.replace(/\bby\s+\d+(?:\.\d+)?\s*%/gi, '');
  s = s.replace(/\b\d+(?:\.\d+)?\s*percent(?:age)?(?:\s*(?:reduction|increase|improvement|growth|savings?|gain|boost|decrease))?/gi, '');
  s = s.replace(/\b(?:reducing|reduced|improved|increased|boosted|cut|decreased)\s+[^.]*?\bby\s+\d+[^.,;]*/gi, (m) => {
    const lead = m.match(/^(reducing|reduced|improved|increased|boosted|cut|decreased)/i);
    return lead ? lead[1] : '';
  });
  s = s.replace(/\bdelivering\s+[^.,;]*?\b(?:insights|opportunities|results)\b[^.,;]*?(?=,|\.|$)/gi, 'delivering actionable insights');
  s = s.replace(/\s*,\s*,+/g, ',');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+([,.;])/g, '$1');
  s = s.replace(/,\s+and\s+\./gi, '.');
  s = s.replace(/,\s*\./g, '.');
  s = s.replace(/\s+\./g, '.');
  s = s.replace(/\(\s*\)/g, '');
  s = s.replace(/,\s*$/g, '.');
  return s.trim();
}

function stripEligibilityFromSummary(text) {
  const lines = String(text || '').split('\n');
  const bounds = summaryBounds(lines);
  if (!bounds) return text;
  const master = ($('resumeInput') && $('resumeInput').value) || text;
  const primary = detectCandidateProfile(master).primaryCloud;
  const scrub = (line) => {
    let s = String(line || '');
    s = s.replace(/\b(?:including|with|and|or|for|on)\s+(?:an?\s+)?(?:h-?1b|h1b)(?:\s+visa)?(?:\s+sponsorship)?\b/gi, '');
    s = s.replace(/\b(?:h-?1b|h1b)(?:\s+visa)?(?:\s+sponsorship)?\b/gi, '');
    s = s.replace(/\b(?:visa sponsorship|work authorization|work authorisation|authorized to work|authorised to work|eligible to work|without sponsorship|no sponsorship)\b/gi, '');
    s = s.replace(/\b(?:us|u\.s\.)\s*citizenship\b/gi, '');
    s = s.replace(/\s*,?\s*including\s+AWS,?\s*Azure,?\s*(?:and|or)?\s*GCP\.?/gi, '');
    s = s.replace(/\s*,?\s*including\s+AWS\.?/gi, '');
    s = s.replace(/\bAWS,\s*Azure,\s*(?:or|and)\s*GCP\b/gi, primary === 'azure' ? 'Azure' : primary === 'gcp' ? 'GCP' : 'AWS');
    if (primary && primary !== 'gcp') {
      s = s.replace(/\s*,?\s*(?:and\s+)?BigQuery\b/gi, '');
      s = s.replace(/\s*,?\s*(?:and\s+)?(?:Google Cloud|GCP)\b/gi, '');
    }
    if (primary && primary !== 'aws') {
      s = s.replace(/\s*,?\s*(?:and\s+)?Redshift\b/gi, '');
      s = s.replace(/\s*,?\s*(?:and\s+)?(?:Amazon\s+)?S3\b/gi, '');
    }
    if (primary && primary !== 'azure') {
      s = s.replace(/\s*,?\s*(?:and\s+)?(?:Azure\s+)?Synapse\b/gi, '');
      s = s.replace(/\s*,?\s*(?:and\s+)?Azure Data Factory\b/gi, '');
    }
    s = scrubSummaryMetrics(s);
    s = s.replace(/\bincluding\s+including\b/gi, 'including');
    s = s.replace(/\s{2,}/g, ' ');
    s = s.replace(/\s+([,.;])/g, '$1');
    s = s.replace(/,\s*,+/g, ',');
    s = s.replace(/,\s+and\s+\./gi, '.');
    s = s.replace(/,\s*\./g, '.');
    s = s.replace(/\s+\./g, '.');
    s = s.replace(/\(\s*\)/g, '');
    return s.trim();
  };
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    if (!lines[i].trim() || isSectionHeader(lines[i]) || isBulletLine(lines[i])) continue;
    lines[i] = scrub(lines[i]);
  }
  return lines.join('\n');
}

function cleanupResume(text, opts = {}) {
  let t = (text || '').replace(/```(?:text|markdown)?/gi, '').trim();
  t = unstickGluedResumeText(t);
  t = t.replace(/^here is[^\n]*\n+/i, '');
  t = liftNameAboveLeadingHeading(t);
  t = enforceAnirudhTemplate(t);
  t = sanitizeResumeHeadline(t);
  const master = opts.master || ($('resumeInput') && $('resumeInput').value) || '';
  if (master) t = restoreMasterHeadline(t, master);
  t = stripEligibilityFromSummary(t);
  t = restoreSummaryLeadRole(t, master);
  t = restoreSummaryTenure(t, master);
  t = normalizeExperienceRoleLines(t);
  t = t.split('\n').map(repairBrokenBulletMetrics).join('\n');
  t = normalizeContactInResume(t).trim();
  t = stripFakeGitHub(t, master);
  if (master) {
    t = restoreMasterContact(t, master);
    t = restoreMasterExperienceLocations(t, master);
    t = stripFakeLinkedIn(t, master);
  }
  t = stripFakeGitHub(t, master);
  const kw = opts.keywords || state.keywords || null;
  if (kw) {
    t = polishResumeForAts(t, kw, master || t);
  }
  if (state.mode !== 'aggressive' && master && kw) {
    t = scrubSkillsNotOnMaster(t, master, kw);
  }
  // EDUCATION / PROJECTS / CERTIFICATIONS: format-only from verified fields (once).
  t = applyVerifiedStaticSections(t);
  if (master) {
    // Other extras (Awards, Volunteer, …) only — projects/certs already handled.
    t = restoreExtraSections(t, master);
  }
  if (master) {
    t = dropSectionIfMissingOnMaster(t, master, l => /^(summary|professional summary|objective|profile)$/i.test(normalizeHeader(l)));
    t = dropSectionIfMissingOnMaster(t, master, l => /^(skills|technical skills)$/i.test(normalizeHeader(l)));
  }
  t = enforceVerifiedEmptyFields(t, master);
  // Re-apply static sections last so empty-field enforcement cannot leave model dupes.
  t = applyVerifiedStaticSections(t);
  return t;
}

/** Post-process so page layout always matches the Anirudh template. */
function enforceAnirudhTemplate(text) {
  let lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .split('\n');

  const HEADER_MAP = [
    [/^(professional\s+)?summary$/i, 'SUMMARY'],
    [/^profile$/i, 'SUMMARY'],
    [/^objective$/i, 'SUMMARY'],
    [/^technical\s+skills$/i, 'TECHNICAL SKILLS'],
    [/^skills$/i, 'SKILLS'],
    [/^core\s+competencies$/i, 'SKILLS'],
    [/^(professional\s+|work\s+)?experience$/i, 'PROFESSIONAL EXPERIENCE'],
    [/^work\s+history$/i, 'PROFESSIONAL EXPERIENCE'],
    [/^employment$/i, 'PROFESSIONAL EXPERIENCE'],
    [/^education$/i, 'EDUCATION'],
    [/^projects?$/i, 'PROJECTS'],
    [/^key\s+projects$/i, 'PROJECTS'],
    [/^certifications?$/i, 'CERTIFICATIONS'],
  ];

  lines = lines.map((line, idx) => {
    const raw = String(line || '').trim();
    if (!raw) return '';
    for (const [re, canon] of HEADER_MAP) {
      if (re.test(raw.replace(/[:.\s]+$/g, ''))) return canon;
    }
    // Normalize bullets to "- "
    if (/^[•*·◦▸▶▪▫]\s*/.test(raw) || /^\d{1,2}[.)]\s+/.test(raw)) {
      return '- ' + raw.replace(/^[•*·◦▸▶▪▫]\s*/, '').replace(/^\d{1,2}[.)]\s+/, '');
    }
    if (/^-\s+/.test(raw) && !/^- /.test(raw)) {
      return '- ' + raw.replace(/^-\s+/, '');
    }
    // Title-case name on first non-empty line if ALL CAPS
    if (idx < 3 && !seenContentBefore(lines, idx) && /^[A-Z][A-Z\s.'.-]{2,60}$/.test(raw) && !/@/.test(raw) && !/\d{3}/.test(raw)) {
      return toTitleCase(raw);
    }
    return line.replace(/\s+$/, '');
  });

  // Ensure blank line after contact before SUMMARY
  const out = [];
  let sawSummary = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (!sawSummary && /^SUMMARY$/i.test(t)) {
      if (out.length && out[out.length - 1].trim() !== '') out.push('');
      out.push('SUMMARY');
      sawSummary = true;
      continue;
    }
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function seenContentBefore(lines, idx) {
  for (let i = 0; i < idx; i++) {
    if (String(lines[i] || '').trim()) return true;
  }
  return false;
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

function restoreMasterHeadline(text, master) {
  const title = masterExperienceRoleTitle(master || text);
  if (!title) return String(text || '');
  const lines = String(text || '').split('\n');
  let seenName = false;
  let nameIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = String(lines[i] || '').trim();
    if (!l) continue;
    if (!seenName) {
      seenName = true;
      nameIdx = i;
      continue;
    }
    if (typeof isSectionHeader === 'function' && isSectionHeader(l)) {
      lines.splice(i, 0, title);
      return lines.join('\n');
    }
    if (typeof isHeaderContactLine === 'function' && isHeaderContactLine(l)) {
      lines.splice(i, 0, title);
      return lines.join('\n');
    }
    if (l.toLowerCase() !== title.toLowerCase()) lines[i] = title;
    return lines.join('\n');
  }
  if (nameIdx >= 0) lines.splice(nameIdx + 1, 0, title);
  return lines.join('\n');
}

function restoreSummaryLeadRole(text, master) {
  const role = masterExperienceRoleTitle(master || text);
  if (!role) return String(text || '');
  const jd = targetJdTitle(
    (typeof $ === 'function' && $('jdInput') && $('jdInput').value) || '',
    typeof state !== 'undefined' ? state.keywords : {},
  );
  const lines = String(text || '').split('\n');
  const bounds = typeof summaryBounds === 'function' ? summaryBounds(lines) : null;
  if (!bounds) return lines.join('\n');
  const esc = typeof escapeRegExp === 'function'
    ? escapeRegExp(role)
    : role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    if (!lines[i].trim() || isSectionHeader(lines[i]) || isBulletLine(lines[i])) continue;
    let s = peelLocationFromSummaryLead(lines[i].trim(), role, master || text);
    s = collapseRepeatedOpener(s, role);
    const roleRe = new RegExp('^((?:An?|The)\\s+)?' + esc + '\\b', 'i');
    if (roleRe.test(s)) {
      lines[i] = s.replace(roleRe, role);
      break;
    }
    if (jd && jd.toLowerCase() !== role.toLowerCase()) {
      const jdEsc = typeof escapeRegExp === 'function'
        ? escapeRegExp(jd)
        : jd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const jdRe = new RegExp('^((?:An?|The)\\s+)?' + jdEsc + '\\b', 'i');
      if (jdRe.test(s)) {
        lines[i] = s.replace(jdRe, role);
        break;
      }
    }
    const lead = s.match(/^((?:An?\s+)?[A-Z][A-Za-z0-9/+&.,' -]{2,80}?)(\s+with\s+\d)/);
    if (lead && /engineer|analyst|scientist|developer|architect|specialist|manager|consultant|technician|administrator|intern/i.test(lead[1])) {
      lines[i] = role + s.slice(lead[1].length);
      break;
    }
    const lead2 = s.match(/^((?:An?\s+)?[A-Z][A-Za-z0-9/+&.,' -]{2,80}?)(\s+)/);
    if (lead2 && /engineer|analyst|scientist|developer|architect|specialist|manager|consultant|technician|administrator|intern/i.test(lead2[1])) {
      lines[i] = role + s.slice(lead2[1].length);
      break;
    }
    if (!/^\d/.test(s) && !(typeof looksLikeJobTitleToken === 'function' && looksLikeJobTitleToken(s.slice(0, 80)))) {
      lines[i] = `${role} ${s.replace(/^(?:An?\s+)/i, '')}`.replace(/\s{2,}/g, ' ');
    } else {
      lines[i] = s;
    }
    break;
  }
  return lines.join('\n');
}

function resetResultsUi(silent, opts = {}) {
  stopResumeEdit({ resetPaper: true });
  state.keywords = null;
  state.kwHash = '';
  state.tailoredResume = '';
  state.scorecard = null;
  state.lastAtsUnified = null;
  state.lastMissingReport = null;
  state.lastUnderstanding = null;
  state.lastResumeJson = null;
  state.selectedRewriteCategory = null;
  state.selectedAiCategory = null;
  state.boldTerms = [];
  state.boldFinalized = false;
  state.preTailor = null;
  state.paperEdited = false;
  clearManualScoreGate();
  if ($('freeAtsPanel')) $('freeAtsPanel').classList.add('hidden');
  if ($('postRewriteScore')) $('postRewriteScore').classList.add('hidden');
  if ($('scoreSection')) $('scoreSection').classList.add('hidden');
  if ($('resultsSection')) $('resultsSection').classList.add('hidden');
  if ($('progressSection')) $('progressSection').classList.add('hidden');
  if ($('optimizeBoard')) $('optimizeBoard').classList.add('hidden');
  if ($('detailAnalysisBar')) $('detailAnalysisBar').classList.add('hidden');
  if ($('detailAnalysisPanel')) $('detailAnalysisPanel').classList.add('hidden');
  stopAiProcessing();
  state.detailAnalysisOpen = false;
  if ($('outputArea')) $('outputArea').textContent = '';
  if ($('resumePaper')) $('resumePaper').innerHTML = '';
  if ($('analyzeBtn')) $('analyzeBtn').disabled = false;
  if ($('rerunBtn')) $('rerunBtn').classList.add('hidden');
  if ($('boostBtn')) $('boostBtn').classList.add('hidden');
  if ($('editResumeBtn')) $('editResumeBtn').classList.add('hidden');
  if ($('doneResumeBtn')) $('doneResumeBtn').classList.add('hidden');
  setStep(1);
  if (opts.clearAllSessionDrafts) {
    (state.jdSessions || []).forEach(s => { s.tailoredResume = ''; });
  } else {
    const session = getActiveJdSession();
    if (session) session.tailoredResume = '';
  }
  if (!silent) {
    showToast(opts.toast || 'Results cleared — base resume and postings are still here');
  }
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
  const extra = extraMasterSections(resume).filter(s => {
    if (isProjectsHeader(s.header)) return false;
    if (/^certif/i.test(normalizeHeader(s.header))) return false;
    if (/^education$/i.test(normalizeHeader(s.header))) return false;
    return true;
  });
  return `STATIC SECTIONS RULE:
- Tailor ONLY SUMMARY, SKILLS, and PROFESSIONAL EXPERIENCE.
- Do NOT output EDUCATION, PROJECTS, or CERTIFICATIONS — the app injects those once from verified fields (format only, no content changes).
- Do not invent Awards / Volunteer / Languages unless already on the master.
${extra.length ? `\nOther master extras to keep once if present:\n${extra.map(s => s.lines.join('\n').trim()).join('\n\n')}` : ''}`;
}

function fuzzyHeaderMatch(a, b) {
  const na = (a || '').replace(/[^a-z]/gi, '').toLowerCase();
  const nb = (b || '').replace(/[^a-z]/gi, '').toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const coreA = na.replace(/^(key|selected|relevant|personal|academic|professional|notable)/, '');
  const coreB = nb.replace(/^(key|selected|relevant|personal|academic|professional|notable)/, '');
  if (coreA && coreB && (coreA === coreB || coreA.includes(coreB) || coreB.includes(coreA))) return true;
  return false;
}

function isProjectsHeader(header) {
  return /\bPROJECTS?\b/.test(normalizeHeader(header));
}

function projectTitleKey(title) {
  return String(title || '').split('|')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isProjectTitleLine(line) {
  const l = String(line || '').trim();
  if (!l || isBulletLine(l) || isAnySectionHeader(l)) return false;
  if (l.length > 140) return false;
  const hasDate = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i.test(l)
    || /\b(19|20)\d{2}\s*[–—-]\s*((19|20)\d{2}|present)\b/i.test(l);
  if (l.includes('|') || hasDate) return true;
  if (/[.!?]$/.test(l) || l.length > 90) return false;
  if (/^(Built|Developed|Created|Implemented|Designed|Worked|Engineered|Automated|Optimized|Led|Managed)\b/i.test(l)) return false;
  return true;
}

function formatProjectBullet(text) {
  const raw = bulletText(String(text || '').trim()).replace(/\s+/g, ' ').replace(/[.!?]*$/, '');
  if (!raw) return '';
  const body = raw.charAt(0).toUpperCase() + raw.slice(1);
  return `- ${body}.`;
}

function formatProjectTitleLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return '';
  const { left } = splitRoleAndDates(raw);
  const name = left.split('|')[0].trim() || left.trim();
  return name.replace(/\s+/g, ' ').replace(/[–—-]\s*$/, '').trim();
}

function parseProjectEntries(block) {
  const lines = String(block || '').split('\n').map(l => l.replace(/\s+$/, ''));
  const header = lines.find(l => isProjectsHeader(l)) || 'PROJECTS';
  const entries = [];
  let current = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || isProjectsHeader(l)) continue;
    if (isBulletLine(raw) || isBulletLine(l)) {
      if (!current) current = { title: '', bullets: [] };
      current.bullets.push(bulletText(l));
      continue;
    }
    if (isProjectTitleLine(l)) {
      if (current) entries.push(current);
      current = { title: l, bullets: [] };
      continue;
    }
    if (!current) current = { title: '', bullets: [] };
    if (!current.title && l.length < 90 && !/[.!?]$/.test(l)) current.title = l;
    else current.bullets.push(l.replace(/^[-•*·◦▸▶]\s+/, ''));
  }
  if (current) entries.push(current);
  return { header, entries: entries.filter(e => e.title || e.bullets.length) };
}

function formatProjectsBlock(masterBlock, tailoredBlock) {
  const master = parseProjectEntries(masterBlock);
  const tailored = parseProjectEntries(tailoredBlock || '');
  const header = normalizeHeader(master.header) || 'PROJECTS';
  const lines = [header];
  for (const m of master.entries) {
    const match = tailored.entries.find(p => {
      const a = projectTitleKey(p.title);
      const b = projectTitleKey(m.title);
      return a && b && (a === b || a.includes(b) || b.includes(a));
    });
    const title = formatProjectTitleLine(m.title || match?.title || 'Project');
    const bullets = (match?.bullets?.length ? match.bullets : m.bullets)
      .map(formatProjectBullet)
      .filter(Boolean);
    if (title) lines.push(title);
    lines.push(...(bullets.length ? bullets : m.bullets.map(formatProjectBullet).filter(Boolean)));
  }
  return lines.join('\n').trim();
}

function stripSectionsByHeader(text, predicate) {
  const lines = String(text || '').split('\n');
  const out = [];
  let i = 0;
  let firstAt = -1;
  while (i < lines.length) {
    if (isAnySectionHeader(lines[i]) && predicate(lines[i])) {
      if (firstAt < 0) firstAt = out.length;
      i += 1;
      while (i < lines.length && !isAnySectionHeader(lines[i])) i += 1;
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return { lines: out, firstAt };
}

function syncProjectsFromMaster(tailored, master) {
  const masterAll = extractResumeSections(master);
  const masterProjects = masterAll
    .filter(s => isProjectsHeader(s.header))
    .map(s => s.lines.join('\n').replace(/\s+$/, ''))
    .filter(Boolean);
  const tailoredProjects = extractResumeSections(tailored)
    .filter(s => isProjectsHeader(s.header))
    .map(s => s.lines.join('\n').replace(/\s+$/, ''))
    .filter(Boolean);
  const { lines, firstAt } = stripSectionsByHeader(tailored, isProjectsHeader);
  if (!masterProjects.length) return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const block = formatProjectsBlock(masterProjects.join('\n\n'), tailoredProjects.join('\n\n')).split('\n');
  if (firstAt >= 0) {
    lines.splice(firstAt, 0, ...block);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const firstMasterIdx = masterAll.findIndex(s => isProjectsHeader(s.header));
  const prev = firstMasterIdx > 0
    ? [...masterAll.slice(0, firstMasterIdx)].reverse().find(s => {
        const key = normalizeHeader(s.header);
        return lines.some(l => isAnySectionHeader(l) && fuzzyHeaderMatch(normalizeHeader(l), key));
      })
    : null;
  if (prev) {
    const idx = lines.findIndex(l => fuzzyHeaderMatch(normalizeHeader(l), normalizeHeader(prev.header)));
    if (idx >= 0) {
      let end = lines.length;
      for (let j = idx + 1; j < lines.length; j++) {
        if (isAnySectionHeader(lines[j])) { end = j; break; }
      }
      lines.splice(end, 0, ...block);
      return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
  }
  lines.push('', ...block);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function restoreExtraSections(tailored, master) {
  const masterAll = extractResumeSections(master);
  // Projects/certs/education are injected from verified fields — never merge from text.
  const extra = masterAll.filter(s => {
    if (isCoreSection(s.header) || isProjectsHeader(s.header)) return false;
    if (/^certif/i.test(normalizeHeader(s.header))) return false;
    return true;
  });
  let text = String(tailored || '');
  if (!extra.length) return text;
  const presentHeaders = () => extractResumeSections(text).map(s => normalizeHeader(s.header));
  const hasHeader = (header) => presentHeaders().some(h => fuzzyHeaderMatch(h, normalizeHeader(header)));
  for (let i = 0; i < masterAll.length; i++) {
    const sec = masterAll[i];
    if (isCoreSection(sec.header) || isProjectsHeader(sec.header)) continue;
    if (/^certif/i.test(normalizeHeader(sec.header))) continue;
    if (hasHeader(sec.header)) continue;
    const block = sec.lines.join('\n').replace(/\s+$/, '');
    const prev = [...masterAll.slice(0, i)].reverse().find(s => hasHeader(s.header));
    const lines = text.split('\n');
    if (prev) {
      const idx = lines.findIndex(l => fuzzyHeaderMatch(normalizeHeader(l), normalizeHeader(prev.header)));
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
  if (/SKILL|CERTIF|SUMMARY/.test(sec)) return false;
  if (/EDUCATION/.test(sec)) return false;
  if (/PROJECT/.test(sec)) return isProjectTitleLine(l);
  if (/^client\s*:/i.test(l)) return true;
  const hasDate = new RegExp(`\\b${ROLE_MONTH_YEAR}\\b`, 'i').test(l)
    || /\b(19|20)\d{2}\s*[–—-]\s*((19|20)\d{2}|present)\b/i.test(l);
  const withoutDates = String(l || '').replace(ROLE_DATE_RE, '').replace(/[\s|,.–—-]+/g, '');
  if (hasDate && !withoutDates && !String(l).includes('|')) return false;
  if (hasDate && /EXPERIENCE/.test(sec) && l.length < 140) return true;
  if (l.includes('|') && hasDate) return true;
  if (l.includes('|') && /EXPERIENCE/.test(sec) && l.length < 140) return true;
  return false;
}

function isEducationLine(l, section) {
  if (!l || isBulletLine(l)) return false;
  if (!/EDUCATION/.test(String(section || '').toUpperCase())) return false;
  // Left of " | " is the course/degree field when we serialize verified education.
  if (l.includes('|')) return true;
  // Legacy plain-text degrees only — never "any short first line".
  return /\b(bachelor'?s?|master'?s?|b\.?\s?s\.?|m\.?\s?s\.?|mba|ph\.?d|associate|diploma|degree|b\.?\s?tech|m\.?\s?tech)\b/i.test(l)
    && !/\b(university|college|institute|school|polytechnic)\b/i.test(l);
}

/** Bold ONLY the course/degree field value — never school/dates. */
function formatEduBlockFromFields(e) {
  const degree = String((e && e.degree) || '').trim().replace(/[.,]+$/, '');
  const school = [e && e.institution, e && e.location].filter(Boolean).join(', ').replace(/[.,]+$/, '').trim();
  const years = [e && e.start_date, e && e.end_date].filter(Boolean).join(' – ');
  const schoolLine = [school, years].filter(Boolean).join(', ');
  if (!degree && !schoolLine) return '';
  let html = `<div class="r-entry r-entry-edu"><div class="r-edu-block">`;
  if (degree) html += `<div class="r-edu-degree"><b>${escapeHtml(degree)}</b></div>`;
  if (schoolLine) html += `<div class="r-edu-school">${escapeHtml(schoolLine)}</div>`;
  html += `</div></div>`;
  return html;
}

function formatEduHtml(line) {
  let raw = unstickGluedResumeText(String(line || '').trim());
  raw = raw.replace(/\s*Graduated:?\s*/i, ', ').replace(/,\s*,/g, ',').trim();
  if (!raw) return '';
  const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // parts[0] = course/degree field; rest = college/dates (never bold)
    const degree = escapeHtml(parts[0].replace(/[.,]+$/, ''));
    const school = escapeHtml(parts.slice(1).join(', ').replace(/[.,]+$/, ''));
    return `<div class="r-edu-block">`
      + `<div class="r-edu-degree"><b>${degree}</b></div>`
      + `<div class="r-edu-school">${school}</div>`
      + `</div>`;
  }
  const comma = raw.indexOf(',');
  const after = comma > 0 ? raw.slice(comma + 1).trim() : '';
  if (comma > 12
    && /\b(bachelor'?s?|master'?s?|b\.?\s?s|m\.?\s?s|mba|ph\.?d|b\.?\s?tech|m\.?\s?tech|associate|diploma)\b/i.test(raw.slice(0, comma))
    && /\b(university|college|institute|school|polytechnic)\b/i.test(after)) {
    return `<div class="r-edu-block">`
      + `<div class="r-edu-degree"><b>${escapeHtml(raw.slice(0, comma).trim())}</b></div>`
      + `<div class="r-edu-school">${escapeHtml(after)}</div>`
      + `</div>`;
  }
  return `<div class="r-edu-block"><div class="r-edu-degree"><b>${escapeHtml(raw)}</b></div></div>`;
}

const ROLE_MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const ROLE_MONTH_YEAR = ROLE_MONTH + '\\.?\\s*[-./]?\\s*(?:19|20)\\d{2}';
const ROLE_DATE_RE = new RegExp(
  `((?:${ROLE_MONTH_YEAR})\\s*[–—\\-to]+\\s*(?:Present|Current|Now|${ROLE_MONTH_YEAR}))\\s*$`,
  'i',
);

function normalizeMonthYearTokens(s) {
  return String(s || '').replace(
    new RegExp(`\\b(${ROLE_MONTH})\\.?\\s*[-./]\\s*((?:19|20)\\d{2})\\b`, 'gi'),
    (_, m, y) => `${m.replace(/\./g, '')} ${y}`,
  );
}

function compactMonthDates(dates, compact) {
  let d = normalizeMonthYearTokens(String(dates || '')).replace(/\s*[–—-]\s*/g, ' – ').replace(/\s+to\s+/i, ' – ');
  if (!compact) return d;
  return d
    .replace(/\bJanuary\b/gi, 'Jan')
    .replace(/\bFebruary\b/gi, 'Feb')
    .replace(/\bMarch\b/gi, 'Mar')
    .replace(/\bApril\b/gi, 'Apr')
    .replace(/\bJune\b/gi, 'Jun')
    .replace(/\bJuly\b/gi, 'Jul')
    .replace(/\bAugust\b/gi, 'Aug')
    .replace(/\bSeptember\b/gi, 'Sep')
    .replace(/\bOctober\b/gi, 'Oct')
    .replace(/\bNovember\b/gi, 'Nov')
    .replace(/\bDecember\b/gi, 'Dec');
}

function linkify(text) {
  const line = formatContactLine(text);
  const re = /(https?:\/\/[^\s|]+|linkedin\.com\/(?:in|pub)\/[^\s|]+|lnkd\.in\/[^\s|]+|github\.com\/[A-Za-z0-9_-]+)/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    out += escapeHtml(line.slice(last, m.index));
    const url = m[0];
    const href = /^https?:\/\//.test(url) ? url : 'https://' + url;
    const display = /linkedin/i.test(url)
      ? (shortenLinkedIn(url) || url)
      : (/github\.com/i.test(url) ? (extractGithubHandle(url) || url) : url);
    out += `<a href="${escapeHtml(href)}">${escapeHtml(display)}</a>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(line.slice(last));
}

function splitRoleAndDates(line) {
  const raw = normalizeMonthYearTokens(String(line || ''));
  const m = raw.match(ROLE_DATE_RE);
  if (!m) return { left: raw.trim(), dates: '' };
  return {
    left: raw.slice(0, m.index).replace(/[\s|]+$/, '').trim(),
    dates: normalizeMonthYearTokens(m[1]).replace(/\s*[–—-]\s*/g, ' – ').replace(/\s+to\s+/i, ' – '),
  };
}

function looksLikeJobTitleToken(s) {
  return /\b(engineer|analyst|scientist|developer|manager|architect|consultant|specialist|lead|director|associate|intern|officer|coordinator|administrator|programmer|designer|technician|owner|master|trainer|recruiter|accountant|teacher|professor|executive|president|founder|head|coach|tester|sre|devops)\b/i.test(String(s || ''));
}

function looksLikeLocationToken(s, opts = {}) {
  const t = String(s || '').trim();
  if (!t || t.length > 48) return false;
  if (/^(job title|job|title|company|location|month|yyyy|present|current|dates?)$/i.test(t)) return false;
  if (looksLikeJobTitleToken(t)) return false;
  if (/^(full[- ]?time|part[- ]?time|contract|permanent|temporary|freelance|w2|c2c)$/i.test(t)) return false;
  if (/^(inc|llc|ltd|corp|corporation|technologies|systems|labs|group|services)$/i.test(t)) return false;
  if (/^(remote|hybrid|onsite|on-site)(?:\s*[–—,-]\s*(usa|us|india|uk|united states))?$/i.test(t)) return true;
  if (/^(india|usa|us|united states|uk|united kingdom|canada|germany|singapore|uae|australia)$/i.test(t)) return true;
  if (new RegExp(`^(?:${US_STATE_ABBR})$`, 'i').test(t)) return true;
  if (typeof PLACE_RE !== 'undefined' && PLACE_RE.test(t) && !/[A-Z][a-z]+[A-Z]/.test(t.replace(/\s/g, ''))) {
    const onlyPlace = t.replace(PLACE_RE, '').replace(/[\s,]/g, '');
    if (!onlyPlace || onlyPlace.length < 3) return true;
  }
  if (/^[A-Za-z .'-]+,\s*(?:[A-Z]{2}|USA|US|United States|India|UK|UAE|Canada)$/i.test(t)) return true;
  return false;
}

function splitCompanyLocation(company) {
  const t = String(company || '').trim();
  if (!t) return { company: '', location: '' };
  const us = t.match(/^(.*?),\s*([A-Za-z .'-]+,\s*[A-Z]{2}(?:\s*,?\s*USA)?)$/);
  if (us && looksLikeLocationToken(us[2], { strong: true })) {
    return { company: us[1].trim(), location: us[2].trim() };
  }
  const remote = t.match(/^(.*?),\s*(Remote|Hybrid|On[- ]?site)$/i);
  if (remote) return { company: remote[1].trim(), location: remote[2].trim() };
  return { company: t, location: '' };
}

function unstickTitleLocation(title) {
  const t = String(title || '').trim();
  if (!t) return { title: '', location: '' };
  const cityHit = t.match(/^(.*?)[\s,]+([A-Z][a-zA-Z.'-]+(?:[\s-][A-Z][a-zA-Z.'-]+){0,2})$/);
  if (cityHit && looksLikeJobTitleToken(cityHit[1]) && looksLikeLocationToken(cityHit[2])) {
    return { title: cityHit[1].replace(/[,\s]+$/g, '').trim(), location: cityHit[2].trim() };
  }
  const stateHit = t.match(new RegExp(`^(.*?)\\s*(${US_STATE_ABBR})$`, ''));
  if (stateHit && looksLikeJobTitleToken(stateHit[1]) && stateHit[1].length > 6) {
    return { title: stateHit[1].trim(), location: stateHit[2] };
  }
  const gluedState = t.match(new RegExp(`^(.*[a-z])(${US_STATE_ABBR})$`));
  if (gluedState && looksLikeJobTitleToken(gluedState[1])) {
    return { title: gluedState[1].trim(), location: gluedState[2] };
  }
  const country = t.match(/^(.*?)[\s,]*(India|USA|UK|UAE|Canada|Germany|Singapore|Australia)$/i);
  if (country && looksLikeJobTitleToken(country[1]) && country[1].length > 6) {
    return { title: country[1].replace(/[,\s]+$/, '').trim(), location: country[2] };
  }
  const gluedCountry = t.match(/^(.*[a-z])(India|USA|UK|Canada)$/i);
  if (gluedCountry && looksLikeJobTitleToken(gluedCountry[1])) {
    return { title: gluedCountry[1].trim(), location: gluedCountry[2] };
  }
  return { title: t, location: '' };
}
function parseRoleLineParts(line) {
  const cleaned = unstickGluedResumeText(String(line || ''));
  const { left, dates } = splitRoleAndDates(cleaned);
  const parts = left.split('|').map(s => s.trim()).filter(p => p && !/^(job title|month yyyy)$/i.test(p));
  let company = '';
  let location = '';
  let title = '';
  if (parts.length >= 3) {
    company = parts[0];
    if (looksLikeLocationToken(parts[1]) && !looksLikeLocationToken(parts[2])) {
      location = parts[1];
      title = parts.slice(2).join(' ');
    } else if (looksLikeLocationToken(parts[parts.length - 1])) {
      location = parts[parts.length - 1];
      title = parts.slice(1, -1).join(' ');
    } else {
      title = parts.slice(1).join(' ');
    }
  } else if (parts.length === 2) {
    const second = unstickCompanyPlace(parts[1]);
    if (looksLikeJobTitleToken(parts[0]) && second.company && second.location) {
      title = parts[0];
      company = second.company;
      location = second.location;
    } else if (looksLikeJobTitleToken(parts[0]) && !looksLikeJobTitleToken(parts[1]) && !looksLikeLocationToken(parts[1])) {
      title = parts[0];
      company = second.company || parts[1];
      location = second.location || '';
    } else {
      company = parts[0];
      if (second.location && second.company !== parts[1]) {
        company = parts[0];
        const leftCo = unstickCompanyPlace(parts[0]);
        if (looksLikeJobTitleToken(parts[0])) {
          title = parts[0];
          company = second.company;
          location = second.location;
        } else {
          location = second.location;
          title = '';
        }
      } else if (looksLikeLocationToken(parts[1], { strong: true })) {
        location = parts[1];
      } else {
        title = parts[1];
      }
    }
  } else {
    company = left;
  }
  if (!location && company) {
    const split = unstickCompanyPlace(company);
    if (split.location && split.company && split.company !== company) {
      company = split.company;
      location = split.location;
    }
  }
  if (title && !location) {
    const u = unstickTitleLocation(title);
    if (u.location) {
      title = u.title;
      location = u.location;
    } else {
      const c = unstickCompanyPlace(title);
      if (c.location && c.company) {
        if (looksLikeJobTitleToken(company)) {
          title = company;
          company = c.company;
        }
        location = c.location;
      }
    }
  }
  if (!title && company && looksLikeJobTitleToken(company) && location) {
    const loc = unstickCompanyPlace(location);
    if (loc.company && loc.location) {
      title = company;
      company = loc.company;
      location = loc.location;
    }
  }
  if (looksLikeJobTitleToken(company) && title && !looksLikeJobTitleToken(title) && !looksLikeLocationToken(title)) {
    const tmp = company;
    const u = unstickCompanyPlace(title);
    company = u.company || title;
    title = tmp;
    if (u.location) location = location || u.location;
  }
  if (/^job title$/i.test(title)) title = '';
  return { company, location, title, dates };
}

function formatRoleLineFromParts({ company, location, title, dates }) {
  if (!company) return '';
  if (location && title) {
    return `${company} | ${location} | ${title}${dates ? ' ' + dates : ''}`.replace(/\s+/g, ' ').trim();
  }
  if (title) return `${company} | ${title}${dates ? ' ' + dates : ''}`.replace(/\s+/g, ' ').trim();
  if (location) return `${company} | ${location}${dates ? ' ' + dates : ''}`.replace(/\s+/g, ' ').trim();
  return `${company}${dates ? ' ' + dates : ''}`.replace(/\s+/g, ' ').trim();
}

function companyMatchKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractExperienceRoleRecords(resumeText) {
  const lines = mergeHangingRoleDates(String(resumeText || '').split('\n'));
  const { start, end } = experienceBounds(lines);
  const records = [];
  for (let i = start; i < end; i++) {
    if (!isRoleLine(lines[i], 'EXPERIENCE')) continue;
    const p = parseRoleLineParts(lines[i]);
    if (p.company) records.push(p);
  }
  if (records.length) return records;
  return extractRolesFromResume(resumeText || '')
    .map(line => parseRoleLineParts(line))
    .filter(p => p.company);
}

function formatExperienceLocationLock(resumeText) {
  const roles = extractExperienceRoleRecords(resumeText);
  if (!roles.length) {
    return 'LOCKED EXPERIENCE LOCATIONS: copy a city/Remote on a role line ONLY if it already appears on that master role. If a role has no location, write Company | <exact master title> Month YYYY – Month YYYY. Never invent Remote, a city, a state, or company HQ. Never write the words "Job Title".';
  }
  const lines = roles.map((r, i) => {
    const title = r.title || 'the master job title';
    const dates = r.dates || '';
    const dateBit = dates ? ` ${dates}` : '';
    if (r.location) {
      return `  ${i + 1}. ${r.company} — KEEP location "${r.location}". Write: ${r.company} | ${r.location} | ${title}${dateBit}`.replace(/\s+/g, ' ').trim()
        + (dates ? '' : '  Dates are empty on the verified form — omit dates.');
    }
    return `  ${i + 1}. ${r.company} — NO location on master. Write: ${r.company} | ${title}${dateBit}`.replace(/\s+/g, ' ').trim()
      + '  Do NOT add Remote, a city, a state, or HQ.'
      + (dates ? '' : '  Dates are empty on the verified form — omit dates.');
  });
  return `LOCKED EXPERIENCE LOCATIONS (copy from master; never invent):\n${lines.join('\n')}\nNever write the placeholder words "Job Title" or "Month YYYY" on the page.`;
}

function companyKeysMatch(a, b) {
  const x = companyMatchKey(a);
  const y = companyMatchKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const strip = s => s.replace(/(incorporated|inc|llc|ltd|corp|corporation|company|co|technologies|tech|labs|group)$/g, '');
  return strip(x) === strip(y);
}

function matchMasterExperienceRole(parsed, masterRoles) {
  const cands = (masterRoles || []).filter(m => companyKeysMatch(m.company, parsed.company));
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const titleLc = String(parsed.title || '').toLowerCase().trim();
  const datesLc = String(parsed.dates || '').toLowerCase().trim();
  const byTitle = cands.filter(m => {
    const mt = String(m.title || '').toLowerCase().trim();
    return mt && titleLc && (mt === titleLc || mt.includes(titleLc) || titleLc.includes(mt));
  });
  if (byTitle.length === 1) return byTitle[0];
  const byDates = cands.filter(m => {
    const md = String(m.dates || '').toLowerCase();
    return md && datesLc && (datesLc.includes(md.slice(0, 8)) || md.includes(datesLc.slice(0, 8)));
  });
  if (byDates.length === 1) return byDates[0];
  return (byTitle[0] || cands[0]);
}

function restoreMasterExperienceLocations(text, master) {
  const masterRoles = extractExperienceRoleRecords(master);
  if (!masterRoles.length) return text;
  const lines = String(text || '').split('\n');
  const { start, end } = experienceBounds(lines);
  if (!/EXPERIENCE|WORK HISTORY/i.test(String(lines[start] || ''))) return text;
  for (let i = start; i < end; i++) {
    if (!isRoleLine(lines[i], 'EXPERIENCE')) continue;
    const p = parseRoleLineParts(lines[i]);
    if (!p.company) continue;
    const hit = matchMasterExperienceRole(p, masterRoles);
    if (!hit) {
      if (p.location) {
        p.location = '';
        const next = formatRoleLineFromParts(p);
        if (next) lines[i] = next;
      }
      continue;
    }
    p.location = String(hit.location || '').trim();
    p.dates = String(hit.dates || '').trim();
    if (!p.title && hit.title) p.title = hit.title;
    const next = formatRoleLineFromParts(p);
    if (next) lines[i] = next;
  }
  return lines.join('\n');
}

function restoreMasterNamedSection(text, master, headerTest) {
  const masterSec = extractResumeSections(master).find(s => headerTest(s.header));
  if (!masterSec) return text;
  const block = masterSec.lines
    .map(l => (typeof unstickGluedResumeText === 'function' ? unstickGluedResumeText(l) : l))
    .join('\n')
    .replace(/\s+$/, '');
  if (!block.trim()) return text;
  const { lines, firstAt } = stripSectionsByHeader(text, headerTest);
  const insert = block.split('\n');
  if (firstAt >= 0) {
    lines.splice(firstAt, 0, ...insert);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  lines.push('', ...insert);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function dropSectionIfMissingOnMaster(text, master, headerTest) {
  const has = extractResumeSections(master).some(s => headerTest(s.header));
  if (has) return text;
  const stripped = stripSectionsByHeader(text, headerTest);
  return stripped.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function verifiedResumeSource() {
  return normalizeResumeJson(
    frozenMasterResumeJson()
    || verifiedResumeJson()
    || (state.baseResume && state.baseResume.fields)
    || emptyResumeJson(),
  );
}

/** Format-only blocks from verified fields — never invent or tailor content. */
function formatVerifiedEducationText(rj) {
  const edus = (rj && rj.education) || [];
  if (!edus.length) return '';
  const seen = new Set();
  const blocks = [];
  for (const e of edus) {
    const degree = String(e.degree || '').trim().replace(/[.,]+$/, '');
    const school = [e.institution, e.location].filter(Boolean).join(', ').replace(/[.,]+$/, '').trim();
    const years = [e.start_date, e.end_date].filter(Boolean).join(' – ');
    const key = `${degree}|${school}|${years}`.toLowerCase();
    if (!degree && !school) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const schoolLine = [school, years].filter(Boolean).join(', ');
    // Emit degree | school so HTML always treats degree as bold (no wording heuristics).
    if (degree && schoolLine) blocks.push(`${degree} | ${schoolLine}`);
    else blocks.push([degree, schoolLine].filter(Boolean).join('\n'));
  }
  return blocks.length ? `EDUCATION\n${blocks.join('\n\n')}` : '';
}

function formatVerifiedProjectsText(rj) {
  const projects = (rj && rj.projects) || [];
  if (!projects.length) return '';
  const seen = new Set();
  const blocks = [];
  for (const p of projects) {
    const name = String(p.name || '').trim();
    const key = name.toLowerCase();
    if (!name && !(p.bullets || []).length) continue;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const bullets = (p.bullets || []).map(b => `- ${String(b).replace(/^[-•]\s+/, '')}`);
    blocks.push([name, ...bullets].filter(Boolean).join('\n'));
  }
  return blocks.length ? `PROJECTS\n${blocks.join('\n\n')}` : '';
}

function formatVerifiedCertificationsText(rj) {
  const certs = (rj && rj.certifications) || [];
  if (!certs.length) return '';
  const seen = new Set();
  const lines = [];
  for (const c of certs) {
    const name = String(c.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push([name, c.date].filter(Boolean).join(' | '));
  }
  return lines.length ? `CERTIFICATIONS\n${lines.join('\n')}` : '';
}

function formatVerifiedOtherText(rj) {
  const others = (rj && rj.other_sections) || [];
  if (!others.length) return '';
  const blocks = [];
  for (const o of others) {
    const name = String(o.section_name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const heading = String(o.heading || '').trim();
    const dataLines = String(o.data || '').split(/\n+/).map(l => l.trim()).filter(Boolean)
      .map(l => (/^[-•]/.test(l) ? `- ${l.replace(/^[-•]\s+/, '')}` : `- ${l}`));
    if (!name && !heading && !dataLines.length) continue;
    blocks.push([name, heading, ...dataLines].filter(Boolean).join('\n'));
  }
  return blocks.join('\n\n');
}

function formatVerifiedStaticLockBlock() {
  const rj = verifiedResumeSource();
  const edu = formatVerifiedEducationText(rj);
  const projects = formatVerifiedProjectsText(rj);
  const certs = formatVerifiedCertificationsText(rj);
  const other = formatVerifiedOtherText(rj);
  return `STATIC SECTIONS — FORMAT ONLY (from verified fields). Do NOT rewrite, tailor, expand, shrink, or invent these.
Do NOT output EDUCATION, PROJECTS, CERTIFICATIONS, or OTHER custom sections — the app injects them once after you write.
Tailor ONLY: SUMMARY, SKILLS / TECHNICAL SKILLS, PROFESSIONAL EXPERIENCE.
${edu ? `\nVERIFIED EDUCATION (injected later — do not print):\n${edu}` : '\nNo verified EDUCATION — omit it.'}
${projects ? `\nVERIFIED PROJECTS (injected later — do not print):\n${projects}` : '\nNo verified PROJECTS — omit it.'}
${certs ? `\nVERIFIED CERTIFICATIONS (injected later — do not print):\n${certs}` : '\nNo verified CERTIFICATIONS — omit it.'}
${other ? `\nVERIFIED OTHER SECTIONS (injected later — do not print):\n${other}` : '\nNo verified OTHER sections — omit them.'}`;
}

/** Strip model EDUCATION/PROJECTS/CERTS/OTHER and inject verified fields once (format-only). */
function applyVerifiedStaticSections(text) {
  const rj = verifiedResumeSource();
  let t = String(text || '');
  t = stripSectionsByHeader(t, l => /^education$/i.test(normalizeHeader(l))).lines.join('\n');
  t = stripSectionsByHeader(t, isProjectsHeader).lines.join('\n');
  t = stripSectionsByHeader(t, l => /^certif/i.test(normalizeHeader(l))).lines.join('\n');
  const otherNames = new Set(
    ((rj.other_sections || []).map(o => normalizeHeader(o.section_name)).filter(Boolean)),
  );
  if (otherNames.size) {
    t = stripSectionsByHeader(t, l => otherNames.has(normalizeHeader(l))).lines.join('\n');
  }
  t = t.replace(/\n{3,}/g, '\n\n').trim();

  const edu = formatVerifiedEducationText(rj);
  const projects = formatVerifiedProjectsText(rj);
  const certs = formatVerifiedCertificationsText(rj);
  const other = formatVerifiedOtherText(rj);

  const insertAfter = (haystack, afterTest, block) => {
    if (!block) return haystack;
    const lines = haystack.split('\n');
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!isAnySectionHeader(lines[i])) continue;
      if (afterTest(lines[i])) {
        let end = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          if (isAnySectionHeader(lines[j])) { end = j; break; }
        }
        insertAt = end;
      }
    }
    const chunk = block.split('\n');
    if (insertAt >= 0) {
      lines.splice(insertAt, 0, '', ...chunk);
      return lines.join('\n');
    }
    return `${haystack}\n\n${block}`.trim();
  };

  // Order: after EXPERIENCE → EDUCATION → PROJECTS → CERTIFICATIONS → OTHER
  t = insertAfter(t, l => /experience|work history/i.test(normalizeHeader(l)), edu);
  t = insertAfter(t, l => /^education$/i.test(normalizeHeader(l)) || /experience|work history/i.test(normalizeHeader(l)), projects);
  t = insertAfter(
    t,
    l => isProjectsHeader(l) || /^education$/i.test(normalizeHeader(l)) || /experience|work history/i.test(normalizeHeader(l)),
    certs,
  );
  if (other) t = `${t}\n\n${other}`.trim();
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function restoreMasterEducation(text, master) {
  // Prefer verified fields; fall back to master text only if fields empty.
  const rj = verifiedResumeSource();
  if ((rj.education || []).length) return applyVerifiedStaticSections(text);
  const masterSec = extractResumeSections(master).find(s => /^education$/i.test(normalizeHeader(s.header)));
  if (!masterSec) return dropSectionIfMissingOnMaster(text, master, l => /^education$/i.test(normalizeHeader(l)));
  return restoreMasterNamedSection(text, master, l => /^education$/i.test(normalizeHeader(l)));
}

function restoreMasterCertifications(text, master) {
  const rj = verifiedResumeSource();
  if ((rj.certifications || []).length || (rj.projects || []).length || (rj.education || []).length || (rj.other_sections || []).length) {
    return applyVerifiedStaticSections(text);
  }
  const masterSec = extractResumeSections(master).find(s => /^certif/i.test(normalizeHeader(s.header)));
  if (!masterSec) return dropSectionIfMissingOnMaster(text, master, l => /^certif/i.test(normalizeHeader(l)));
  return restoreMasterNamedSection(text, master, l => /^certif/i.test(normalizeHeader(l)));
}

function isHangingRoleDateLine(l) {
  const t = String(l || '').trim();
  if (!t || t.includes('|') || isBulletLine(t) || (typeof isAnySectionHeader === 'function' && isAnySectionHeader(t))) return false;
  return typeof ROLE_DATE_RE !== 'undefined' && ROLE_DATE_RE.test(t) && t.length < 48;
}

function mergeHangingRoleDates(lines) {
  const src = Array.isArray(lines) ? lines : String(lines || '').split('\n');
  const { start, end } = experienceBounds(src);
  if (!/EXPERIENCE|WORK HISTORY/i.test(String(src[start] || ''))) return src;
  const out = src.slice();
  for (let i = start; i < end; i++) {
    if (!out[i] || !isRoleLine(out[i], 'EXPERIENCE')) continue;
    const p = parseRoleLineParts(out[i]);
    if (p.dates) continue;
    const next = String(out[i + 1] || '').trim();
    if (!isHangingRoleDateLine(next)) continue;
    out[i] = String(out[i]).replace(/\s+$/, '') + ' ' + next;
    out[i + 1] = '';
  }
  return out;
}

function normalizeOneRoleLine(line) {
  const parsed = parseRoleLineParts(line);
  if (!parsed.company) return String(line || '').trim();
  return formatRoleLineFromParts(parsed);
}

function normalizeExperienceRoleLines(text) {
  let lines = mergeHangingRoleDates(String(text || '').split('\n'));
  const { start, end } = experienceBounds(lines);
  for (let i = start; i < end; i++) {
    if (isRoleLine(lines[i], 'EXPERIENCE')) lines[i] = normalizeOneRoleLine(lines[i]);
  }
  return lines.join('\n');
}

function formatRoleHtml(line, opts = {}) {
  const { company, location, title, dates } = parseRoleLineParts(line);
  // Always bold: company, role, location, dates (contact line is never bold).
  const leftHtml = `<b>${escapeHtml(company)}</b>`
    + (title ? ` | <i><b>${escapeHtml(title)}</b></i>` : '');
  const dateStr = compactMonthDates(dates, !!opts.compactDates);
  const rightBits = [location, dateStr].filter(Boolean);
  const rightHtml = rightBits.map(escapeHtml).join('&nbsp;|&nbsp;');
  if (!rightHtml && !company) return '';
  if (!rightHtml) return `<p class="r-role">${leftHtml}</p>`;
  return `<table class="r-job" width="100%" cellspacing="0" cellpadding="0">`
    + `<colgroup><col class="r-col-left" /><col class="r-col-right" /></colgroup>`
    + `<tr>`
    + `<td class="r-job-left">${leftHtml}</td>`
    + `<td class="r-dates"><b>${rightHtml}</b></td>`
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
  const master = ($('resumeInput') && $('resumeInput').value) || resume;
  const locked = uniqTerms([...summaryKeywordList(state.keywords || {}, master), ...importantHrKeywords(state.keywords || {}, master)]);
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

function parseResumeToHtml(text, opts = {}) {
  if (!text || !text.trim()) return '';
  const roleOpts = { compactDates: !!opts.compactDates || opts.pages === 1 };
  const lines = mergeHangingRoleDates(String(text || '').split('\n'));
  let html = '';
  let i = 0;
  let currentSection = '';
  let entryOpen = false;
  let expectOtherHeading = false;
  const isCoreResumeSection = (sec) =>
    /SUMMARY|SKILL|EXPERIENCE|EDUCATION|PROJECT|CERTIF|OBJECTIVE|PROFILE|COMPETENC/.test(String(sec || ''));
  const closeEntry = () => {
    if (entryOpen) {
      html += '</div>';
      entryOpen = false;
    }
  };
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    const rawName = lines[i].trim();
    const displayName = rawName === rawName.toUpperCase() && rawName.length > 1 ? toTitleCase(rawName) : rawName;
    html += `<div class="r-name"><b>${escapeHtml(displayName)}</b></div>`;
    i++;
  }
  let headerCount = 0;
  let sawHeadline = false;
  while (i < lines.length && headerCount < 6) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    if (isSectionHeader(l)) break;
    const isContact = /@/.test(l)
      || /\d{3}[\s.()-]*\d{3}[\s.-]*\d{4}/.test(l)
      || /linkedin/i.test(l)
      || /\bgithub\b/i.test(l)
      || /lnkd\.in/i.test(l);
    if (!sawHeadline && !isContact && l.length < 70) {
      html += `<div class="r-headline"><b>${escapeHtml(stripPlaceFromJobTitle(cleanJobTitle(l) || l, ($('resumeInput') && $('resumeInput').value) || '') || l)}</b></div>`;
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
      closeEntry();
      currentSection = l.toUpperCase();
      html += `<div class="r-section"><b>${escapeHtml(currentSection)}</b></div>`;
      expectOtherHeading = !isCoreResumeSection(currentSection);
      // EDUCATION: render bold ONLY from verified Course/degree fields — skip text heuristics.
      if (/^EDUCATION$/.test(currentSection)) {
        const edus = ((verifiedResumeSource().education) || []).filter(e =>
          String(e.degree || '').trim() || String(e.institution || '').trim()
        );
        if (edus.length) {
          for (const e of edus) html += formatEduBlockFromFields(e);
          while (i + 1 < lines.length) {
            const peek = lines[i + 1].trim();
            if (peek && isAnySectionHeader(peek)) break;
            i++;
          }
          expectOtherHeading = false;
          continue;
        }
      }
    } else if (expectOtherHeading && !isBulletLine(l)) {
      expectOtherHeading = false;
      closeEntry();
      html += `<p class="r-other-heading"><b>${escapeHtml(l)}</b></p>`;
    } else if (isBulletLine(l)) {
      expectOtherHeading = false;
      const body = /EXPERIENCE|PROJECT|AWARD|VOLUNTEER|LEADERSHIP|PUBLICATION/.test(currentSection)
        || !isCoreResumeSection(currentSection)
        ? boldResumeKeywords(bulletText(l))
        : escapeHtml(bulletText(l));
      html += `<p class="r-bullet" align="left"><span class="r-bmark">•</span><span class="r-btext">${body}</span></p>`;
    } else if (/SKILL/.test(currentSection) && /^[A-Za-z][A-Za-z0-9 &\/+.#-]{1,50}:\s*\S/.test(l)) {
      closeEntry();
      const idx = l.indexOf(':');
      html += `<p class="r-skill-line"><span class="r-skill-label"><b>${escapeHtml(l.slice(0, idx))}:</b></span> ${escapeHtml(l.slice(idx + 1).trim())}</p>`;
    } else if (isEducationLine(l, currentSection)) {
      closeEntry();
      entryOpen = true;
      html += `<div class="r-entry r-entry-edu">${formatEduHtml(l)}`;
    } else if (/EDUCATION/.test(currentSection) && entryOpen && !isBulletLine(l) && !isRoleLine(l, currentSection)) {
      html += `<div class="r-edu-school">${escapeHtml(l.replace(/[.,]+$/, ''))}</div>`;
    } else if (isRoleLine(l, currentSection)) {
      closeEntry();
      entryOpen = true;
      html += `<div class="r-entry">${formatRoleHtml(l, roleOpts)}`;
    } else {
      closeEntry();
      const body = /SUMMARY/.test(currentSection) ? boldResumeKeywords(l) : linkify(l);
      html += `<p class="r-body">${body}</p>`;
    }
  }
  closeEntry();
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
    ${s}.r-job { width: 100%; border-collapse: collapse; table-layout: fixed; margin: ${t.spJob} 0 0 0; border: none; }
    ${s}.r-job col.r-col-left { width: 58%; }
    ${s}.r-job col.r-col-right { width: 42%; }
    ${s}.r-job td { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsRole}; font-weight: bold; color: #000000; padding: 0; line-height: ${t.lhRole}; vertical-align: bottom; mso-line-height-rule: exactly; border: none; text-align: left; }
    ${s}.r-job td:first-child, ${s}.r-job-left { padding-left: 4.55pt; width: 58%; }
    ${s}.r-dates { text-align: right !important; white-space: normal; width: 42%; vertical-align: bottom; font-weight: bold; }
    ${s}.r-edu-block { margin: ${t.spJob} 0 0 4.55pt; padding: 0; }
    ${s}.r-edu-degree { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsRole}; font-weight: bold; color: #000000; margin: 0; padding: 0; line-height: ${t.lhRole}; text-align: left; }
    ${s}.r-edu-school { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsBody}; font-weight: normal; color: #000000; margin: 0.6pt 0 0 0; padding: 0; line-height: ${t.lhBody}; text-align: left; }
    ${s}.r-entry-edu > .r-edu-school { margin-left: 4.55pt; }
    ${s}.r-role { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsRole}; font-weight: bold; color: #000000; margin: ${t.spJob} 0 0 4.55pt; line-height: ${t.lhRole}; text-align: left; }
    ${s}.r-role i, ${s}.r-job i { font-style: italic; font-weight: bold; }
    ${s}.r-bullet { font-family: Calibri, Arial, sans-serif; font-size: ${t.fsBody}; color: #000000; margin: 0 0 0 18pt; text-indent: -13.5pt; line-height: ${t.lhBody}; mso-line-height-rule: exactly; padding: 0; text-align: left; }
    ${s}.r-job + .r-bullet, ${s}.r-role + .r-bullet, ${s}.r-bullet + .r-bullet { margin-top: ${t.spBullet}; }
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
    .r-dates { text-align: right !important; white-space: normal; width: 42%; vertical-align: bottom; font-weight: bold; }
    .r-edu-degree { font-weight: bold; }
    .r-other-heading { font-weight: bold; color: #000000; margin: 1.5pt 0 0 4.55pt; padding: 0; text-align: left; }
    .r-edu-school { font-weight: normal !important; }
    .r-bmark, .r-btext { text-align: left; }
    .r-skill-label { font-weight: bold; color: #000000; }
    b, strong { font-weight: bold; color: #000000; }
    i, em { font-style: italic; }
    u { text-decoration: underline; }
    a { color: #1a56c4; text-decoration: underline; }
    .r-page-break { page-break-before: always; break-before: page; height: 0 !important; margin: 0; padding: 0; border: 0; }
    .r-page-start { page-break-before: always; break-before: page; padding-top: ${PAGE_MARGINS.page2Top}in; }
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

function applyResumeFitVars(el, bodyPt, lh, pages = 1) {
  if (!el || !el.style) return;
  const t = resumeTypeFromBody(bodyPt, lh);
  // Keep experience role/date lines readable so location|years stay locked on the right
  const roleFloor = pages > 1 ? 10.4 : 9.8;
  const rolePt = Math.max(bodyPt * 1.1, roleFloor);
  const roleLh = (Math.round(rolePt * (1 + (lh - 1) * 0.4) * 100) / 100) + 'pt';
  const roleFs = (Math.round(rolePt * 100) / 100) + 'pt';
  el.style.setProperty('--fs-name', t.fsName);
  el.style.setProperty('--lh-name', t.lhName);
  el.style.setProperty('--fs-title', t.fsTitle);
  el.style.setProperty('--fs-role', roleFs);
  el.style.setProperty('--lh-role', roleLh);
  el.style.setProperty('--fs-body', t.fsBody);
  el.style.setProperty('--lh-body', t.lhBody);
  el.style.setProperty('--sp-section', t.spSection);
  el.style.setProperty('--sp-job', t.spJob);
  el.style.setProperty('--sp-bullet', t.spBullet);
  el.style.setProperty('--sp-body', t.spBody);
  el.style.setProperty('--sp-skill', t.spSkill);
  el.style.setProperty('--job-left', pages > 1 ? '60%' : '55%');
  el.style.setProperty('--job-right', pages > 1 ? '40%' : '45%');
}

function measureResumeContent(paper) {
  let max = 0;
  for (const el of paper.children) {
    max = Math.max(max, el.offsetTop + el.offsetHeight);
  }
  return max;
}

const PAGE_FIT = {
  BODY_MIN: 8.8,
  BODY_MAX: 12,
  BODY_AVG: 10.4,
  LH_MIN: 0.92,
  LH_MAX: 1.08,
  FILL_MIN: 0.985,
  FIT_MAX: 0.998,
  MAX_PAGES: 2,
};

const PAGE_MARGINS = { top: 0.05, right: 0.10, bottom: 0.19, left: 0.10, page2Top: 0.5 };
const US_LETTER = { widthIn: 8.5, heightIn: 11 };

function letterPageSizeCss() {
  return `size: letter portrait; size: ${US_LETTER.widthIn}in ${US_LETTER.heightIn}in;`;
}

function pageMarginsCss(which = 'first') {
  const m = PAGE_MARGINS;
  const top = which === 'page2' ? (m.page2Top || m.top) : m.top;
  return `${top}in ${m.right}in ${m.bottom}in ${m.left}in`;
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

function measureFirstPageFill(paper, pageHi) {
  let fill = 0;
  for (const el of paper.children) {
    if (el.classList.contains('r-page-break')) continue;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top >= pageHi - 0.5) break;
    fill = bottom <= pageHi ? Math.max(fill, bottom) : pageHi;
    if (bottom > pageHi) break;
  }
  return fill;
}

function expandToFillFirstPage(measureFirst, measureTotal, apply, bodyPt, lh, loBound, totalHi, F) {
  let bestPt = bodyPt;
  let bestLh = lh;
  const fits = () => measureTotal() <= totalHi;
  const firstFill = () => measureFirst();

  if (firstFill() < loBound) {
    let lo = bodyPt;
    let hi = F.BODY_MAX;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      apply(mid, lh);
      if (!fits()) hi = mid;
      else if (firstFill() < loBound) { bestPt = mid; lo = mid; }
      else { bestPt = mid; break; }
    }
    bodyPt = Math.round(bestPt * 10) / 10;
    apply(bodyPt, lh);
  }

  if (firstFill() < loBound) {
    let lo = lh;
    let hi = F.LH_MAX;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      apply(bodyPt, mid);
      if (!fits()) hi = mid;
      else if (firstFill() < loBound) { bestLh = mid; lo = mid; }
      else { bestLh = mid; break; }
    }
    lh = Math.round(bestLh * 100) / 100;
    apply(bodyPt, lh);
  }

  return { bodyPt, lh: Math.round(lh * 100) / 100 };
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
  const pageHi = pageContentHeight() * F.FIT_MAX;
  const loBound = pageContentHeight() * F.FILL_MIN;
  const totalHi = pageHi * F.MAX_PAGES;
  const measure = () => {
    void paper.offsetHeight;
    return measureResumeContent(paper);
  };
  const measureFirst = () => {
    void paper.offsetHeight;
    return measureFirstPageFill(paper, pageHi);
  };
  const apply = (bodyPt, lh) => applyResumeFitVars(paper, bodyPt, lh);

  // Prefer one page: squeeze down to 8.8pt before spilling to page 2
  apply(F.BODY_MAX, 1);
  if (measure() <= pageHi) {
    const bodyPt = largestBodyThatFits(measure, apply, pageHi, F.BODY_MIN, F.BODY_MAX);
    return expandToFillPage(measure, apply, bodyPt, loBound, pageHi, F);
  }

  let bodyPt = largestBodyThatFits(measure, apply, pageHi, F.BODY_MIN, F.BODY_MAX);
  let lh = 1;
  apply(bodyPt, lh);
  if (measure() > pageHi) {
    lh = compressLhToHeight(measure, apply, bodyPt, pageHi, F.LH_MIN, F.LH_MAX);
  }
  apply(bodyPt, lh);
  if (measure() <= pageHi) {
    return expandToFillPage(measure, apply, bodyPt, loBound, pageHi, F);
  }

  // Still overflows at 8.8pt on one page — use page 2, then grow type to fill page 1
  bodyPt = F.BODY_MIN;
  lh = F.LH_MIN;
  apply(bodyPt, lh);
  if (measure() > totalHi) {
    lh = compressLhToHeight(measure, apply, bodyPt, totalHi, F.LH_MIN, F.LH_MAX);
  }
  const grown = expandToFillFirstPage(measureFirst, measure, apply, bodyPt, lh, loBound, totalHi, F);
  return { ...grown, pages: 2 };
}

function formatFitHint(fit) {
  if (!fit) return '';
  const pt = (fit.bodyPt || PAGE_FIT.BODY_AVG).toFixed(1);
  const namePt = (fit.bodyPt * 1.8).toFixed(1);
  if ((fit.pages || 1) > 1) {
    return `2 pages · ${pt}pt body (8.8pt min on one page; grown to fill page 1) · name ~${namePt}pt`;
  }
  return `1 page · ${pt}pt body (8.8–12pt, grown to fill the page) · name ~${namePt}pt`;
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

function clearPrintPageMarkers(paper) {
  if (!paper) return;
  paper.querySelectorAll('.r-page-start').forEach(el => el.classList.remove('r-page-start'));
  paper.querySelectorAll('.r-page-break').forEach(el => el.remove());
}

/** Keep experience/education blocks from splitting across the visual page line. */
function insertVisualPageBreak(paper) {
  if (!paper) return;
  clearPageBreaks(paper);
  const pageBreakY = inchesToPx(US_LETTER.heightIn);
  const page2Top = inchesToPx(PAGE_MARGINS.page2Top || PAGE_MARGINS.top);
  const kids = [...paper.children].filter(el => !el.classList.contains('r-page-break'));
  if (!kids.length) return;

  let idx = -1;
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top >= pageBreakY - 1) { idx = i; break; }
    if (bottom > pageBreakY && top < pageBreakY) { idx = i; break; }
  }
  if (idx < 0) return;

  let breakEl = kids[idx];
  for (let j = idx; j >= Math.max(0, idx - 12); j--) {
    const el = kids[j];
    if (el.classList.contains('r-entry') || el.classList.contains('r-section')) {
      const bottom = el.offsetTop + el.offsetHeight;
      if (el.offsetTop < pageBreakY * 0.55 && bottom <= pageBreakY + 2) {
        breakEl = kids[j + 1] || breakEl;
      } else {
        breakEl = el;
      }
      break;
    }
  }
  if (breakEl?.previousElementSibling?.classList.contains('r-section')
    && !breakEl.classList.contains('r-section')) {
    breakEl = breakEl.previousElementSibling;
  }
  if (!breakEl || !breakEl.parentNode) return;

  const prev = breakEl.previousElementSibling;
  const prevBottom = prev ? (prev.offsetTop + prev.offsetHeight) : 0;
  const gap = Math.max(inchesToPx(0.08), (pageBreakY - prevBottom) + page2Top);
  const spacer = document.createElement('div');
  spacer.className = 'r-page-break';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = `display:block;height:${Math.round(gap)}px;margin:0;padding:0;border:0;width:100%;`;
  paper.insertBefore(spacer, breakEl);
  breakEl.classList.add('r-page-start');
}

function currentResumeText() {
  if (state.editingResume) {
    const live = htmlToResumeText($('resumePaper'));
    if (live) return live;
  }
  return (state.tailoredResume || $('outputArea').textContent || '').trim();
}

function resumeNodePlain(el) {
  return String(el?.innerText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function htmlToResumeText(paper) {
  if (!paper) return '';
  const lines = [];
  const push = (s) => {
    const t = String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    if (t) lines.push(t);
  };
  const emit = (el) => {
    if (!el || el.nodeType !== 1) return;
    if (el.classList.contains('r-page-break') || el.classList.contains('r-rule')) return;
    if (el.classList.contains('r-entry') || el.classList.contains('r-edu-block') || el.classList.contains('r-page-2')) {
      [...el.children].forEach(emit);
      return;
    }
    if (el.classList.contains('r-bullet')) {
      const t = resumeNodePlain(el.querySelector('.r-btext') || el).replace(/^[-•*·◦▸▶]\s*/, '');
      // Keep empty bullets while editing so Insert • does not vanish on commit.
      lines.push(t ? ('• ' + t) : '• ');
      return;
    }
    if (el.classList.contains('r-job')) {
      const left = resumeNodePlain(el.querySelector('.r-job-left, td:first-child'));
      const right = resumeNodePlain(el.querySelector('.r-dates, td:last-child'));
      const leftParts = left.split('|').map(s => s.trim()).filter(Boolean);
      const rightParts = right.split('|').map(s => s.trim()).filter(Boolean);
      const company = leftParts[0] || '';
      const title = leftParts.slice(1).join(' | ');
      let location = '';
      let dates = '';
      if (rightParts.length >= 2) {
        location = rightParts.slice(0, -1).join(' | ');
        dates = rightParts[rightParts.length - 1];
      } else if (rightParts.length === 1) {
        const only = rightParts[0];
        if (new RegExp(`\\b${ROLE_MONTH_YEAR}\\b`, 'i').test(only) || /\b(19|20)\d{2}\b/.test(only) || /present|current/i.test(only)) {
          dates = only;
        } else {
          location = only;
        }
      }
      push(formatRoleLineFromParts({ company, location, title, dates }));
      return;
    }
    if (el.classList.contains('r-edu-degree')) {
      const school = el.nextElementSibling && el.nextElementSibling.classList.contains('r-edu-school')
        ? resumeNodePlain(el.nextElementSibling) : '';
      push(school ? `${resumeNodePlain(el)} | ${school}` : resumeNodePlain(el));
      return;
    }
    if (el.classList.contains('r-edu-school')) {
      const prev = el.previousElementSibling;
      if (prev && prev.classList.contains('r-edu-degree')) return;
      push(resumeNodePlain(el));
      return;
    }
    push(resumeNodePlain(el));
  };
  [...paper.children].forEach(emit);
  return lines.join('\n');
}

function setResumeEditChrome(on) {
  const paper = $('resumePaper');
  if (paper) {
    paper.contentEditable = on ? 'true' : 'false';
    paper.spellcheck = !!on;
    paper.classList.toggle('editing', !!on);
    paper.querySelectorAll('.r-page-break').forEach(el => {
      el.setAttribute('contenteditable', 'false');
    });
  }
  if ($('editResumeBtn')) $('editResumeBtn').classList.toggle('hidden', !!on);
  if ($('doneResumeBtn')) $('doneResumeBtn').classList.toggle('hidden', !on);
  if ($('resumeEditBar')) $('resumeEditBar').classList.toggle('hidden', !on);
  if ($('resumeRuler')) $('resumeRuler').classList.toggle('hidden', !on);
  if ($('resumeEditHint')) $('resumeEditHint').classList.toggle('hidden', !on);
  if ($('resumeFitHint')) $('resumeFitHint').classList.toggle('hidden', !!on);
}

function stopResumeEdit(opts = {}) {
  if (!state.editingResume && !opts.force) {
    setResumeEditChrome(false);
    if (opts.resetPaper) state.paperEdited = false;
    return;
  }
  state.editingResume = false;
  if (opts.resetPaper) state.paperEdited = false;
  setResumeEditChrome(false);
}

let savedEditRange = null;

function editPaperEl() {
  return $('resumePaper');
}

function editSelectionInPaper() {
  const paper = editPaperEl();
  if (!paper) return null;
  const sel = window.getSelection();
  if (sel && sel.rangeCount && sel.anchorNode && paper.contains(sel.anchorNode)) {
    try { return sel.getRangeAt(0).cloneRange(); } catch { /* ignore */ }
  }
  if (savedEditRange) {
    try {
      if (paper.contains(savedEditRange.commonAncestorContainer)) return savedEditRange.cloneRange();
    } catch { /* dead range */ }
  }
  return null;
}

function saveEditSelection() {
  if (!state.editingResume) return;
  const paper = editPaperEl();
  if (!paper) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.anchorNode || !paper.contains(sel.anchorNode)) return;
  try { savedEditRange = sel.getRangeAt(0).cloneRange(); } catch { /* ignore */ }
}

function restoreEditSelection() {
  const paper = editPaperEl();
  if (!paper) return false;
  try { paper.focus({ preventScroll: true }); } catch { paper.focus(); }
  const range = editSelectionInPaper();
  if (!range) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  try {
    sel.addRange(range);
    savedEditRange = range.cloneRange();
    return true;
  } catch {
    return false;
  }
}

/** Preserve caret before toolbar click steals focus. */
function prepEditToolbarAction(ev) {
  if (ev) {
    saveEditSelection();
    ev.preventDefault();
  }
}

function editCaretElement() {
  restoreEditSelection();
  const paper = editPaperEl();
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  if (!el || !paper || !paper.contains(el)) return null;
  return el;
}

function editClosestBlock(el) {
  if (!el) return null;
  return el.closest(
    '.r-bullet, .r-body, .r-skill-line, .r-edu-degree, .r-edu-school, .r-edu-block, '
    + '.r-section, .r-role, .r-job, .r-headline, .r-name, .r-contact, .r-entry, p, div, table',
  );
}

function makeBulletEl(text) {
  const neu = document.createElement('p');
  neu.className = 'r-bullet';
  neu.setAttribute('align', 'left');
  const body = String(text || '').trim();
  neu.innerHTML = body
    ? `<span class="r-bmark">•</span><span class="r-btext">${escapeHtml(body)}</span>`
    : '<span class="r-bmark">•</span><span class="r-btext"><br></span>';
  return neu;
}

function placeCaretIn(el, atEnd = true) {
  if (!el) return;
  const paper = editPaperEl();
  if (paper) {
    try { paper.focus({ preventScroll: true }); } catch { paper.focus(); }
  }
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  try {
    range.selectNodeContents(el);
    range.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
    savedEditRange = range.cloneRange();
  } catch { /* ignore */ }
}

function resumeEditCommand(cmd, value) {
  if (!state.editingResume) return;
  if (!restoreEditSelection()) {
    showToast('Click in the resume first, then use the toolbar', '#d97706');
    return;
  }
  try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
  document.execCommand(cmd, false, value == null ? null : value);
  state.paperEdited = true;
  commitPaperEdits();
  saveEditSelection();
  syncEditToolbar();
}

function resumeEditFontName(name) {
  if (!name) return;
  resumeEditCommand('fontName', name);
}

function resumeEditColor(color) {
  if (!color) return;
  resumeEditCommand('foreColor', color);
}

function resumeEditFontSize(pt) {
  if (!state.editingResume) return;
  const size = Number(pt);
  if (!size) return;
  if (!restoreEditSelection()) {
    showToast('Click in the resume first, then use the toolbar', '#d97706');
    return;
  }
  try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
  document.execCommand('fontSize', false, '7');
  const paper = editPaperEl();
  if (paper) {
    paper.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach(el => {
      el.style.fontSize = size + 'pt';
      if (el.tagName === 'FONT') {
        const span = document.createElement('span');
        span.style.cssText = el.style.cssText;
        span.style.fontSize = size + 'pt';
        while (el.firstChild) span.appendChild(el.firstChild);
        el.replaceWith(span);
      }
    });
  }
  state.paperEdited = true;
  commitPaperEdits();
  saveEditSelection();
  syncEditToolbar();
}

function resumeEditFontStep(delta) {
  if (!restoreEditSelection()) {
    showToast('Click in the resume first, then use the toolbar', '#d97706');
    return;
  }
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  const px = el ? parseFloat(getComputedStyle(el).fontSize) : 16;
  const pt = Math.round((px * 72) / 96) || 12;
  const next = Math.max(8, Math.min(28, pt + Number(delta || 0)));
  if ($('editFontSize')) $('editFontSize').value = String(next);
  resumeEditFontSize(next);
}

/** Insert a new bullet at the caret block (not at end of page). */
function resumeEditBullet() {
  if (!state.editingResume) return;
  const paper = editPaperEl();
  if (!paper) return;
  saveEditSelection();
  restoreEditSelection();
  let el = editCaretElement();
  if (!el) {
    // Fallback: last bullet, else last block, else paper end
    el = paper.querySelector('.r-bullet:last-of-type')
      || paper.querySelector('.r-entry:last-of-type')
      || paper.querySelector('.r-body:last-of-type')
      || paper;
  }
  const block = (el === paper) ? null : editClosestBlock(el);
  const neu = makeBulletEl('');
  if (block && paper.contains(block)) {
    if (block.classList.contains('r-entry') || block.classList.contains('r-edu-block')) {
      block.appendChild(neu);
    } else if (block.classList.contains('r-bullet') || block.classList.contains('r-body')
      || block.classList.contains('r-skill-line') || block.classList.contains('r-other-heading')) {
      block.after(neu);
    } else {
      block.after(neu);
    }
  } else {
    paper.appendChild(neu);
  }
  placeCaretIn(neu.querySelector('.r-btext') || neu, false);
  state.paperEdited = true;
  // Defer commit so caret sticks before text sync
  requestAnimationFrame(() => {
    commitPaperEdits();
    saveEditSelection();
    syncEditToolbar();
  });
}

function resumeEditIndent(dir) {
  if (!state.editingResume) return;
  const el = editCaretElement();
  if (!el) {
    showToast('Click a bullet or line first', '#d97706');
    return;
  }
  const block = el.closest('.r-bullet, .r-body, .r-skill-line, .r-other-heading');
  if (!block) {
    showToast('Indent works on bullets and body lines', '#d97706');
    return;
  }
  const cur = parseFloat(block.style.marginLeft) || 0;
  const next = Math.max(0, Math.min(72, cur + (dir > 0 ? 18 : -18)));
  block.style.marginLeft = next ? (next + 'pt') : '';
  state.paperEdited = true;
  commitPaperEdits();
  saveEditSelection();
}

/** Turn current line into a bullet, or unwrap a bullet back to body text. */
function resumeEditToggleBullet() {
  if (!state.editingResume) return;
  const paper = editPaperEl();
  const el = editCaretElement();
  if (!el || !paper) {
    showToast('Click a line first', '#d97706');
    return;
  }
  const bullet = el.closest('.r-bullet');
  if (bullet) {
    const text = resumeNodePlain(bullet.querySelector('.r-btext') || bullet).replace(/^[-•*·◦▸▶]\s*/, '').trim();
    const body = document.createElement('p');
    body.className = 'r-body';
    body.textContent = text || '';
    bullet.replaceWith(body);
    placeCaretIn(body, true);
  } else {
    const block = editClosestBlock(el);
    if (!block || block.classList.contains('r-section') || block.classList.contains('r-name')
      || block.classList.contains('r-headline') || block.classList.contains('r-contact')
      || block.classList.contains('r-job') || block.classList.contains('r-role')) {
      showToast('Place the cursor on a body or skill line to convert', '#d97706');
      return;
    }
    const text = resumeNodePlain(block).trim();
    const neu = makeBulletEl(text);
    block.replaceWith(neu);
    placeCaretIn(neu.querySelector('.r-btext') || neu, true);
  }
  state.paperEdited = true;
  commitPaperEdits();
  syncEditToolbar();
}

function resumeEditRemoveBullet() {
  if (!state.editingResume) return;
  const el = editCaretElement();
  const bullet = el && el.closest && el.closest('.r-bullet');
  if (!bullet) {
    showToast('Click inside a bullet first', '#d97706');
    return;
  }
  const next = bullet.nextElementSibling || bullet.previousElementSibling;
  bullet.remove();
  if (next) {
    const target = next.classList?.contains('r-bullet')
      ? (next.querySelector('.r-btext') || next)
      : next;
    placeCaretIn(target, true);
  }
  state.paperEdited = true;
  commitPaperEdits();
  syncEditToolbar();
}

function resumeEditInsertLine() {
  if (!state.editingResume) return;
  const paper = editPaperEl();
  const el = editCaretElement();
  if (!el || !paper) {
    showToast('Click where you want a blank line', '#d97706');
    return;
  }
  const block = editClosestBlock(el);
  const neu = document.createElement('p');
  neu.className = 'r-body';
  neu.innerHTML = '<br>';
  if (block && paper.contains(block)) block.after(neu);
  else paper.appendChild(neu);
  placeCaretIn(neu, false);
  state.paperEdited = true;
  commitPaperEdits();
  syncEditToolbar();
}

function syncEditToolbar() {
  if (!state.editingResume) return;
  const bar = $('resumeEditBar');
  if (!bar) return;
  bar.querySelectorAll('[data-cmd]').forEach(btn => {
    const cmd = btn.getAttribute('data-cmd');
    let on = false;
    try { on = document.queryCommandState(cmd); } catch { on = false; }
    btn.classList.toggle('active', !!on);
  });
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  const paper = editPaperEl();
  if (!el || !paper || !paper.contains(el)) return;
  const cs = getComputedStyle(el);
  const pt = Math.round((parseFloat(cs.fontSize) * 72) / 96);
  if ($('editFontSize') && [...$('editFontSize').options].some(o => Number(o.value) === pt)) {
    $('editFontSize').value = String(pt);
  }
  const fam = String(cs.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
  if ($('editFontName') && [...$('editFontName').options].some(o => o.value.toLowerCase() === fam.toLowerCase())) {
    $('editFontName').value = fam;
  }
}

function commitPaperEdits() {
  const paper = $('resumePaper');
  if (!paper || !paper.innerHTML.trim()) return '';
  const text = htmlToResumeText(paper);
  if (!text) return '';
  state.tailoredResume = text;
  if (state.editingResume) state.paperEdited = true;
  if ($('outputArea')) $('outputArea').textContent = text;
  persistCurrentJdSession();
  scheduleSaveWorkspace();
  return text;
}

function startResumeEdit() {
  const text = currentResumeText();
  if (!text) { showToast('Nothing to edit yet', '#e11d48'); return; }
  setResumeView('formatted');
  const paper = $('resumePaper');
  if (!paper) return;
  if (!paper.innerHTML.trim()) showFormattedResume(text);
  state.editingResume = true;
  setResumeEditChrome(true);
  paper.focus();
  saveEditSelection();
  syncEditToolbar();
  showToast('Use the Word-style bar, then Done or Save PDF');
}

function finishResumeEdit() {
  commitPaperEdits();
  state.editingResume = false;
  state.paperEdited = true;
  setResumeEditChrome(false);
  showToast('Edits saved');
}

function onResumePaperInput() {
  if (!state.editingResume) return;
  commitPaperEdits();
}

function onResumePaperKeydown(e) {
  if (!state.editingResume) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); resumeEditCommand('bold'); return; }
    if (k === 'i') { e.preventDefault(); resumeEditCommand('italic'); return; }
    if (k === 'u') { e.preventDefault(); resumeEditCommand('underline'); return; }
  }
  if (e.key !== 'Enter' || e.shiftKey) return;
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  const bullet = el && el.closest && el.closest('.r-bullet');
  e.preventDefault();
  if (bullet) {
    const neu = makeBulletEl('');
    bullet.after(neu);
    placeCaretIn(neu.querySelector('.r-btext') || neu, false);
    commitPaperEdits();
    return;
  }
  if (document.execCommand) document.execCommand('insertLineBreak');
}

function showFormattedResume(text) {
  if (state.editingResume) return;
  const paper = $('resumePaper');
  if (!paper) return;
  if (state.paperEdited && paper.innerHTML.trim()) return;
  const cleaned = sanitizeResumeHeadline(text || currentResumeText());
  if (cleaned && state.tailoredResume && cleaned !== state.tailoredResume) {
    state.tailoredResume = cleaned;
    if ($('outputArea')) $('outputArea').textContent = cleaned;
  }
  paper.classList.remove('two-page', 'one-page');
  paper.style.minHeight = '11in';
  clearPageBreaks(paper);
  clearPage2Wrap(paper);
  // Measure with 1-page compact role dates first
  paper.innerHTML = parseResumeToHtml(cleaned, { pages: 1, compactDates: true });
  applyPageMargins(paper);
  applyResumeFitVars(paper, PAGE_FIT.BODY_AVG, 1, 1);
  const fit = fitResumeToPage(paper);
  state.docFit = fit;
  const pages = fit.pages > 1 ? 2 : 1;
  // Re-render with the matching format: 1-page (compact dates, wider right col) or 2-page (full months)
  paper.classList.toggle('one-page', pages === 1);
  paper.classList.toggle('two-page', pages === 2);
  paper.innerHTML = parseResumeToHtml(cleaned, {
    pages,
    compactDates: pages === 1,
  });
  applyPageMargins(paper);
  applyResumeFitVars(paper, fit.bodyPt, fit.lh, pages);
  clearPrintPageMarkers(paper);
  if (pages > 1) {
    paper.style.minHeight = (US_LETTER.heightIn * pages) + 'in';
    void paper.offsetHeight;
    insertVisualPageBreak(paper);
  } else {
    paper.style.minHeight = US_LETTER.heightIn + 'in';
  }
  const fitHint = $('resumeFitHint');
  if (fitHint) fitHint.textContent = formatFitHint(fit);
}

function setResumeView(mode) {
  if (mode === 'raw' && state.editingResume) {
    commitPaperEdits();
    state.editingResume = false;
    setResumeEditChrome(false);
  }
  const formatted = mode !== 'raw';
  $('resumePaperWrap').classList.toggle('hidden', !formatted);
  $('outputArea').classList.toggle('hidden', formatted);
  $('viewFormattedBtn').classList.toggle('active', formatted);
  $('viewRawBtn').classList.toggle('active', !formatted);
  if ($('editResumeBtn')) $('editResumeBtn').classList.toggle('hidden', !formatted || state.editingResume);
  if (!formatted) $('outputArea').focus();
}

function resumeExportBodyHtml(content) {
  const paper = $('resumePaper');
  if (paper && paper.innerHTML.trim()) {
    const clone = paper.cloneNode(true);
    clone.querySelectorAll('.r-page-break').forEach(el => el.remove());
    clone.querySelectorAll('.r-page-start').forEach(el => el.classList.remove('r-page-start'));
    clone.classList.remove('editing');
    clone.removeAttribute('contenteditable');
    return clone.innerHTML;
  }
  return parseResumeToHtml(content);
}

function buildWordHtml(content, title) {
  const bodyHtml = resumeExportBodyHtml(content);
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
      ${letterPageSizeCss()}
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
  if (state.editingResume) commitPaperEdits();
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
  if (state.editingResume) commitPaperEdits();
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
  if (state.editingResume) commitPaperEdits();
  navigator.clipboard.writeText(currentResumeText()).then(() => showToast('Copied to clipboard'));
}

function resumePaperLayoutCss() {
  const w = US_LETTER.widthIn;
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .resume-paper {
      background: #fff;
      color: #000;
      width: ${w}in;
      min-height: 0;
      max-width: none;
      margin: 0;
      box-sizing: border-box;
      position: relative;
      padding: 0;
      box-shadow: none;
      font-family: Calibri, Arial, sans-serif;
      font-size: var(--fs-body, 12pt);
      line-height: var(--lh-body, 13.8pt);
    }
    .resume-paper .r-name {
      font-size: var(--fs-name, 21.6pt); font-weight: 700; text-align: center; color: #000;
      margin: 0; padding: 0; line-height: var(--lh-name, 26.3pt);
    }
    .resume-paper .r-headline {
      font-size: var(--fs-title, 16.8pt); font-weight: 700; text-align: center; color: #000;
      margin: 3.2pt 0 0 0; padding: 0; line-height: var(--fs-title, 16.8pt);
    }
    .resume-paper .r-contact {
      font-size: var(--fs-body, 12pt); text-align: center; color: #000;
      margin: 0; padding: 0; line-height: var(--lh-body, 11.5pt);
    }
    .resume-paper .r-rule {
      font-size: 1pt; line-height: 1pt; margin: 0; padding: 0; height: 1pt;
      border: 0; border-top: 0.5pt solid #000; overflow: hidden;
    }
    .resume-paper .r-section {
      font-size: var(--fs-title, 16.8pt); font-weight: 700; text-transform: uppercase; letter-spacing: 0;
      border-bottom: 0.5pt solid #000; margin: var(--sp-section, 7.1pt) 0 0 4.55pt; padding: 0;
      color: #000; line-height: var(--fs-title, 16.8pt); text-align: left;
      break-after: avoid; page-break-after: avoid;
    }
    .resume-paper .r-job {
      width: 100%; border-collapse: collapse; table-layout: fixed; margin: var(--sp-job, 1.85pt) 0 0 0;
      break-inside: avoid; page-break-inside: avoid;
    }
    .resume-paper .r-job col.r-col-left { width: var(--job-left, 58%); }
    .resume-paper .r-job col.r-col-right { width: var(--job-right, 42%); }
    .resume-paper .r-job td {
      font-size: var(--fs-role, 13.2pt); font-weight: 700; color: #000; padding: 0; line-height: var(--lh-role, 13.2pt);
      vertical-align: bottom; font-family: Calibri, Arial, sans-serif; text-align: left;
    }
    .resume-paper .r-job td:first-child { padding-left: 4.55pt; width: var(--job-left, 58%); }
    .resume-paper .r-dates {
      text-align: right !important; white-space: nowrap; width: var(--job-right, 42%);
      vertical-align: bottom; font-weight: 700;
    }
    .resume-paper .r-edu-block { margin: var(--sp-job, 1.85pt) 0 0 4.55pt; padding: 0; }
    .resume-paper .r-edu-degree {
      font-size: var(--fs-role, 13.2pt); font-weight: 700; color: #000; margin: 0; padding: 0;
      line-height: var(--lh-role, 13.2pt); text-align: left;
    }
    .resume-paper .r-edu-school {
      font-size: var(--fs-body, 12pt); font-weight: 400 !important; color: #000; margin: 0.6pt 0 0 0;
      line-height: var(--lh-body, 13.8pt); text-align: left;
    }
    .resume-paper .r-entry-edu > .r-edu-school { margin-left: 4.55pt; }
    .resume-paper .r-role {
      font-size: var(--fs-role, 13.2pt); font-weight: 700; color: #000;
      margin: var(--sp-job, 1.85pt) 0 0 4.55pt; line-height: var(--lh-role, 13.2pt); text-align: left;
      break-after: avoid; page-break-after: avoid;
    }
    .resume-paper .r-role i, .resume-paper .r-job i { font-style: italic; font-weight: 700; }
    .resume-paper .r-section,
    .resume-paper .r-role,
    .resume-paper .r-body,
    .resume-paper .r-skill-line { text-align: left; }
    .resume-paper .r-bullet {
      display: flex; align-items: flex-start; gap: 0;
      font-size: var(--fs-body, 12pt); color: #000;
      margin: 0 0 0 4.55pt; padding: 0; text-indent: 0; text-align: left;
      line-height: var(--lh-body, 13.8pt);
      break-inside: auto; page-break-inside: auto;
      orphans: 2; widows: 2;
    }
    .resume-paper .r-bmark { flex: 0 0 12pt; width: 12pt; text-align: left; line-height: inherit; }
    .resume-paper .r-btext { flex: 1 1 auto; min-width: 0; text-align: left; text-indent: 0; }
    .resume-paper .r-job + .r-bullet,
    .resume-paper .r-role + .r-bullet,
    .resume-paper .r-bullet + .r-bullet { margin-top: var(--sp-bullet, 2.05pt); }
    .resume-paper .r-body {
      font-size: var(--fs-body, 12pt); color: #000; margin: var(--sp-body, 1.5pt) 0 0 4.55pt; padding: 0;
      line-height: var(--lh-body, 13.8pt); text-align: justify;
    }
    .resume-paper .r-skill-line {
      font-size: var(--fs-body, 12pt); color: #000; margin: var(--sp-skill, 1.7pt) 0 0 4.55pt; padding: 0;
      line-height: var(--lh-body, 13.8pt); text-align: justify;
    }
    .resume-paper .r-section + .r-skill-line, .resume-paper .r-section + .r-body { margin-top: var(--sp-body, 1.5pt); }
    .resume-paper .r-skill-label { font-weight: 700; color: #000; }
    .resume-paper b, .resume-paper strong { font-weight: 700; color: #000; }
    .resume-paper i, .resume-paper em { font-style: italic; }
    .resume-paper u { text-decoration: underline; }
    .resume-paper a { color: #1a56c4; text-decoration: underline; }
    .resume-paper .r-section + .r-job,
    .resume-paper .r-section + .r-role,
    .resume-paper .r-section + .r-bullet,
    .resume-paper .r-section + .r-skill-line,
    .resume-paper .r-section + .r-body { break-before: avoid; page-break-before: avoid; }
    @page { ${letterPageSizeCss()} margin: ${pageMarginsCss('page2')}; }
    @page :first { margin: ${pageMarginsCss('first')}; }
    @media print {
      html, body { margin: 0; padding: 0; background: #fff; }
      .resume-paper {
        width: ${w}in !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none;
      }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function preparePrintClone(live) {
  const clone = live.cloneNode(true);
  clone.classList.remove('two-page');
  clone.querySelectorAll('.r-page-start').forEach(el => el.classList.remove('r-page-start'));
  clone.querySelectorAll('.r-page-break').forEach(el => el.remove());
  clone.style.boxShadow = 'none';
  clone.style.margin = '0';
  clone.style.maxWidth = 'none';
  clone.style.width = US_LETTER.widthIn + 'in';
  clone.style.minHeight = '0';
  clone.style.height = 'auto';
  clone.style.padding = '0';
  return clone;
}

function printResume() {
  if (state.editingResume) commitPaperEdits();
  const content = currentResumeText();
  if (!content) { showToast('Nothing to print yet', '#e11d48'); return; }
  if (!state.editingResume && !state.paperEdited) showFormattedResume(content);
  const live = $('resumePaper');
  if (!live || !live.innerHTML.trim()) { showToast('Nothing to print yet', '#e11d48'); return; }
  const base = updateExportFilename(content);
  const clone = preparePrintClone(live);
  const safeTitle = escapeHtml(base);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${safeTitle}</title>
<style>${resumePaperLayoutCss()}</style>
</head><body>${clone.outerHTML}
<script>
window.onload = function() {
  var fn = ${JSON.stringify(base)};
  document.title = fn;
  var t = document.querySelector('title');
  if (t) t.textContent = fn;
  window.focus();
  setTimeout(function() { window.print(); }, 250);
};
<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    showToast('Allow pop-ups to print', '#e11d48');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  showToast(`US Letter · save PDF as ${base}.pdf`);
}

let html2pdfLoader = null;
function loadHtml2Pdf() {
  if (typeof html2pdf === 'function') return Promise.resolve(html2pdf);
  if (html2pdfLoader) return html2pdfLoader;
  html2pdfLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `lib/html2pdf.bundle.min.js?v=${APP_VERSION}`;
    s.onload = () => (typeof html2pdf === 'function' ? resolve(html2pdf) : reject(new Error('html2pdf missing')));
    s.onerror = () => reject(new Error('html2pdf failed to load'));
    document.head.appendChild(s);
  });
  return html2pdfLoader;
}

async function downloadPdf() {
  if (state.editingResume) commitPaperEdits();
  const content = currentResumeText();
  if (!content) { showToast('Nothing to save yet', '#e11d48'); return; }
  if (!state.editingResume && !state.paperEdited) showFormattedResume(content);
  const live = $('resumePaper');
  if (!live || !live.innerHTML.trim()) { showToast('Nothing to save yet', '#e11d48'); return; }
  const base = updateExportFilename(content);
  const clone = live.cloneNode(true);
  clone.id = 'resumePaperPdf';
  clone.classList.remove('two-page', 'one-page', 'editing');
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('.r-page-break').forEach(el => {
    el.style.height = '0';
    el.style.margin = '0';
    el.style.padding = '0';
    el.style.border = '0';
    el.style.pageBreakAfter = 'always';
    el.style.breakAfter = 'page';
  });
  clone.querySelectorAll('.r-page-start').forEach(el => {
    el.style.pageBreakBefore = 'always';
    el.style.breakBefore = 'page';
  });
  clone.style.boxShadow = 'none';
  clone.style.margin = '0';
  clone.style.maxWidth = 'none';
  clone.style.width = US_LETTER.widthIn + 'in';
  clone.style.minHeight = '0';
  clone.style.height = 'auto';
  clone.style.background = '#fff';
  clone.style.padding = `${PAGE_MARGINS.top}in ${PAGE_MARGINS.right}in ${PAGE_MARGINS.bottom}in ${PAGE_MARGINS.left}in`;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:8.5in;background:#fff;z-index:-1;pointer-events:none;';
  host.appendChild(clone);
  document.body.appendChild(host);
  showToast('Saving PDF…');
  try {
    const maker = await loadHtml2Pdf();
    await maker().set({
      margin: 0,
      filename: `${base}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(clone).save();
    showToast(`Saved ${base}.pdf`);
  } catch (err) {
    showToast('PDF download failed — opening print instead', '#e11d48');
    printResume();
  } finally {
    host.remove();
  }
}

function copyFilename() {
  const name = `${state.exportBasename || 'tailored_resume'}.pdf`;
  navigator.clipboard.writeText(name).then(() => showToast('File name copied'));
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
  const el = $('trackRow');
  if (!el) return;
  el.innerHTML = TRACKS.map(t =>
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

function purgeStaleBrowserCaches() {
  try {
    document.documentElement.dataset.appVersion = APP_VERSION;
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('ats_skillset_') && !k.startsWith(SKILLSET_CACHE)) drop.push(k);
      if (k.startsWith('ats_gemini_')) drop.push(k);
    }
    drop.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

async function bootstrapApp() {
  screenLoadingDepth = 1;
  document.body.classList.add('screen-loading');
  try {
    purgeStaleBrowserCaches();
    loadWorkspace();
    applyBaseResumeToUi();
    syncUiFromActiveSession();
    initResumeUpload();
    initTracks();
    updateCounts();
    await pingHealth();
  } finally {
    hideScreenLoading();
  }
}

$('jdInput').addEventListener('input', onJdInput);
$('resumeInput').addEventListener('input', onResumeInput);
$('outputArea').addEventListener('input', () => {
  state.tailoredResume = $('outputArea').textContent;
  state.paperEdited = false;
  if (!state.editingResume) showFormattedResume(state.tailoredResume);
  scheduleSaveWorkspace();
});
if ($('resumePaper')) {
  $('resumePaper').addEventListener('input', onResumePaperInput);
  $('resumePaper').addEventListener('keydown', onResumePaperKeydown);
  $('resumePaper').addEventListener('mouseup', () => { saveEditSelection(); syncEditToolbar(); });
  $('resumePaper').addEventListener('keyup', () => { saveEditSelection(); syncEditToolbar(); });
}
document.addEventListener('selectionchange', () => {
  if (!state.editingResume) return;
  saveEditSelection();
  syncEditToolbar();
});
bootstrapApp();
