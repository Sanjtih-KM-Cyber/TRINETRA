/**
 * Phase 3 — Local legal knowledge corpus.
 * Real, curated provisions (BNS / BNSS / BSA with CrPC–Evidence Act mappings),
 * constitutional safeguards, and binding precedent ratios. Served locally by
 * SAHAYAK for exact citation lookup; LLM reasoning (when configured) drafts
 * over these retrieved provisions. Local-LoRA serving hooks land in Phase 5.
 */

export interface ConstitutionArticle {
  id: string;
  article: string;
  title: string;
  text: string;
  relevance: string;
}

export interface StatuteProvision {
  id: string;
  code: "BNS" | "BNSS" | "BSA" | "CRPC" | "IEA" | "NDPS" | "UAPA" | "PMLA" | "ITACT" | "ARMS";
  section: string;
  title: string;
  text: string;
  mapsTo?: string;
  keywords: string[];
}

export interface CaseLaw {
  id: string;
  title: string;
  citation: string;
  court: string;
  year: number;
  area: string;
  ratio: string;
  keySections: string[];
}

export const CONSTITUTION: ConstitutionArticle[] = [
  {
    id: "CONST-20",
    article: "Article 20",
    title: "Protection in respect of conviction for offences",
    text: "No ex post facto criminal law; no double jeopardy (nemo debet bis vexari); no compulsion to be a witness against oneself.",
    relevance: "Confessional admissibility, self-incrimination bars on custodial statements.",
  },
  {
    id: "CONST-21",
    article: "Article 21",
    title: "Protection of life and personal liberty",
    text: "No person shall be deprived of life or personal liberty except according to procedure established by law — read with fair, just and reasonable procedure (Maneka Gandhi).",
    relevance: "Bail jurisprudence, speedy trial, default bail u/s 167(2) CrPC / 187 BNSS.",
  },
  {
    id: "CONST-22",
    article: "Article 22(1)–(2)",
    title: "Protection against arrest and detention",
    text: "Right to be informed of grounds of arrest, to consult and be defended by a legal practitioner, and to be produced before a Magistrate within 24 hours.",
    relevance: "Direct authority for Sec 41/50/50A CrPC arrest memo and intimation procedure.",
  },
];

