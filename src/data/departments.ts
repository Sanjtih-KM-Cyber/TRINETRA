import { STATE_META } from "./roles";

export type DepartmentCode =
  | "CBI"
  | "NIA"
  | "CID"
  | "STATE_POLICE";

export interface AgencyRank {
  short: string;
  full: string;
  level: number;
}

export interface DepartmentIdentity {
  code: DepartmentCode;
  fullName: string;
  shortName: string;
  motto: string;
  mottoHindi: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  /** Official red — high-priority badges, alert tags, secondary buttons. */
  dangerColor: string;
  backgroundGradient: string;
  headquarters: string;
  jurisdiction: string;
  gateway: string;
  clearance: string;
  ranks: AgencyRank[];
  emblemSvg: string;
  /**
   * Short tenant key for the <html data-dept> attribute (CBI, NIA, CID,
   * STATE, MH, WB, KL, DL, GJ, RJ, UP, BR, AS, KAR, AP, TS …). Inspect it
   * in devtools to confirm which palette is live for the signed-in officer.
   */
  tenant: string;
  /**
   * Official emblem photo served from /logos (see public/logos/README.txt).
   * Drop the official logo file at this path; until it exists the built-in
   * SVG emblem renders automatically as fallback.
   */
  logoPath: string;
}

export const DEPARTMENTS: Record<DepartmentCode, DepartmentIdentity> = {
  CBI: {
    code: "CBI",
    fullName: "Central Bureau of Investigation",
    shortName: "CBI",
    motto: "Industry, Impartiality, Integrity",
    mottoHindi: "उद्योग, निष्पक्षता, सत्यनिष्ठा",
    primaryColor: "#003B5C",
    secondaryColor: "#FFFFFF",
    accentColor: "#D4AF37",
    dangerColor: "#C8102E",
    backgroundGradient: "from-[#003B5C] via-slate-950 to-[#3a2f14]",
    headquarters: "CGO Complex, New Delhi",
    jurisdiction: "Pan-India · Interpol Liaison",
    gateway: "CCTNS-GW-CBI-01",
    clearance: "TOP_SECRET",
    logoPath: "/logos/cbi.png",
    tenant: "CBI",
    ranks: [
      { short: "DIR", full: "Director", level: 1 },
      { short: "SPL DIR", full: "Special Director", level: 2 },
      { short: "ADDL DIR", full: "Additional Director", level: 3 },
      { short: "JT DIR", full: "Joint Director", level: 4 },
      { short: "DIG", full: "Deputy Inspector General", level: 5 },
      { short: "SP", full: "Superintendent of Police", level: 6 },
      { short: "ASP", full: "Additional SP", level: 7 },
      { short: "DSP", full: "Deputy SP", level: 8 },
      { short: "INSP", full: "Inspector", level: 9 },
      { short: "SI", full: "Sub-Inspector", level: 10 },
    ],
    emblemSvg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#002147" stroke="#C5A059" stroke-width="2"/><circle cx="32" cy="32" r="24" stroke="#C5A059" stroke-width="1"/><path d="M32 12 L36 26 L50 26 L39 34 L43 48 L32 40 L21 48 L25 34 L14 26 L28 26 Z" fill="#C5A059"/><text x="32" y="58" text-anchor="middle" font-size="7" fill="#fff" font-family="sans-serif" font-weight="bold">CBI</text></svg>`,
  },
  NIA: {
    code: "NIA",
    fullName: "National Investigation Agency",
    shortName: "NIA",
    motto: "Courage, Compassion, Resolve",
    mottoHindi: "साहस, करुणा, संकल्प",
    primaryColor: "#003366",
    secondaryColor: "#FFFFFF",
    accentColor: "#FF9933",
    dangerColor: "#C00000",
    backgroundGradient: "from-[#003366] via-[#1a0d05] to-[#3a2f10]",
    headquarters: "CGO Complex, New Delhi",
    jurisdiction: "Pan-India · Counter-Terrorism",
    gateway: "CCTNS-GW-NIA-01",
    clearance: "TOP_SECRET",
    logoPath: "/logos/nia.png",
    tenant: "NIA",
    ranks: [
      { short: "DG", full: "Director General", level: 1 },
      { short: "ADG", full: "Additional Director General", level: 2 },
      { short: "IG", full: "Inspector General", level: 3 },
      { short: "DIG", full: "Deputy Inspector General", level: 4 },
      { short: "SP", full: "Superintendent of Police", level: 5 },
      { short: "ASP", full: "Additional SP", level: 6 },
      { short: "DSP", full: "Deputy SP", level: 7 },
      { short: "INSP", full: "Inspector", level: 8 },
      { short: "SI", full: "Sub-Inspector", level: 9 },
    ],
    emblemSvg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#1B1B1B" stroke="#D4AF37" stroke-width="2"/><path d="M32 10 L38 24 H24 Z" fill="#8B0000"/><rect x="20" y="28" width="24" height="14" rx="2" fill="#1B1B1B" stroke="#D4AF37"/><path d="M26 34 H38 M26 38 H34" stroke="#D4AF37" stroke-width="2"/><text x="32" y="58" text-anchor="middle" font-size="7" fill="#fff" font-family="sans-serif" font-weight="bold">NIA</text></svg>`,
  },
  CID: {
    code: "CID",
    fullName: "Crime Investigation Department",
    shortName: "CID",
    motto: "Detection Through Dedication",
    mottoHindi: "समर्पण से उद्भेदन",
    primaryColor: "#0A2342",
    secondaryColor: "#334155",
    accentColor: "#3E92CC",
    dangerColor: "#C8102E",
    backgroundGradient: "from-[#0A2342] via-slate-950 to-slate-900",
    headquarters: "State CID Headquarters",
    jurisdiction: "State · Multi-District Special Crimes",
    gateway: "CCTNS-GW-CID-01",
    clearance: "SECRET",
    logoPath: "/logos/cid.png",
    tenant: "CID",
    ranks: [
      { short: "ADGP", full: "Additional Director General", level: 1 },
      { short: "IGP", full: "Inspector General", level: 2 },
      { short: "DIG", full: "Deputy Inspector General", level: 3 },
      { short: "SP", full: "Superintendent of Police", level: 4 },
      { short: "ASP", full: "Additional SP", level: 5 },
      { short: "DSP", full: "Deputy SP", level: 6 },
      { short: "INSP", full: "Inspector", level: 7 },
      { short: "SI", full: "Sub-Inspector", level: 8 },
    ],
    emblemSvg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#0A2342" stroke="#FFFFFF" stroke-width="2"/><circle cx="32" cy="32" r="24" stroke="#3E92CC" stroke-width="1"/><path d="M32 14 L38 26 H26 Z" fill="#FFFFFF"/><rect x="22" y="30" width="20" height="12" rx="2" fill="#FFFFFF"/><path d="M26 35 H38 M26 38 H34" stroke="#0A2342" stroke-width="1.8"/><text x="32" y="58" text-anchor="middle" font-size="7" fill="#fff" font-family="sans-serif" font-weight="bold">CID</text></svg>`,
  },
  STATE_POLICE: {
    code: "STATE_POLICE",
    fullName: "State Police",
    shortName: "State Police",
    motto: "Service Before Self · Satyameva Jayate",
    mottoHindi: "सत्यमेव जयते",
    primaryColor: "#0A2342",
    secondaryColor: "#334155",
    accentColor: "#C5A059",
    dangerColor: "#C8102E",
    backgroundGradient: "from-[#0A2342] via-slate-950 to-slate-900",
    headquarters: "State Police HQ",
    jurisdiction: "State · CrPC / BNSS",
    gateway: "CCTNS-GW-STATE-01",
    clearance: "RESTRICTED",
    logoPath: "/logos/police.png",
    tenant: "STATE",
    ranks: [
      { short: "DGP", full: "Director General of Police", level: 1 },
      { short: "ADGP", full: "Additional DGP", level: 2 },
      { short: "IGP", full: "Inspector General", level: 3 },
      { short: "DIG", full: "Deputy IG", level: 4 },
      { short: "SP", full: "Superintendent of Police", level: 5 },
      { short: "ASP", full: "Additional SP", level: 6 },
      { short: "DSP", full: "Deputy SP", level: 7 },
      { short: "PI", full: "Police Inspector", level: 8 },
      { short: "API", full: "Assistant PI", level: 9 },
      { short: "SI", full: "Sub-Inspector", level: 10 },
      { short: "HC", full: "Head Constable", level: 11 },
      { short: "PC", full: "Police Constable", level: 12 },
    ],
    emblemSvg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#0D2240" stroke="#C5A059" stroke-width="2"/><path d="M32 12 L38 20 V30 C38 38 34 42 32 44 C30 42 26 38 26 30 V20 Z" fill="#4A3728" stroke="#C5A059"/><circle cx="32" cy="30" r="4" fill="#C5A059"/><text x="32" y="58" text-anchor="middle" font-size="5.5" fill="#fff" font-family="sans-serif" font-weight="bold">POLICE</text></svg>`,
  },
};

