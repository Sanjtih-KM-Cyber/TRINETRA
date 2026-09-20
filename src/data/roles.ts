// ---------------------------------------------------------------------------
// Canonical role & organization model (Phase 0).
//
// Roles are flat, granular strings of the form `<ORG>_<FUNCTIONAL>`, e.g.
// CBI_ADMIN, NIA_LEAD, CID_CYBER, POLICE_FIELD. Organization is recoverable
// from the prefix; state-police jurisdiction lives in a separate `state`
// field on users/cases (e.g. "MAHARASHTRA", "KARNATAKA") so isolation
// between state forces does not require a role per state.
//
// Only these roles are valid for login/access. Legacy role strings
// (LEAD_INVESTIGATOR, CBI_OFFICER, etc.) are intentionally absent — the
// previous agency model (ED/NCB/FIU/CERT-In/IB/NCRB) is retired and no longer
// authenticable, but its seed/UI references may remain dormant in the repo.
// ---------------------------------------------------------------------------

export const ORGS = ["CBI", "NIA", "CID", "POLICE"] as const;
export type Org = (typeof ORGS)[number];

export const FUNCTIONALS = ["ADMIN", "LEAD", "CYBER", "FORENSIC", "FIELD"] as const;
export type Functional = (typeof FUNCTIONALS)[number];