export const STATUTES: StatuteProvision[] = [
  // ---- CrPC core (with BNSS successors) ----
  { id: "CRPC-41", code: "CRPC", section: "41", title: "When police may arrest without warrant", text: "Arrest without Magistrate order where cognizable offence committed in presence, credible complaint, or reasonable suspicion; 41(1)(b) as amended requires written reasons where punishment ≤7 years.", mapsTo: "BNSS Sec 35", keywords: ["arrest", "warrant", "cognizable", "reasons"] },
  { id: "CRPC-41A", code: "CRPC", section: "41A", title: "Notice of appearance before police officer", text: "Where arrest is not required (offences ≤7 years), police shall issue notice of appearance; arrest only for recorded reasons on failure to comply (Arnesh Kumar).", mapsTo: "BNSS Sec 35(3)", keywords: ["notice", "appearance", "arrest", "Arnesh"] },
  { id: "CRPC-50A", code: "CRPC", section: "50A", title: "Obligation to inform nominated person of arrest", text: "Arresting officer must forthwith inform a nominated person of the arrest and the place of detention; entry in the prescribed register (D.K. Basu compliance).", mapsTo: "BNSS Sec 48", keywords: ["intimation", "nominated", "arrest", "Basu"] },
  { id: "CRPC-102", code: "CRPC", section: "102", title: "Power of police officer to seize certain property", text: "Police may seize property alleged or suspected to have been stolen or found under suspicious circumstances; report seizure forthwith to Magistrate; Sec 100 search procedure with independent witnesses applies.", mapsTo: "BNSS Sec 185", keywords: ["seizure", "property", "witness", "inventory"] },
  { id: "CRPC-167", code: "CRPC", section: "167", title: "Procedure when investigation cannot be completed in 24 hours", text: "Magistrate may authorise detention up to 15 days police/judicial custody in total; 60 days (offences <10 years) or 90 days (death/life/≥10 years) outer limit — default bail u/s 167(2) on expiry.", mapsTo: "BNSS Sec 187", keywords: ["remand", "custody", "60 days", "90 days", "default bail"] },
  { id: "CRPC-172", code: "CRPC", section: "172", title: "Diary of proceedings in investigation", text: "IO shall day-by-day enter proceedings in the investigation in the prescribed case diary, including time/place of dispatch; diary aids court inquiry, not evidence per se.", mapsTo: "BNSS Sec 176", keywords: ["case diary", "daily", "proceedings"] },
  { id: "CRPC-173", code: "CRPC", section: "173", title: "Report of police officer on completion of investigation", text: "Final report (charge sheet / closure) with names of parties, nature of information, accomplice statements, and whether offence appears committed and by whom; forwarded to Magistrate.", mapsTo: "BNSS Sec 193", keywords: ["charge sheet", "final report", "closure"] },
  { id: "CRPC-437", code: "CRPC", section: "437", title: "Bail in non-bailable offence (Magistrate)", text: "Regular bail considerations: nature/gravity, antecedents, flight risk, tampering; proviso for women, sick, infirm, <16 years.", mapsTo: "BNSS Sec 480", keywords: ["bail", "regular", "magistrate"] },
  { id: "CRPC-438", code: "CRPC", section: "438", title: "Direction for grant of bail to person apprehending arrest", text: "Anticipatory bail where reason to believe arrest on accusation of non-bailable offence; conditions may be imposed (Sushila Aggarwal — no fixed duration).", mapsTo: "BNSS Sec 482", keywords: ["anticipatory", "bail", "pre-arrest"] },
  { id: "CRPC-439", code: "CRPC", section: "439", title: "Special powers of High Court / Sessions Court regarding bail", text: "Sessions Court and High Court may grant bail in any offence with conditions; power to cancel bail on supervening circumstances.", mapsTo: "BNSS Sec 483", keywords: ["bail", "sessions", "high court", "cancel"] },
  // ---- BNS ----
  { id: "BNS-103", code: "BNS", section: "103", title: "Punishment for murder", text: "Death or life imprisonment with fine.", mapsTo: "IPC Sec 302", keywords: ["murder", "homicide", "life"] },
  { id: "BNS-111", code: "BNS", section: "111", title: "Organised crime", text: "Continuing unlawful activity by group acting in concert (3+ persons) — kidnapping, robbery, extortion, land-grabbing, contract killing, economic offences, cyber-crimes; punishment up to life where death caused.", mapsTo: "New (MCOCA-modelled)", keywords: ["organised", "syndicate", "gang", "continuing"] },
  { id: "BNS-112", code: "BNS", section: "112", title: "Petty organised crime", text: "Theft, snatching, cheating, illegal betting, selling examination papers by gang/group members.", mapsTo: "New", keywords: ["petty", "snatching", "cheating", "gang"] },
  { id: "BNS-318", code: "BNS", section: "318", title: "Cheating", text: "Deception causing delivery of property or consent — up to 7 years where wrongful loss caused.", mapsTo: "IPC Sec 420", keywords: ["cheating", "fraud", "deception", "420"] },
  { id: "BNS-303", code: "BNS", section: "303", title: "Theft", text: "Dishonest moving of movable property out of possession of any person.", mapsTo: "IPC Sec 378/379", keywords: ["theft", "stealing"] },
  { id: "BNS-309", code: "BNS", section: "309", title: "Robbery", text: "Theft/extortion with fear of instant death, hurt or wrongful restraint.", mapsTo: "IPC Sec 390/392", keywords: ["robbery"] },
  { id: "BNS-310", code: "BNS", section: "310", title: "Dacoity", text: "Robbery committed conjointly by five or more persons.", mapsTo: "IPC Sec 391/395", keywords: ["dacoity", "gang robbery"] },
  { id: "BNS-140", code: "BNS", section: "140", title: "Kidnapping / abduction", text: "Kidnapping from lawful guardianship and abduction by force/deceit.", mapsTo: "IPC Sec 359–362", keywords: ["kidnapping", "abduction", "ransom"] },
  // ---- Evidence ----
  { id: "IEA-65B", code: "IEA", section: "65B", title: "Admissibility of electronic records", text: "Electronic records admissible with Sec 65B certificate: computer in regular use, regular feeding, proper operation, derived from ordinary course — certificate by responsible official (Anvar; Arjun Panditrao).", mapsTo: "BSA Sec 63", keywords: ["electronic", "certificate", "CDR", "admissibility", "65B"] },
  { id: "BSA-63", code: "BSA", section: "63", title: "Admissibility of electronic records (BSA)", text: "Successor to IEA Sec 65B: Schedule-based certificate for computer output; hash and system-integrity particulars.", mapsTo: "IEA Sec 65B", keywords: ["electronic", "certificate", "hash", "BSA"] },
  // ---- Special Acts ----
  { id: "NDPS-21", code: "NDPS", section: "21", title: "Punishment for manufactured drugs (commercial quantity)", text: "10–20 years rigorous imprisonment + fine ₹1–2 lakh for commercial quantity (MDMA commercial threshold 10g).", mapsTo: undefined, keywords: ["MDMA", "commercial", "drugs", "narcotics"] },
  { id: "NDPS-29", code: "NDPS", section: "29", title: "Abetment and criminal conspiracy (NDPS)", text: "Abetment/conspiracy punishable as the offence itself — syndicate liability for financiers and coordinators.", mapsTo: undefined, keywords: ["conspiracy", "abetment", "syndicate", "financier"] },
  { id: "UAPA-15", code: "UAPA", section: "15", title: "Terrorist act", text: "Acts with intent to threaten unity/integrity/security or strike terror, including use of explosives, firearms, and economic disruption.", mapsTo: undefined, keywords: ["terrorist", "terror", "act"] },
  { id: "UAPA-17", code: "UAPA", section: "17", title: "Punishment for raising funds for terrorist act", text: "Raising/collecting funds for terrorist acts — the terror-finance limb used with Hawala conduits.", mapsTo: undefined, keywords: ["funds", "terror finance", "hawala", "raising"] },
  { id: "UAPA-43D", code: "UAPA", section: "43D", title: "Arrest, bail and remand under UAPA", text: "Extended remand up to 30 days police custody; 90/180-day charge-sheet window; bail only where court finds reasonable grounds of innocence (Watali).", mapsTo: undefined, keywords: ["UAPA bail", "remand", "Watali", "180 days"] },
  { id: "PMLA-3", code: "PMLA", section: "3", title: "Offence of money-laundering", text: "Direct/indirect attempt, assistance or involvement in any process connected with proceeds of crime including concealment, possession, acquisition or use — projecting as untainted.", mapsTo: undefined, keywords: ["money laundering", "proceeds", "layering", "hawala"] },
  { id: "PMLA-4", code: "PMLA", section: "4", title: "Punishment for money-laundering", text: "Rigorous imprisonment 3–7 years (10 where NDPS predicate involved) + fine up to ₹5 lakh.", mapsTo: undefined, keywords: ["punishment", "PMLA", "proceeds"] },
  { id: "ITACT-66C", code: "ITACT", section: "66C", title: "Identity theft (IT Act)", text: "Fraudulent/dishonest use of another's electronic signature, password or unique identification — OTP/KYC fraud.", mapsTo: undefined, keywords: ["identity", "OTP", "phishing", "KYC"] },
  { id: "ITACT-66D", code: "ITACT", section: "66D", title: "Cheating by personation using computer resource", text: "Cheating by personation through communication device/computer resource — mule-account and impersonation scams.", mapsTo: undefined, keywords: ["personation", "cheating", "computer", "scam"] },
  { id: "ARMS-25", code: "ARMS", section: "25", title: "Punishment for manufacturing/sale/possession of arms", text: "Unlicensed arms manufacture, sale, acquisition or possession — 3 years to life depending on category.", mapsTo: undefined, keywords: ["arms", "firearm", "possession"] },
];