export const DEPARTMENT_LIST: DepartmentIdentity[] = Object.values(DEPARTMENTS);

// ---------------------------------------------------------------------------
// Official state-police palettes (sanctioned colour scheme). Each keeps
// code "STATE_POLICE" so dashboards/widgets keep working; colours, emblem
// photo, gateway and jurisdiction are state-specific.
// ---------------------------------------------------------------------------

interface StatePalette {
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
  gradient: string;
}

function stateIdentity(
  stateCode: string,
  label: string,
  short: string,
  palette: StatePalette,
  logoFile: string
): DepartmentIdentity {
  return {
    code: "STATE_POLICE",
    tenant: short,
    fullName: `${label} Police`,
    shortName: `${label} Police`,
    motto: "Service Before Self · Satyameva Jayate",
    mottoHindi: "सत्यमेव जयते",
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    dangerColor: palette.danger,
    backgroundGradient: palette.gradient,
    headquarters: `${label} Police Headquarters`,
    jurisdiction: `${label} · CrPC / BNSS`,
    gateway: `CCTNS-GW-${short}-01`,
    clearance: "RESTRICTED",
    ranks: DEPARTMENTS.STATE_POLICE.ranks,
    emblemSvg: DEPARTMENTS.STATE_POLICE.emblemSvg,
    logoPath: `/logos/${logoFile}`,
  };
}