export const USER_ROLES = [
  "CBI_ADMIN",
  "CBI_LEAD",
  "CBI_CYBER",
  "CBI_FORENSIC",
  "CBI_FIELD",
  "NIA_ADMIN",
  "NIA_LEAD",
  "NIA_CYBER",
  "NIA_FORENSIC",
  "NIA_FIELD",
  "CID_ADMIN",
  "CID_LEAD",
  "CID_CYBER",
  "CID_FORENSIC",
  "CID_FIELD",
  "POLICE_ADMIN",
  "POLICE_LEAD",
  "POLICE_CYBER",
  "POLICE_FORENSIC",
  "POLICE_FIELD",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles a user may request via the access-request form (admin never self-requested). */
export const REQUESTABLE_ROLES: UserRole[] = USER_ROLES.filter((r) => !r.endsWith("_ADMIN"));

export function orgOf(role: string): Org {
  const p = role.split("_")[0].toUpperCase();
  return (ORGS as readonly string[]).includes(p) ? (p as Org) : "POLICE";
}

export function functionalOf(role: string): Functional {
  const parts = role.split("_");
  const f = parts[parts.length - 1];
  return (FUNCTIONALS as readonly string[]).includes(f) ? (f as Functional) : "FIELD";
}

export const isAdmin = (r: string) => r.endsWith("_ADMIN");
export const isLead = (r: string) => r.endsWith("_LEAD");
export const isCyber = (r: string) => r.endsWith("_CYBER");
export const isForensic = (r: string) => r.endsWith("_FORENSIC");
export const isField = (r: string) => r.endsWith("_FIELD");

export const ADMIN_ROLES: UserRole[] = USER_ROLES.filter(isAdmin);
export const LEAD_ROLES: UserRole[] = USER_ROLES.filter(isLead);
export const CYBER_ROLES: UserRole[] = USER_ROLES.filter(isCyber);
export const FORENSIC_ROLES: UserRole[] = USER_ROLES.filter(isForensic);
export const FIELD_ROLES: UserRole[] = USER_ROLES.filter(isField);

/** Court-file countersigners + staging approvers: administrators and leads. */
export const REVIEWER_ROLES: UserRole[] = [...ADMIN_ROLES, ...LEAD_ROLES];

/**
 * Tenant isolation key: organization + optional state jurisdiction.
 * State police AND CID are statewise (KARNATAKA vs MAHARASHTRA enforced
 * on this key). CBI/NIA stay federal (org-only).
 */
export function isStatewiseOrg(org: string): boolean {
  const o = String(org || "").toUpperCase();
  return o === "POLICE" || o === "CID";
}

export function tenureKey(role: string, state?: string): string {
  const org = orgOf(role);
  if (isStatewiseOrg(org)) {
    const s = String(state || "").trim().toUpperCase();
    // Legacy docs without state fall back to the bare org so existing
    // Mongo rows (CID with no state) keep matching each other.
    if (!s) return org;
    return `${org}:${s}`;
  }
  return org;
}

/** Case-container tenure: mirrors tenureKey (POLICE + CID statewise). */
export function caseTenureOf(c: any): string {
  if (!c?.org || c.org === "UNKNOWN") return "SHARED";
  const org = String(c.org).toUpperCase();
  if (isStatewiseOrg(org)) {
    const s = String(c.state || "").trim().toUpperCase();
    if (!s) return org;
    return `${org}:${s}`;
  }
  return org;
}

/**
 * Government ID prefix → org/state. Supports `cbi_`, `nia_`, `cid_`,
 * `police_kar_`, `police_mah_` (plus legacy CBI-/MHA-/KAR- badge forms).
 * CID is statewise: `cid_mha_*` / `cid-mha-*` → CID+MAHARASHTRA, bare
 * `cid_*` → CID (legacy, no state).
 */
export function tenureFromOfficialId(officialId: string): { org: Org; state?: string } {
  const id = (officialId || "").toLowerCase();
  if (id.startsWith("cbi_") || id.startsWith("cbi-")) return { org: "CBI" };
  if (id.startsWith("nia_") || id.startsWith("nia-")) return { org: "NIA" };
  // CID statewise first (cid_mha_ / cid-mha- / cid_kar_ / cid-kar- / cid_<short>_).
  for (const [code, meta] of Object.entries(STATE_META)) {
    const short = meta.short.toLowerCase();
    if (id.startsWith(`cid_${short}_`) || id.startsWith(`cid-${short}-`) || id.startsWith(`cid_${short}-`) || id.startsWith(`cid-${short}_`)) return { org: "CID", state: code };
  }
  if (id.startsWith("cid_") || id.startsWith("cid-")) return { org: "CID" };
  for (const [code, meta] of Object.entries(STATE_META)) {
    const short = meta.short.toLowerCase();
    if (id.startsWith(`police_${short}_`) || id.startsWith(`${short}-`)) return { org: "POLICE", state: code };
  }
  // Legacy badges.
  if (id.startsWith("police_kar_") || id.startsWith("kar-")) return { org: "POLICE", state: "KARNATAKA" };
  if (id.startsWith("police_mah_") || id.startsWith("mha-")) return { org: "POLICE", state: "MAHARASHTRA" };
  if (id.startsWith("police_")) return { org: "POLICE" };
  return { org: "POLICE" };
}

/** True when two (role,state) pairs live in the same isolated tenant. */
export function sameTenure(
  aRole: string,
  aState: string | undefined,
  bRole: string,
  bState: string | undefined
): boolean {
  return tenureKey(aRole, aState) === tenureKey(bRole, bState);
}

/** Department-scoped admin check: admin may only manage same-tenure users/cases. */
export function canAdminister(
  adminRole: string,
  adminState: string | undefined,
  targetRole: string,
  targetState: string | undefined
): boolean {
  if (!isAdmin(adminRole)) return false;
  return sameTenure(adminRole, adminState, targetRole, targetState);
}

export interface KnownState {
  code: string;
  label: string;
}

/** State police jurisdictions (extensible). */
export const KNOWN_STATES: KnownState[] = [
  { code: "MAHARASHTRA", label: "Maharashtra" },
  { code: "KARNATAKA", label: "Karnataka" },
  { code: "TAMIL_NADU", label: "Tamil Nadu" },
  { code: "KERALA", label: "Kerala" },
  { code: "ANDHRA_PRADESH", label: "Andhra Pradesh" },
  { code: "TELANGANA", label: "Telangana" },
  { code: "GUJARAT", label: "Gujarat" },
  { code: "RAJASTHAN", label: "Rajasthan" },
  { code: "UTTAR_PRADESH", label: "Uttar Pradesh" },
  { code: "MADHYA_PRADESH", label: "Madhya Pradesh" },
  { code: "WEST_BENGAL", label: "West Bengal" },
  { code: "PUNJAB", label: "Punjab" },
  { code: "DELHI", label: "Delhi" },
  { code: "BIHAR", label: "Bihar" },
  { code: "ASSAM", label: "Assam" },
];

/** Gov-ID short prefixes + mail domains per state (auto-generation + parsing). */
export const STATE_META: Record<string, { short: string; domain: string; agency: string }> = {
  MAHARASHTRA: { short: "MHA", domain: "mahapolice.gov.in", agency: "Maharashtra Police" },
  KARNATAKA: { short: "KAR", domain: "karpolice.gov.in", agency: "Karnataka Police" },
  TAMIL_NADU: { short: "TN", domain: "tnpolice.gov.in", agency: "Tamil Nadu Police" },
  KERALA: { short: "KL", domain: "keralapolice.gov.in", agency: "Kerala Police" },
  ANDHRA_PRADESH: { short: "AP", domain: "appolice.gov.in", agency: "Andhra Pradesh Police" },
  TELANGANA: { short: "TS", domain: "tspolice.gov.in", agency: "Telangana Police" },
  GUJARAT: { short: "GJ", domain: "gujaratpolice.gov.in", agency: "Gujarat Police" },
  RAJASTHAN: { short: "RJ", domain: "rajpolice.gov.in", agency: "Rajasthan Police" },
  UTTAR_PRADESH: { short: "UP", domain: "uppolice.gov.in", agency: "Uttar Pradesh Police" },
  MADHYA_PRADESH: { short: "MP", domain: "mppolice.gov.in", agency: "Madhya Pradesh Police" },
  WEST_BENGAL: { short: "WB", domain: "wbpolice.gov.in", agency: "West Bengal Police" },
  PUNJAB: { short: "PB", domain: "punjabpolice.gov.in", agency: "Punjab Police" },
  DELHI: { short: "DL", domain: "delhipolice.gov.in", agency: "Delhi Police" },
  BIHAR: { short: "BR", domain: "biharpolice.gov.in", agency: "Bihar Police" },
  ASSAM: { short: "AS", domain: "assampolice.gov.in", agency: "Assam Police" },
};