export const CASE_LAW: CaseLaw[] = [
  {
    id: "CL-ARNESH",
    title: "Arnesh Kumar v. State of Bihar",
    citation: "(2014) 8 SCC 273",
    court: "Supreme Court of India",
    year: 2014,
    area: "Arrest procedure",
    ratio: "Police must record reasons for arrest in offences punishable ≤7 years and issue Sec 41A notice of appearance first; routine arrest without necessity is unlawful.",
    keySections: ["CRPC-41", "CRPC-41A"],
  },
  {
    id: "CL-BASU",
    title: "D.K. Basu v. State of West Bengal",
    citation: "(1997) 1 SCC 416",
    court: "Supreme Court of India",
    year: 1997,
    area: "Arrest safeguards",
    ratio: "Eleven mandatory arrest requirements: identification, memo of arrest attested by witness, intimation to nominated person, medical examination, inspection memo.",
    keySections: ["CRPC-41", "CRPC-50A"],
  },
  {
    id: "CL-ANVAR",
    title: "Anvar P.V. v. P.K. Basheer",
    citation: "(2014) 10 SCC 473",
    court: "Supreme Court of India",
    year: 2014,
    area: "Electronic evidence",
    ratio: "Sec 65B certificate is mandatory for secondary electronic evidence (CDRs, call recordings); without it, the record is inadmissible.",
    keySections: ["IEA-65B", "BSA-63"],
  },
  {
    id: "CL-ARJUN",
    title: "Arjun Panditrao Khotkar v. Kailash Kishanrao Gorantyal",
    citation: "(2020) 7 SCC 1",
    court: "Supreme Court of India",
    year: 2020,
    area: "Electronic evidence",
    ratio: "Clarified Anvar: certificate can be filed at any stage before trial closes; hash-value and system-integrity particulars required for computer output.",
    keySections: ["IEA-65B", "BSA-63"],
  },
  {
    id: "CL-ANTIL",
    title: "Satender Kumar Antil v. CBI",
    citation: "(2022) 7 SCC 51",
    court: "Supreme Court of India",
    year: 2022,
    area: "Bail jurisprudence",
    ratio: "Bail-not-jail; graded guidelines (Categories A–E) by punishment and custody status; routine conditions and time-bound disposal of bail pleas.",
    keySections: ["CRPC-437", "CRPC-439"],
  },
  {
    id: "CL-WATALI",
    title: "NIA v. Zahoor Ahmad Shah Watali",
    citation: "(2019) 5 SCC 1",
    court: "Supreme Court of India",
    year: 2019,
    area: "UAPA bail",
    ratio: "At bail stage under UAPA, court examines whether accusations are prima facie true on broad probabilities — a higher bar than ordinary bail.",
    keySections: ["UAPA-43D", "UAPA-15"],
  },
  {
    id: "CL-VIJAY",
    title: "Vijay Madanlal Choudhary v. Union of India",
    citation: "(2022) SCC OnLine SC 929",
    court: "Supreme Court of India",
    year: 2022,
    area: "PMLA",
    ratio: "Upheld ED's powers of arrest, search, seizure and the twin bail conditions u/s 45 PMLA; ECIR is an internal document, FIR not mandatory.",
    keySections: ["PMLA-3", "PMLA-4"],
  },
  {
    id: "CL-HIRA",
    title: "Hira Singh v. Union of India",
    citation: "(2020) 20 SCC 272",
    court: "Supreme Court of India",
    year: 2020,
    area: "NDPS quantity",
    ratio: "For mixtures, the entire weight (neutral substance + narcotic) determines small vs commercial quantity.",
    keySections: ["NDPS-21"],
  },
  {
    id: "CL-SUSHILA",
    title: "Sushila Aggarwal v. State (NCT of Delhi)",
    citation: "(2020) 5 SCC 1",
    court: "Supreme Court of India (Constitution Bench)",
    year: 2020,
    area: "Anticipatory bail",
    ratio: "Anticipatory bail need not be time-limited; it ordinarily continues till trial end unless conditions warrant otherwise.",
    keySections: ["CRPC-438"],
  },
  {
    id: "CL-MANISH",
    title: "Manish Sisodia v. CBI / Directorate of Enforcement",
    citation: "2024 SCC OnLine SC 1920",
    court: "Supreme Court of India",
    year: 2024,
    area: "Bail / speedy trial",
    ratio: "Prolonged incarceration without trial prospect violates Article 21; bail is the rule even in economic offences with stringent twin conditions.",
    keySections: ["CRPC-439", "CONST-21"],
  },
  {
    id: "CL-MOHANLAL",
    title: "Mohan Lal v. State of Punjab",
    citation: "(2018) 17 SCC 627",
    court: "Supreme Court of India",
    year: 2018,
    area: "NDPS procedure",
    ratio: "Fair-investigation rule: complainant should not himself be the investigator in NDPS cases; inventory and sampling safeguards mandatory.",
    keySections: ["NDPS-21", "CRPC-102"],
  },
  {
    id: "CL-JOGINDER",
    title: "Joginder Kumar v. State of U.P.",
    citation: "(1994) 4 SCC 260",
    court: "Supreme Court of India",
    year: 1994,
    area: "Arrest safeguards",
    ratio: "Arrest is not mandatory on accusation; police must justify arrest on necessity — existence of power is one thing, justification for its exercise another.",
    keySections: ["CRPC-41"],
  },
];