const ROYAL_BLUE_GOLD: StatePalette = {
  primary: "#003B70",
  secondary: "#FFFFFF",
  accent: "#D4AF37",
  danger: "#C00000",
  gradient: "from-[#003B70] via-slate-950 to-slate-900",
};

export const STATE_DEPARTMENTS: Record<string, DepartmentIdentity> = {
  MAHARASHTRA: stateIdentity("MAHARASHTRA", "Maharashtra", "MHA", {
    primary: "#003B70", secondary: "#FFFFFF", accent: "#FFFFFF", danger: "#C8102E",
    gradient: "from-[#003B70] via-slate-950 to-slate-900",
  }, "mh.png"),
  WEST_BENGAL: stateIdentity("WEST_BENGAL", "West Bengal", "WB", {
    primary: "#003153", secondary: "#FFFFFF", accent: "#C8102E", danger: "#C8102E",
    gradient: "from-[#003153] via-slate-950 to-slate-900",
  }, "wb.png"),
  KERALA: stateIdentity("KERALA", "Kerala", "KL", {
    primary: "#F28C28", secondary: "#0057A8", accent: "#FFD700", danger: "#C00000",
    gradient: "from-[#4A2408] via-slate-950 to-slate-900",
  }, "kl.png"),
  DELHI: stateIdentity("DELHI", "Delhi", "DL", {
    primary: "#003399", secondary: "#001A4D", accent: "#C8A951", danger: "#C00000",
    gradient: "from-[#003399] via-slate-950 to-slate-900",
  }, "dl.png"),
  GUJARAT: stateIdentity("GUJARAT", "Gujarat", "GJ", ROYAL_BLUE_GOLD, "gj.png"),
  RAJASTHAN: stateIdentity("RAJASTHAN", "Rajasthan", "RJ", ROYAL_BLUE_GOLD, "rj.png"),
  UTTAR_PRADESH: stateIdentity("UTTAR_PRADESH", "Uttar Pradesh", "UP", ROYAL_BLUE_GOLD, "up.png"),
  BIHAR: stateIdentity("BIHAR", "Bihar", "BR", ROYAL_BLUE_GOLD, "br.png"),
  ASSAM: stateIdentity("ASSAM", "Assam", "AS", ROYAL_BLUE_GOLD, "as.png"),
  KARNATAKA: stateIdentity("KARNATAKA", "Karnataka", "KAR", ROYAL_BLUE_GOLD, "ka.png"),
  ANDHRA_PRADESH: stateIdentity("ANDHRA_PRADESH", "Andhra Pradesh", "AP", ROYAL_BLUE_GOLD, "ap.png"),
  TELANGANA: stateIdentity("TELANGANA", "Telangana", "TS", ROYAL_BLUE_GOLD, "ts.png"),
  TAMIL_NADU: stateIdentity("TAMIL_NADU", "Tamil Nadu", "TN", ROYAL_BLUE_GOLD, "tn.png"),
  MADHYA_PRADESH: stateIdentity("MADHYA_PRADESH", "Madhya Pradesh", "MP", ROYAL_BLUE_GOLD, "mp.png"),
  PUNJAB: stateIdentity("PUNJAB", "Punjab", "PB", ROYAL_BLUE_GOLD, "pb.png"),
};

/** State-specific identity, or the neutral slate State Police fallback. */
export function departmentForState(state?: string): DepartmentIdentity {
  if (state) {
    const hit = STATE_DEPARTMENTS[String(state).toUpperCase()];
    if (hit) return hit;
  }
  return DEPARTMENTS.STATE_POLICE;
}

