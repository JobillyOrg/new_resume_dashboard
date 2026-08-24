/**
 * Local RAG fallback for ATS keyword extraction + scoring.
 * Gemini is the primary scorer; this runs instantly and is used if Gemini fails.
 */
(function (global) {
  'use strict';

  const SKILL_KB = [
    { label: 'Python', terms: ['python', 'pandas', 'numpy', 'pyspark', 'fastapi'] },
    { label: 'SQL', terms: ['sql', 'postgresql', 'mysql', 't-sql', 'pl/sql'] },
    { label: 'Apache Spark', terms: ['spark', 'apache spark', 'pyspark', 'spark sql'] },
    { label: 'Scala', terms: ['scala'] },
    { label: 'AWS', terms: ['aws', 'amazon web services', 's3', 'glue', 'emr', 'redshift', 'kinesis', 'lambda', 'mwaa'] },
    { label: 'GCP', terms: ['gcp', 'google cloud', 'bigquery', 'dataflow', 'pub/sub', 'composer', 'gcs'] },
    { label: 'Azure', terms: ['azure', 'adf', 'synapse', 'azure data factory'] },
    { label: 'Databricks', terms: ['databricks', 'delta lake', 'unity catalog', 'delta live tables'] },
    { label: 'Snowflake', terms: ['snowflake'] },
    { label: 'BigQuery', terms: ['bigquery', 'google bigquery'] },
    { label: 'Redshift', terms: ['redshift', 'amazon redshift'] },
    { label: 'Kafka', terms: ['kafka', 'apache kafka', 'event streaming'] },
    { label: 'Airflow', terms: ['airflow', 'apache airflow', 'mwaa', 'composer'] },
    { label: 'dbt', terms: ['dbt', 'data build tool'] },
    { label: 'Hadoop', terms: ['hadoop', 'hdfs', 'hive', 'mapreduce'] },
    { label: 'Iceberg', terms: ['iceberg', 'apache iceberg'] },
    { label: 'Delta Lake', terms: ['delta lake', 'delta'] },
    { label: 'Docker', terms: ['docker', 'containers'] },
    { label: 'Kubernetes', terms: ['kubernetes', 'k8s'] },
    { label: 'Terraform', terms: ['terraform', 'iac', 'infrastructure as code'] },
    { label: 'CI/CD', terms: ['ci/cd', 'github actions', 'jenkins', 'gitlab ci'] },
    { label: 'ETL', terms: ['etl', 'elt', 'data pipeline', 'data pipelines'] },
    { label: 'Data Engineering', terms: ['data engineer', 'data engineering'] },
    { label: 'Java', terms: ['java'] },
    { label: 'Go', terms: ['golang', 'go lang'] },
    { label: 'REST API', terms: ['rest api', 'restful', 'api'] },
    { label: 'Git', terms: ['git', 'github', 'gitlab'] },
    { label: 'Looker', terms: ['looker', 'tableau', 'power bi'] },
    { label: 'Machine Learning', terms: ['machine learning', 'ml', 'feature store'] },
    { label: 'DHCP', terms: ['dhcp'] },
    { label: 'DNS', terms: ['dns'] },
    { label: 'VPN', terms: ['vpn'] },
    { label: 'VLAN', terms: ['vlan', 'vlans'] },
    { label: 'TCP/IP', terms: ['tcp/ip', 'tcp', 'ip networking'] },
    { label: 'Switching', terms: ['switching', 'layer 2', 'layer 3'] },
    { label: 'Active Directory', terms: ['active directory', 'azure ad', 'entra id'] },
    { label: 'Microsoft 365', terms: ['microsoft 365', 'office 365', 'm365', 'o365'] },
    { label: 'Help Desk', terms: ['help desk', 'helpdesk', 'service desk'] },
    { label: 'PowerShell', terms: ['powershell'] },
    { label: 'Windows', terms: ['windows', 'windows 10', 'windows 11', 'windows server'] },
    { label: 'Intune', terms: ['intune', 'endpoint manager'] },
    { label: 'ServiceNow', terms: ['servicenow'] },
    { label: 'Firewall', terms: ['firewall', 'palo alto', 'fortinet'] },
    { label: 'Outlook', terms: ['outlook'] },
    { label: 'Microsoft Teams', terms: ['microsoft teams', 'ms teams'] },
    { label: 'SharePoint', terms: ['sharepoint'] },
    { label: 'OneDrive', terms: ['onedrive'] },
    { label: 'Exchange', terms: ['exchange', 'exchange online'] },
    { label: 'Entra ID', terms: ['entra id', 'azure ad', 'azure active directory'] },
    { label: 'Group Policy', terms: ['group policy', 'gpo'] },
    { label: 'Wi-Fi', terms: ['wifi', 'wi-fi', 'wireless'] },
    { label: 'Ticketing', terms: ['ticketing', 'psa', 'rmm'] },
    { label: 'Remote Desktop', terms: ['remote desktop', 'rdp', 'anydesk', 'teamviewer'] },
    { label: 'Linux', terms: ['linux', 'bash', 'rhel', 'centos', 'ubuntu'] },
    { label: 'PDU', terms: ['pdu', 'power distribution'] },
    { label: 'KVM', terms: ['kvm'] },
    { label: 'HVAC', terms: ['hvac', 'crac', 'crah'] },
    { label: 'Fiber', terms: ['fiber', 'fibre', 'fiber optic', 'otdr'] },
    { label: 'Cabling', terms: ['cabling', 'structured cabling', 'cat6', 'copper cabling'] },
    { label: 'RAID', terms: ['raid'] },
    { label: 'DCIM', terms: ['dcim', 'nlyte', 'sunbird'] },
    { label: 'Racks', terms: ['racks', 'rack and stack', 'rack-and-stack'] },
    { label: 'iLO', terms: ['ilo', 'idrac', 'ipmi', 'bmc'] },
    { label: 'Server Hardware', terms: ['server hardware', 'break/fix', 'x86'] },
    { label: 'Jira', terms: ['jira'] },
    { label: 'Selenium', terms: ['selenium', 'cypress', 'playwright'] },
    { label: 'SIEM', terms: ['siem', 'splunk', 'sentinel'] },
    { label: 'Ansible', terms: ['ansible'] },
    { label: 'JavaScript', terms: ['javascript', 'typescript'] },
    { label: 'React', terms: ['react', 'react.js'] },
  ];

  const SKILL_FAMILY = {
    Python: 'lang', SQL: 'data', 'Apache Spark': 'data', Scala: 'lang', AWS: 'cloud', GCP: 'cloud', Azure: 'cloud',
    Databricks: 'data', Snowflake: 'data', BigQuery: 'data', Redshift: 'data', Kafka: 'data', Airflow: 'data',
    dbt: 'data', Hadoop: 'data', Iceberg: 'data', 'Delta Lake': 'data', Docker: 'devops', Kubernetes: 'devops',
    Terraform: 'devops', 'CI/CD': 'devops', ETL: 'data', 'Data Engineering': 'data', Java: 'lang', Go: 'lang',
    'REST API': 'swe', Git: 'swe', Looker: 'ba', 'Machine Learning': 'data', DHCP: 'network', DNS: 'network',
    VPN: 'network', VLAN: 'network', 'TCP/IP': 'network', Switching: 'network', 'Active Directory': 'identity',
    'Microsoft 365': 'support', 'Help Desk': 'support', PowerShell: 'support', Windows: 'support', Intune: 'support',
    ServiceNow: 'support', Firewall: 'security', Outlook: 'collab', 'Microsoft Teams': 'collab', SharePoint: 'collab',
    OneDrive: 'collab', Exchange: 'collab', 'Entra ID': 'identity', 'Group Policy': 'identity', 'Wi-Fi': 'network',
    Ticketing: 'support', 'Remote Desktop': 'support', Linux: 'devops', PDU: 'datacenter', KVM: 'datacenter',
    HVAC: 'datacenter', Fiber: 'datacenter', Cabling: 'datacenter', RAID: 'datacenter', DCIM: 'datacenter',
    Racks: 'datacenter', iLO: 'datacenter', 'Server Hardware': 'datacenter', Jira: 'qa', Selenium: 'qa',
    SIEM: 'security', Ansible: 'devops', JavaScript: 'swe', React: 'swe',
  };

  const FAMILY_COMPAT = {
    data: ['data', 'lang', 'cloud', 'devops', 'swe'],
    support: ['support', 'network', 'identity', 'collab'],
    datacenter: ['datacenter', 'support', 'network'],
    network: ['network', 'support', 'datacenter', 'security'],
    devops: ['devops', 'cloud', 'lang', 'swe'],
    cloud: ['cloud', 'devops', 'lang'],
    security: ['security', 'network', 'support', 'identity'],
    qa: ['qa', 'swe', 'lang'],
    swe: ['swe', 'lang', 'devops', 'cloud'],
    ba: ['ba', 'data', 'lang'],
    identity: ['identity', 'support'],
    collab: ['collab', 'support'],
    lang: ['lang', 'swe', 'data'],
    general: null,
  };

  const FAMILY_FALLBACK_PACK = {
    data: 'data-engineer',
    support: 'it-support',
    datacenter: 'dc-tech',
    network: 'network',
    devops: 'devops',
    cloud: 'cloud-eng',
    security: 'security',
    qa: 'qa',
    swe: 'swe',
    ba: 'ba',
    identity: 'it-support',
    collab: 'it-support',
    lang: 'swe',
  };

  const ROLE_PACKS = {
    'it-support': {
      family: 'support',
      label: 'IT Support / Help Desk',
      core: ['Windows', 'Microsoft 365', 'Active Directory', 'TCP/IP', 'DNS', 'DHCP', 'VPN', 'Help Desk', 'Outlook', 'Microsoft Teams', 'PowerShell', 'Intune'],
      extra: ['Entra ID', 'Group Policy', 'VLAN', 'Routing', 'Firewall', 'Wi-Fi', 'SharePoint', 'OneDrive', 'Exchange', 'ServiceNow', 'Remote Desktop', 'Ticketing', 'Linux'],
    },
    'sysadmin': {
      family: 'support',
      label: 'Systems Administrator',
      core: ['Windows', 'Active Directory', 'Group Policy', 'PowerShell', 'DNS', 'DHCP', 'Microsoft 365', 'Entra ID', 'TCP/IP', 'VPN'],
      extra: ['Intune', 'Firewall', 'VLAN', 'Linux', 'Exchange', 'SharePoint', 'Terraform', 'Azure', 'Ticketing'],
    },
    'network': {
      family: 'network',
      label: 'Network Engineer',
      core: ['TCP/IP', 'DNS', 'DHCP', 'VPN', 'VLAN', 'Routing', 'Firewall', 'Wi-Fi', 'Switching'],
      extra: ['Linux', 'PowerShell', 'Terraform', 'AWS', 'Azure'],
    },
    'data-engineer': {
      family: 'data',
      label: 'Data Engineer',
      core: ['Python', 'SQL', 'Apache Spark', 'Airflow', 'AWS', 'ETL', 'Git'],
      extra: ['Databricks', 'Snowflake', 'Kafka', 'dbt', 'Docker', 'Terraform', 'Delta Lake', 'CI/CD', 'BigQuery', 'Hadoop'],
    },
    'aws-de': {
      family: 'data',
      label: 'AWS Data Engineer',
      core: ['Python', 'SQL', 'AWS', 'Apache Spark', 'Airflow', 'ETL', 'S3'],
      extra: ['Glue', 'Redshift', 'EMR', 'Kinesis', 'Lambda', 'Terraform', 'Kafka', 'Docker', 'Git', 'CI/CD'],
    },
    'gcp-de': {
      family: 'data',
      label: 'GCP Data Engineer',
      core: ['Python', 'SQL', 'GCP', 'BigQuery', 'Airflow', 'ETL'],
      extra: ['Dataflow', 'Pub/Sub', 'Composer', 'Databricks', 'Apache Spark', 'Terraform', 'Kafka', 'Docker', 'Git'],
    },
    'databricks': {
      family: 'data',
      label: 'Databricks Data Engineer',
      core: ['Python', 'SQL', 'Databricks', 'Apache Spark', 'Delta Lake', 'ETL'],
      extra: ['Airflow', 'Unity Catalog', 'AWS', 'Azure', 'Kafka', 'dbt', 'Terraform', 'Git'],
    },
    'swe': {
      family: 'swe',
      label: 'Software Engineer',
      core: ['Python', 'Java', 'SQL', 'Git', 'REST API', 'Docker'],
      extra: ['Kubernetes', 'CI/CD', 'AWS', 'Terraform', 'Linux', 'JavaScript'],
    },
    'dc-tech': {
      family: 'datacenter',
      label: 'Data Center Technician',
      core: ['Linux', 'Windows', 'TCP/IP', 'DNS', 'DHCP', 'Cabling', 'Fiber', 'RAID', 'PDU', 'KVM', 'HVAC', 'Racks'],
      extra: ['VPN', 'VLAN', 'Ticketing', 'Remote Desktop', 'Switching', 'DCIM', 'iLO', 'Server Hardware', 'Firewall', 'Help Desk', 'ServiceNow', 'Active Directory', 'PowerShell'],
    },
    'devops': {
      family: 'devops',
      label: 'DevOps Engineer',
      core: ['Linux', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Git', 'AWS'],
      extra: ['Python', 'Ansible', 'Azure', 'GCP'],
    },
    'cloud-eng': {
      family: 'cloud',
      label: 'Cloud Engineer',
      core: ['AWS', 'Azure', 'GCP', 'Terraform', 'Linux', 'Docker'],
      extra: ['Kubernetes', 'Python', 'CI/CD', 'Git'],
    },
    'security': {
      family: 'security',
      label: 'Security Analyst',
      core: ['Firewall', 'SIEM', 'TCP/IP', 'Linux', 'Windows', 'Active Directory', 'VPN'],
      extra: ['PowerShell', 'Python', 'DNS', 'Ticketing'],
    },
    'qa': {
      family: 'qa',
      label: 'QA Engineer',
      core: ['Selenium', 'Jira', 'Git', 'SQL', 'Java'],
      extra: ['Python', 'CI/CD', 'REST API', 'JavaScript'],
    },
    'dba': {
      family: 'data',
      label: 'Database Administrator',
      core: ['SQL', 'Linux', 'Python'],
      extra: ['AWS', 'Azure', 'PowerShell', 'Git'],
    },
    'ba': {
      family: 'ba',
      label: 'Business Analyst',
      core: ['SQL', 'Looker', 'Jira'],
      extra: ['Python', 'Microsoft 365', 'Git'],
    },
    'frontend': {
      family: 'swe',
      label: 'Frontend Engineer',
      core: ['JavaScript', 'React', 'Git', 'REST API'],
      extra: ['Docker', 'CI/CD', 'SQL'],
    },
    'backend': {
      family: 'swe',
      label: 'Backend Engineer',
      core: ['Java', 'Python', 'SQL', 'Git', 'REST API', 'Docker'],
      extra: ['Kubernetes', 'AWS', 'CI/CD', 'Linux'],
    },
  };

  const EXPANSIONS = {
    'apache spark': ['Spark', 'PySpark'],
    'spark': ['Apache Spark', 'PySpark'],
    'pyspark': ['Spark', 'Apache Spark', 'Python'],
    'apache airflow': ['Airflow'],
    'airflow': ['Apache Airflow'],
    'apache kafka': ['Kafka'],
    'kafka': ['Apache Kafka'],
    'google bigquery': ['BigQuery', 'GCP'],
    'bigquery': ['Google BigQuery', 'GCP'],
    'amazon redshift': ['Redshift', 'AWS'],
    'gcp': ['Google Cloud', 'Google Cloud Platform'],
    'google cloud': ['GCP'],
    'aws': ['Amazon Web Services'],
    'amazon web services': ['AWS'],
    'ci/cd': ['CI/CD', 'GitHub Actions'],
    'delta': ['Delta Lake'],
    'data pipelines': ['data pipeline', 'ETL'],
    'etl': ['ELT', 'data pipeline'],
    'microsoft 365': ['Office 365', 'M365', 'O365'],
    'office 365': ['Microsoft 365', 'M365', 'O365'],
    'tcp/ip': ['TCP', 'IP'],
    'help desk': ['helpdesk', 'service desk', 'IT support'],
    'vlan': ['VLANs'],
    'vlans': ['VLAN'],
    'pdu': ['PDU', 'power distribution'],
    'kvm': ['KVM'],
    'hvac': ['HVAC', 'CRAC', 'CRAH'],
    'fiber': ['Fibre', 'fiber optic'],
    'fibre': ['Fiber'],
    'cabling': ['structured cabling', 'Cat6'],
    'raid': ['RAID'],
    'ilo': ['iLO', 'iDRAC', 'IPMI'],
    'idrac': ['iLO', 'iDRAC'],
  };

  const STOP = new Set([
    'the','and','for','with','you','our','will','have','this','that','your','are','from',
    'able','work','team','role','job','years','year','experience','required','preferred',
    'including','using','within','across','ability','strong','excellent','good','must',
    'should','about','company','position','hybrid','remote','onsite','benefits','salary',
    'equal','opportunity','employer','skills','responsibilities','requirements',
    'qualifications','description','summary','full','time',
    'location','assist','based','needs','concepts','fundamentals',
    'understanding','knowledge','ability','proficient','familiar',
  ]);

  const US_STATES = new Set([
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks',
    'ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny',
    'nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv',
    'wi','wy','dc',
  ]);

  const ALLOW_SHORT = new Set([
    'sql','aws','gcp','dns','vpn','vlan','tcp','ad','s3','ci','cd','os','ui',
    'ux','ml','bi','etl','elt','iac','lan','wan','wifi','sla','api','git','k8s',
    'pdu','kvm','raid','ilo','bmc','cat6','siem',
  ]);

  function isCertKeyword(term) {
    return /certif(?:y|ied|ication)|\baws certified\b|\bpmp\b|\bcissp\b|\bcka\b|\bckad\b|\bcomptia\b|\bscrum master\b|\bsecurity\+|\bnetwork\+|\ba\+|microsoft certified/i.test(String(term || ''));
  }

  function cleanSkillPhrase(term) {
    let t = String(term || '')
      .replace(/^[-•*\d.)\s]+/, '')
      .replace(/^(knowledge of|understanding of|experience (?:with|in)|ability to|proficient in|familiar with|working (?:knowledge|with)|hands-on(?: experience)?(?: with)?|must have)\s+/i, '')
      .replace(/^(and|or|the|an?)\s+/i, '')
      .replace(/[.,;:]+$/g, '')
      .trim();
    return t;
  }

  function isSkillKeyword(term) {
    const raw = String(term || '').trim();
    const t = cleanSkillPhrase(raw);
    if (t.length < 2 || t.length > 40) return false;
    const x = t.toLowerCase();
    if (STOP.has(x) || US_STATES.has(x)) return false;
    if (isCertKeyword(t)) return false;
    if (/\./.test(t) && !/\.net/i.test(t)) return false;
    if (/^(microsoft|office)$/i.test(t)) return false;
    if (/^(based on|and |or |including|such as)/i.test(t)) return false;
    if (/\b(concepts?|fundamentals?|needs?|location|city|state|salary|benefits|hybrid|onsite)\b/i.test(t)) return false;
    if (/^remote$/i.test(t) || /\bremote (work|job|position|role|intern)\b/i.test(t)) return false;
    if (/^(assist|support|work|manage|provide|ensure|help|collaborate|maintain)$/i.test(t)) return false;
    if (/^(it|ut|go|to|of|in|on|at|by|as)$/i.test(t)) return false;
    const words = t.split(/\s+/);
    if (words.length > 3) return false;
    if (t.length <= 3 && !ALLOW_SHORT.has(x) && !/[+#./]/.test(t)) return false;
    const inKb = SKILL_KB.some(s =>
      s.label.toLowerCase() === x || s.terms.some(term => term.trim().toLowerCase() === x)
    );
    if (inKb) return true;
    if (/[+#./]|\d/.test(t)) return true;
    if (ALLOW_SHORT.has(x)) return true;
    if (/^(python|java|scala|terraform|docker|kubernetes|windows|linux|azure|aws|gcp|microsoft 365|office 365|active directory|help desk|dhcp|dns|vpn|vlan|routing|switching|firewall|powershell|intune|servicenow|snowflake|databricks|airflow|kafka|spark|hadoop|pdu|kvm|hvac|fiber|fibre|cabling|raid|dcim|ilo|idrac|ipmi)$/i.test(t)) return true;
    if (/^[A-Z]{2,}(?:\/[A-Z]{2,})?$/.test(t) && t.length >= 2 && !US_STATES.has(x)) {
      return ALLOW_SHORT.has(x) || t.length >= 3;
    }
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(t) && !inKb) return false;
    return inKb || /[A-Z].*\d|[+#]/.test(t);
  }

  function tokenize(text) {
    return (text.toLowerCase().match(/[a-z0-9+#./]+/g) || [])
      .filter(t => t.length > 1 && !STOP.has(t));
  }

  class BM25Index {
    constructor(docs) {
      this.docs = docs;
      this.k1 = 1.5;
      this.b = 0.75;
      this.docFreq = {};
      this.docLens = [];
      this.tfMaps = [];
      this.N = docs.length;
      for (const doc of docs) {
        const tokens = tokenize(doc.text);
        this.docLens.push(tokens.length);
        const tf = {};
        for (const t of tokens) {
          tf[t] = (tf[t] || 0) + 1;
          this.docFreq[t] = (this.docFreq[t] || 0) + 1;
        }
        this.tfMaps.push(tf);
      }
      this.avgLen = this.docLens.reduce((a, b) => a + b, 0) / Math.max(this.N, 1);
    }

    search(query, topK = 12) {
      const qTokens = tokenize(query);
      return this.docs.map((doc, i) => {
        let score = 0;
        const dl = this.docLens[i];
        const tf = this.tfMaps[i];
        for (const term of qTokens) {
          const f = tf[term] || 0;
          if (!f) continue;
          const df = this.docFreq[term] || 0;
          const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
          score += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * dl / this.avgLen));
        }
        return { id: doc.id, score, doc };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
    }
  }

  function jdHash(str) {
    let h = 5381;
    for (let i = 0; i < Math.min(str.length, 2000); i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  function extractJdTitle(jd) {
    const labeled = jd.match(/(?:job title|position title|role title)\s*[:\-]\s*([^\n]{3,70})/i);
    if (labeled) return labeled[1].trim();
    const hiring = jd.match(/(?:seeking|hiring|looking for)\s+an?\s+([A-Z][A-Za-z\s\/\-]{3,55}?)(?:\s+to\b|\s+who\b|\s+with\b|[,\n])/);
    if (hiring) return hiring[1].trim();
    const skip = /^(about|job summary|overview|description|we are|responsibilities|requirements|what we|salary|benefits|location)/i;
    for (const line of jd.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 18)) {
      if (line.length < 4 || line.length > 60 || skip.test(line)) continue;
      const w = line.split(/\s+/);
      if (w.length >= 2 && w.length <= 7 && /^[A-Z]/.test(line)) return line;
    }
    return '';
  }

  function extractDirectTerms(jd) {
    const found = new Map();
    const add = (term, weight) => {
      const t = cleanSkillPhrase(term);
      if (!isSkillKeyword(t)) return;
      const key = t.toLowerCase();
      found.set(key, { term: t, weight: (found.get(key)?.weight || 0) + weight });
    };
    for (const line of jd.split('\n')) {
      if (/^[-•*▸]/.test(line.trim()) || /,/.test(line)) {
        line.replace(/^[-•*▸]\s*/, '').split(/[,;|]/).forEach(p => add(p, 3));
      }
    }
    const tech = jd.match(/\b(?:[A-Z][a-zA-Z0-9+#./]+(?:\s+[A-Z][a-zA-Z0-9+#./]+){0,2}|[A-Z]{2,}(?:\/[A-Z]+)?|C#|\.NET)\b/g) || [];
    tech.forEach(t => add(t, 2));
    return [...found.values()].sort((a, b) => b.weight - a.weight);
  }

  function extractKeywordsRAG(jd, family) {
    const chunks = [];
    let buf = [];
    for (const line of jd.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^(requirements?|qualifications?|responsibilities|skills|about|must have|nice to have)/i.test(line) && buf.length) {
        chunks.push(buf.join(' '));
        buf = [line];
      } else {
        buf.push(line);
      }
      if (buf.join(' ').length > 420) {
        chunks.push(buf.join(' '));
        buf = [];
      }
    }
    if (buf.length) chunks.push(buf.join(' '));

    const kbDocs = SKILL_KB.map((s, i) => ({
      id: 'skill-' + i,
      text: [s.label, ...s.terms].join(' '),
      label: s.label,
    }));
    const bm25 = new BM25Index(kbDocs);
    const scored = new Map();
    const jdLower = ' ' + jd.toLowerCase() + ' ';
    const skillAppears = (label) => {
      const skill = SKILL_KB.find(s => s.label === label);
      if (!skill) return isSkillKeyword(label);
      const terms = [skill.label, ...skill.terms];
      const literal = terms.some(term => {
        const t = term.trim().toLowerCase();
        return t.length >= 2 && jdLower.includes(t);
      });
      if (!literal) return false;
      const skillFam = SKILL_FAMILY[label] || 'general';
      const allowed = FAMILY_COMPAT[family];
      if (!family || family === 'general' || !allowed || allowed.includes(skillFam)) return true;
      const lab = skill.label.toLowerCase();
      return lab.length >= 4 && new RegExp('(?<![a-z0-9])' + lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])', 'i').test(jdLower);
    };
    const boost = (text) => /required|must have|minimum|essential/i.test(text) ? 2.4
      : /preferred|nice to have|bonus/i.test(text) ? 1.4 : 1;

    for (const chunk of (chunks.length ? chunks : [jd])) {
      const mult = boost(chunk);
      for (const hit of bm25.search(chunk, 14)) {
        if (!skillAppears(hit.doc.label)) continue;
        scored.set(hit.doc.label, (scored.get(hit.doc.label) || 0) + hit.score * mult);
      }
    }
    for (const { term, weight } of extractDirectTerms(jd)) {
      const display = cleanSkillPhrase(term);
      if (!isSkillKeyword(display)) continue;
      const existing = [...scored.keys()].find(k => k.toLowerCase() === display.toLowerCase());
      if (existing) scored.set(existing, scored.get(existing) + weight);
      else scored.set(display, weight);
    }

    for (const skill of SKILL_KB) {
      if (skillAppears(skill.label)) scored.set(skill.label, (scored.get(skill.label) || 0) + 12);
    }

    const title = extractJdTitle(jd);

    function pushUnique(list, term) {
      const t = cleanSkillPhrase(term);
      if (!isSkillKeyword(t)) return;
      const kl = t.toLowerCase();
      if (list.some(u => u.toLowerCase() === kl)) return;
      list.push(t);
    }

    const requiredSeed = [];
    const preferredSeed = [];
    let listMode = null;
    for (const line of jd.split('\n')) {
      if (/required|must have|minimum qualifications/i.test(line)) listMode = 'req';
      else if (/preferred|nice to have|bonus|plus/i.test(line)) listMode = 'pref';
      const payload = line.includes(':') ? line.replace(/^[^:]*:\s*/, '') : line.replace(/^[-•*]\s*/, '');
      if (!listMode) continue;
      payload.split(/[,;/|]/).forEach(part => {
        if (listMode === 'req') pushUnique(requiredSeed, part);
        else pushUnique(preferredSeed, part);
      });
    }

    const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label).filter(isSkillKeyword);
    const primary = [];
    requiredSeed.forEach(t => pushUnique(primary, t));
    ranked.forEach(label => {
      if (primary.length >= 10) return;
      if (preferredSeed.some(p => p.toLowerCase() === label.toLowerCase())) return;
      pushUnique(primary, label);
    });
    ranked.forEach(label => { if (primary.length < 10) pushUnique(primary, label); });

    const secondary = [];
    preferredSeed.forEach(t => pushUnique(secondary, t));
    ranked.forEach(label => {
      if (secondary.length >= 10) return;
      if (primary.some(p => p.toLowerCase() === label.toLowerCase())) return;
      pushUnique(secondary, label);
    });
    const collapse = (list) => {
      const out = [];
      for (const t of list) {
        const stem = t.toLowerCase().replace(/s$/, '');
        if (out.some(u => u.toLowerCase().replace(/s$/, '') === stem)) continue;
        out.push(t);
      }
      return out;
    };
    const pri = collapse(primary).slice(0, 10);
    const sec = collapse(secondary)
      .filter(t => !pri.some(p => p.toLowerCase().replace(/s$/, '') === t.toLowerCase().replace(/s$/, '')))
      .slice(0, 10);
    const aliasMap = Object.fromEntries([...pri, ...sec].map(k => [k, [k]]));
    return { primary: pri, secondary: sec, aliasMap, title, source: 'rag', confidence: pri.length >= 6 ? 'high' : 'medium' };
  }

  function inferFamily(jd) {
    const jdLower = ' ' + String(jd || '').toLowerCase() + ' ';
    const votes = {};
    for (const s of SKILL_KB) {
      const hit = [s.label, ...s.terms].some(term => {
        const t = String(term || '').trim().toLowerCase();
        return t.length >= 2 && jdLower.includes(t);
      });
      if (!hit) continue;
      const f = SKILL_FAMILY[s.label] || 'general';
      votes[f] = (votes[f] || 0) + 1;
    }
    const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    return (ranked[0] && ranked[0][0]) || 'general';
  }

  function detectRole(jd) {
    const title = extractJdTitle(jd);
    const t = (title + ' ' + String(jd || '').slice(0, 2500)).toLowerCase();
    const rules = [
      { id: 'dc-tech', match: () => /data center technician|datacenter technician|dc technician|data center tech\b|rack and stack|rack-and-stack/.test(t)
        || (/data.?center|datacenter/.test(t) && /technician|facilities|hardware|rack/.test(t) && !/data engineer|data engineering/.test(t)) },
      { id: 'it-support', match: () => /help desk|desktop support|it support|service desk|end.?user support|pc technician|desktop technician|field technician|desktop engineer/.test(t) },
      { id: 'sysadmin', match: () => /system admin|sysadmin|systems administrator|windows administrator/.test(t) },
      { id: 'network', match: () => /network engineer|network admin|network administrator|network technician/.test(t) },
      { id: 'devops', match: () => /devops|site reliability|\bsre\b|platform engineer/.test(t) },
      { id: 'cloud-eng', match: () => /cloud engineer|cloud architect/.test(t) },
      { id: 'security', match: () => /security analyst|soc analyst|cybersecurity|information security|security engineer/.test(t) },
      { id: 'qa', match: () => /\bqa engineer\b|quality assurance|\bsdet\b|test engineer|automation tester/.test(t) },
      { id: 'dba', match: () => /database admin|database administrator|\bdba\b/.test(t) },
      { id: 'frontend', match: () => /front.?end engineer|front.?end developer|react developer/.test(t) },
      { id: 'backend', match: () => /back.?end engineer|back.?end developer/.test(t) },
      { id: 'ba', match: () => /business analyst|\bdata analyst\b/.test(t) },
      { id: 'databricks', match: () => /databricks/.test(t) && /data engineer|data engineering/.test(t) },
      { id: 'gcp-de', match: () => /gcp|bigquery|dataflow|composer/.test(t) && /data engineer/.test(t) },
      { id: 'aws-de', match: () => (/\baws\b|glue|redshift|\bemr\b/.test(t) && /data engineer/.test(t)) },
      { id: 'data-engineer', match: () => /data engineer|data engineering/.test(t) },
      { id: 'swe', match: () => /software engineer|full.?stack|backend engineer|sde\b/.test(t) },
    ];
    for (const rule of rules) {
      if (!rule.match()) continue;
      const pack = ROLE_PACKS[rule.id];
      const label = title || (pack && pack.label) || rule.id;
      return {
        id: rule.id,
        family: (pack && pack.family) || 'general',
        label,
        title: title || label,
        packId: rule.id,
      };
    }
    const family = inferFamily(jd);
    const packId = FAMILY_FALLBACK_PACK[family] || null;
    const pack = packId ? ROLE_PACKS[packId] : null;
    const label = title || (pack && pack.label) || 'This role';
    return { id: packId || 'generic', family, label, title: title || label, packId };
  }

  function buildRoleSkillSet(jd) {
    const role = detectRole(jd);
    const fromJd = extractKeywordsRAG(jd, role.family);
    const packId = role.packId || FAMILY_FALLBACK_PACK[role.family];
    const pack = ROLE_PACKS[packId] || { core: [], extra: [] };
    const primary = [];
    const secondary = [];
    const seen = new Set();
    const add = (list, term, max) => {
      const t = cleanSkillPhrase(term);
      if (!t || !isSkillKeyword(t)) return;
      const key = t.toLowerCase().replace(/s$/, '');
      if (seen.has(key)) return;
      if (list.length >= max) return;
      seen.add(key);
      list.push(t);
    };
    (fromJd.primary || []).forEach(t => add(primary, t, 14));
    (fromJd.secondary || []).forEach(t => add(primary, t, 14));
    (pack.core || []).forEach(t => add(primary.length < 14 ? primary : secondary, t, 14));
    (pack.extra || []).forEach(t => add(secondary, t, 14));
    const aliasMap = Object.fromEntries([...primary, ...secondary].map(k => [k, [k]]));
    return {
      role,
      title: role.title || role.label,
      primary,
      secondary,
      aliasMap,
      jdSkills: fromJd.primary || [],
      roleSkills: [...(pack.core || []), ...(pack.extra || [])],
      source: 'jd+role-pack',
      confidence: 'high',
    };
  }

  function kwInText(kw, text) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?<![a-zA-Z0-9])' + escaped + '(?![a-zA-Z0-9])', 'i').test(text);
  }

  function expandKeyword(kw) {
    const forms = [kw];
    const k = kw.trim();
    const stripped = k.replace(/\s+(pipelines?|models?|tools?|frameworks?|systems?|platforms?|technologies?)$/i, '').trim();
    if (stripped !== k && stripped.length > 1) forms.push(stripped);
    const noVendor = k.replace(/^(apache|amazon|google|microsoft)\s+/i, '').trim();
    if (noVendor !== k && noVendor.length > 1) forms.push(noVendor);
    if (/s$/i.test(k) && k.length > 3) forms.push(k.slice(0, -1));
    const lower = k.toLowerCase();
    if (EXPANSIONS[lower]) forms.push(...EXPANSIONS[lower]);
    if (stripped !== k && EXPANSIONS[stripped.toLowerCase()]) forms.push(...EXPANSIONS[stripped.toLowerCase()]);
    return forms;
  }

  function kwOrAliasInText(canonical, text, aliasMap) {
    const aliases = aliasMap[canonical] || [canonical];
    return aliases.some(a => expandKeyword(a).some(form => kwInText(form, text)));
  }

  function normalizeLines(resume) {
    return resume.split('\n').map(l =>
      l.replace(/^[\s\u00A0\u200B\u200C\u200D\uFEFF\u202F\u2060\u3000]+/, '')
       .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\u202F\u2060\u3000]+$/, '')
    );
  }

  function computeAtsScore(jd, resume, primary, secondary, aliasMap) {
    primary = (primary || []).filter(k => !isCertKeyword(k));
    secondary = (secondary || []).filter(k => !isCertKeyword(k));
    const resumeLines = normalizeLines(resume);
    const resumeText = resumeLines.join('\n');
    const experienceStart = resumeLines.findIndex(l => /^(PROFESSIONAL )?EXPERIENCE$|^WORK (EXPERIENCE|HISTORY)$/i.test(l.trim()));
    const experienceText = experienceStart >= 0 ? resumeLines.slice(experienceStart).join('\n') : resumeText;
    const skillsStart = resumeLines.findIndex(l => /^SKILLS$|^TECHNICAL SKILLS$/i.test(l.trim()));
    const skillsEnd = skillsStart >= 0
      ? resumeLines.findIndex((l, i) => i > skillsStart && /^[A-Z][A-Z\s\/&-]{2,40}$/.test(l.trim()))
      : -1;
    const skillsText = skillsStart >= 0
      ? resumeLines.slice(skillsStart, skillsEnd === -1 ? undefined : skillsEnd).join('\n')
      : resumeText;

    const primaryFound = primary.filter(k => kwOrAliasInText(k, resumeText, aliasMap));
    const primaryMissing = primary.filter(k => !kwOrAliasInText(k, resumeText, aliasMap));
    const inExperience = primary.filter(k => kwOrAliasInText(k, experienceText, aliasMap));
    const inSkillsOnly = primaryFound.filter(k => !kwOrAliasInText(k, experienceText, aliasMap));
    const keywordsInExperience = Math.round((inExperience.length / Math.max(primary.length, 1)) * 25);
    const keywordCredibility = Math.round(Math.max(0, 10 - inSkillsOnly.length * 2));

    const secFound = secondary.filter(k => kwOrAliasInText(k, resumeText, aliasMap));
    const secMissing = secondary.filter(k => !kwOrAliasInText(k, resumeText, aliasMap));
    const secondaryKeywords = Math.round((secFound.length / Math.max(secondary.length, 1)) * 8);

    const bulletLines = resumeLines.filter(l => {
      if (!l || l.length < 10) return false;
      if (/^[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25CF\u2013\u2014•·‣▸▶►○◦*]/.test(l)) return true;
      if (/^-\s+\S/.test(l)) return true;
      if (/^\d{1,2}[.)]\s+\S/.test(l)) return true;
      return false;
    });
    const bulletsWithNum = bulletLines.filter(l => /\d/.test(l));
    const quantified = bulletLines.length ? Math.round((bulletsWithNum.length / bulletLines.length) * 15) : 0;

    const weakStarts = /^(responsible for|worked on|assisted with|helped|involved in|participated in)\b/i;
    const strongBullets = bulletLines.filter(l => !weakStarts.test(l.replace(/^[-•\s]+/, '')));
    const achievementsNotDuties = bulletLines.length ? Math.round((strongBullets.length / bulletLines.length) * 8) : 4;

    const title = extractJdTitle(jd);
    const jdTitle = title.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const summaryArea = resumeLines.filter(Boolean).slice(0, 12).join(' ').toLowerCase();
    const titleWords = jdTitle.split(/\s+/).filter(w => w.length > 3);
    const titleHits = titleWords.filter(w => summaryArea.includes(w)).length;
    const summaryPts = titleWords.length === 0 ? 8
      : titleHits >= titleWords.length ? 12
      : titleHits >= Math.ceil(titleWords.length * 0.6) ? 8 : 4;

    const upperHeaders = resumeLines.filter(l => /^[A-Z][A-Z\s\/&-]{2,44}$/.test(l) && l.trim().length > 2);
    const fmtIssues = [];
    if (upperHeaders.length === 0) fmtIssues.push('No ALL-CAPS section headers detected');
    if (!bulletLines.length) fmtIssues.push('No bullet points found — ATS prefers hyphen bullets');
    if (resumeLines.some(l => l.split('|').length >= 4 && !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|present)/i.test(l))) {
      fmtIssues.push('Table formatting detected — may confuse ATS parsers');
    }
    const format = fmtIssues.length === 0 ? 8 : Math.max(0, 8 - fmtIssues.length * 3);

    const REQUIRED = ['SUMMARY', 'EXPERIENCE', 'SKILLS', 'EDUCATION'];
    const resumeUpper = resume.toUpperCase();
    const missingSections = REQUIRED.filter(s => !resumeUpper.includes(s));
    const structure = missingSections.length === 0 ? 6 : Math.max(0, 6 - missingSections.length * 2);

    const longBullets = bulletLines.filter(l => l.length > 220).length;
    const bulletQuality = bulletLines.length
      ? Math.round(((bulletLines.length - longBullets) / bulletLines.length) * 8)
      : 3;

    const ruleScores = {
      keywordsInExperience,
      keywordCredibility,
      secondaryKeywords,
      quantified,
      achievementsNotDuties,
      tenSecond: summaryPts,
      format,
      structure,
      bulletQuality,
    };
    const atsScore = Math.min(100, Object.values(ruleScores).reduce((a, b) => a + b, 0));

    const tenSecondTest = {
      role: titleHits >= Math.max(1, Math.ceil(titleWords.length * 0.6)),
      years: /\d+\+?\s*years?/i.test(summaryArea),
      strongestTech: primaryFound.length >= 3,
      cloud: /(aws|gcp|azure|google cloud|amazon web services)/i.test(resumeText),
      problemsSolved: /migrat|reduc|improv|built|design|optim/i.test(resumeText),
      measurableResults: bulletsWithNum.length >= Math.max(3, Math.floor(bulletLines.length * 0.5)),
      jdMatch: primaryFound.length / Math.max(primary.length, 1) >= 0.7,
      notes: [],
    };

    const gaps = [
      ...primaryMissing.map(k => `Keyword "${k}" from JD not found — add to Skills and weave into an experience bullet.`),
      ...inSkillsOnly.map(k => `"${k}" is listed in skills but not demonstrated in experience.`),
      ...secMissing.slice(0, 5).map(k => `Secondary keyword "${k}" not found.`),
      ...fmtIssues.map(i => `Format: ${i}`),
      ...missingSections.map(s => `Missing section: ${s}`),
    ].filter(g => !isCertKeyword(g) && !/certif/i.test(g));

    return {
      atsScore,
      atsColour: atsScore >= 95 ? '#4ade80' : atsScore >= 70 ? '#fbbf24' : '#f87171',
      source: 'rag',
      title,
      primaryFound,
      primaryMissing,
      secFound,
      secMissing,
      bulletLines,
      bulletsWithNum,
      fmtCheck: fmtIssues.length === 0 ? 'PASS' : 'WARNING',
      fmtIssues,
      missingSections,
      gaps,
      ruleScores,
      tenSecondTest,
      scorecard: {
        keywordMatch: primaryFound.length,
        keywordsFound: primaryFound,
        keywordsMissing: primaryMissing,
        secondaryFound: secFound,
        secondaryMissing: secMissing,
        bulletsWithMetrics: bulletsWithNum.length,
        bulletsTotal: bulletLines.length,
        summaryScore: summaryPts,
        formatCheck: fmtIssues.length === 0 ? 'PASS' : 'WARNING',
        formatIssues: fmtIssues,
        sectionCheck: missingSections.length === 0 ? 'PASS' : 'FAIL',
        missingSections,
        confidenceLevel: atsScore >= 85 ? 'High' : atsScore >= 70 ? 'Medium' : 'Low',
        confidenceReason: primaryMissing.length === 0
          ? 'All major JD keywords addressed'
          : `${primaryMissing.length} primary keyword(s) still missing`,
        gaps,
        improvementSuggestions: [
          primaryMissing.length ? `Add missing primary keywords: ${primaryMissing.slice(0, 4).join(', ')}` : null,
          inSkillsOnly.length ? `Demonstrate these in experience, not only skills: ${inSkillsOnly.slice(0, 3).join(', ')}` : null,
          bulletsWithNum.length < bulletLines.length ? 'Add metrics to bullets that have no numbers' : null,
          summaryPts < 10 && title ? `Open the summary with the job title: ${title}` : null,
        ].filter(Boolean),
        tenSecondTest,
        ruleScores,
      },
    };
  }

  function buildCompactRewriteContext(jd, resume, keywords) {
    const title = extractJdTitle(jd);
    const lines = jd.split('\n').map(l => l.trim()).filter(Boolean);
    const important = lines.filter(l =>
      /required|must|qualif|responsib|skill|python|spark|sql|aws|gcp|airflow|kafka|dbt/i.test(l)
    ).slice(0, 12);
    return [
      '=== JD CONTEXT ===',
      title ? `ROLE TITLE: ${title}` : '',
      ...important,
      '',
      '=== KEYWORDS TO EMBED ===',
      `PRIMARY: ${(keywords.primary || []).join(', ')}`,
      `SECONDARY: ${(keywords.secondary || []).join(', ')}`,
    ].filter(Boolean).join('\n');
  }

  global.RAGEngine = {
    extractKeywordsRAG,
    computeAtsScore,
    buildCompactRewriteContext,
    jdHash,
    extractJdTitle,
    detectRole,
    buildRoleSkillSet,
    keywordInText: kwOrAliasInText,
    SKILL_KB,
  };
})(typeof window !== 'undefined' ? window : globalThis);