export interface LegalHit {
  kind: "constitution" | "statute" | "caselaw";
  id: string;
  title: string;
  ref: string;
  snippet: string;
}

/** Exact + keyword lookup across Constitution, statutes and case law. */
export function searchLegalCorpus(query: string, limit = 8): LegalHit[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const scored: Array<{ hit: LegalHit; score: number }> = [];

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  const sectionMatch = (section: string) => {
    const digits = section.replace(/\D/g, "");
    const qDigits = q.replace(/\D/g, "");
    return digits.length > 0 && qDigits.length > 0 && (digits === qDigits || section.toLowerCase() === q);
  };

  for (const c of CONSTITUTION) {
    let score = 0;
    if (norm(c.article) === norm(query) || norm(c.title).includes(q)) score += 10;
    if (norm(c.text).includes(q) || norm(c.relevance).includes(q)) score += 3;
    if (score > 0) scored.push({ hit: { kind: "constitution", id: c.id, title: `${c.article} — ${c.title}`, ref: c.article, snippet: c.text }, score });
  }
  for (const s of STATUTES) {
    let score = 0;
    if (sectionMatch(s.section) && (q.includes(s.code.toLowerCase()) || q.replace(/\D/g, "") === s.section.replace(/\D/g, ""))) score += 12;
    if (norm(`${s.code} ${s.section}`) === norm(query)) score += 12;
    for (const k of s.keywords) {
      if (q.includes(k) || k.includes(q)) score += 2;
    }
    if (norm(s.title).includes(q)) score += 5;
    if (score > 0) scored.push({ hit: { kind: "statute", id: s.id, title: `${s.code} Sec ${s.section} — ${s.title}${s.mapsTo ? ` (≡ ${s.mapsTo})` : ""}`, ref: `${s.code} ${s.section}`, snippet: s.text }, score });
  }
  for (const c of CASE_LAW) {
    let score = 0;
    if (norm(c.title).includes(q) || q.split(/\s+/).some((w) => w.length > 4 && norm(c.title).includes(w))) score += 6;
    if (norm(c.area).includes(q)) score += 4;
    if (norm(c.ratio).includes(q)) score += 2;
    if (score > 0) scored.push({ hit: { kind: "caselaw", id: c.id, title: `${c.title} ${c.citation}`, ref: c.citation, snippet: c.ratio }, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.hit);
}

export function statuteById(id: string): StatuteProvision | undefined {
  return STATUTES.find((s) => s.id === id);
}

export function caseLawById(id: string): CaseLaw | undefined {
  return CASE_LAW.find((c) => c.id === id);
}