export function getDepartment(code: string): DepartmentIdentity {
  const upper = code.toUpperCase().replace(/[^A-Z_]/g, "");
  if (upper in DEPARTMENTS) return DEPARTMENTS[upper as DepartmentCode];
  const alias: Record<string, DepartmentCode> = {
    CBI: "CBI",
    NIA: "NIA",
    CID: "CID",
    POLICE: "STATE_POLICE",
    STATE: "STATE_POLICE",
    STATEPOLICE: "STATE_POLICE",
  };
  return DEPARTMENTS[alias[upper] ?? "STATE_POLICE"];
}

export function agencyToDepartment(agency: string): DepartmentIdentity {
  const a = (agency || "").toUpperCase();
  if (a.includes("CBI")) return DEPARTMENTS.CBI;
  if (a.includes("NIA")) return DEPARTMENTS.NIA;
  if (a.includes("CRIME INVESTIGATION") || a === "CID" || a.includes("(CID)")) return DEPARTMENTS.CID;
  return DEPARTMENTS.STATE_POLICE;
}

/**
 * Officer-ID → department + state. Handles every sanctioned identifier form:
 * badge prefixes (`cbi_*`, `CBI-*`, `police_mha_*`, `MHA-*`, `cid_mha_*`,
 * `CID-MHA-*`, …) and official emails (`rao@cbi.gov.in`,
 * `patil@mahapolice.gov.in`, `sharma@cid.gov.in`, …).
 * State matches resolve to the sanctioned state palette (Maharashtra blue +
 * white, West Bengal Prussian blue + red, Kerala multi-colour, Delhi blue +
 * gold, royal blue + gold for the rest) so the frontend recolors directly
 * from the officer ID. Returns null when the identifier carries no
 * recognized badge prefix or gov domain, so callers don't mislabel it.
 */
export function detectGovTenant(identifier: string): { department: DepartmentIdentity; state?: string } | null {
  const id = (identifier || "").trim().toLowerCase();
  if (!id) return null;

  // Federal badges (underscore + dash forms): cbi_*, CBI-*, nia_*, NIA-*, …
  if (id.startsWith("cbi_") || id.startsWith("cbi-")) return { department: DEPARTMENTS.CBI };
  if (id.startsWith("nia_") || id.startsWith("nia-")) return { department: DEPARTMENTS.NIA };

  // CID statewise badges first (cid_mha_*, CID-MHA-*, …), then bare cid_* / CID-*.
  // CID has no single India-wide colour — it always renders the CID palette.
  for (const [code, meta] of Object.entries(STATE_META)) {
    const short = meta.short.toLowerCase();
    if (
      id.startsWith(`cid_${short}_`) || id.startsWith(`cid_${short}-`) ||
      id.startsWith(`cid-${short}_`) || id.startsWith(`cid-${short}-`)
    )
      return { department: DEPARTMENTS.CID, state: code };
  }
  if (id.startsWith("cid_") || id.startsWith("cid-")) return { department: DEPARTMENTS.CID };

  // State-police badges: police_<short>_* and bare <short>-* (MHA-*, KAR-*, …).
  for (const [code, meta] of Object.entries(STATE_META)) {
    const short = meta.short.toLowerCase();
    if (id.startsWith(`police_${short}_`) || id.startsWith(`police-${short}-`) || id.startsWith(`${short}-`))
      return { department: departmentForState(code), state: code };
  }
  if (id.startsWith("police_") || id.startsWith("police-")) return { department: DEPARTMENTS.STATE_POLICE };

  // Official email domains: rao@cbi.gov.in, qureshi@nia.gov.in,
  // sharma@cid.gov.in, patil@mahapolice.gov.in, rao@karpolice.gov.in, …
  const at = id.lastIndexOf("@");
  if (at > 0) {
    const domain = id.slice(at + 1);
    if (domain === "cbi.gov.in") return { department: DEPARTMENTS.CBI };
    if (domain === "nia.gov.in") return { department: DEPARTMENTS.NIA };
    if (domain === "cid.gov.in") return { department: DEPARTMENTS.CID };
    for (const [code, meta] of Object.entries(STATE_META)) {
      if (domain === meta.domain.toLowerCase())
        return { department: departmentForState(code), state: code };
    }
    if (domain.endsWith("police.gov.in")) return { department: DEPARTMENTS.STATE_POLICE };
  }

  return null;
}

/** Back-compat: prefix match or STATE_POLICE fallback. */
export function departmentFromGovId(officialId: string): { department: DepartmentIdentity; state?: string } {
  return detectGovTenant(officialId) ?? { department: DEPARTMENTS.STATE_POLICE };
}
