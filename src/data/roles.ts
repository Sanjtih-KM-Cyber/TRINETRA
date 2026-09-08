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

// State Police has no CYBER/FORENSIC (those live under CID at state level).
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
 * State police isolation (KARNATAKA vs MAHARASHTRA) is enforced on this key.
 */
export function tenureKey(role: string, state?: string): string {
  const org = orgOf(role);
  return org === "POLICE" ? `${org}:${(state || "POLICE").toUpperCase()}` : org;
}

/**
 * Government ID prefix → org/state. Supports `cbi_`, `nia_`, `cid_`,
 * `police_kar_`, `police_mah_` (plus legacy CBI-/MHA-/KAR- badge forms).
 */
export function tenureFromOfficialId(officialId: string): { org: Org; state?: string } {
  const id = (officialId || "").toLowerCase();
  if (id.startsWith("cbi_") || id.startsWith("cbi-")) return { org: "CBI" };
  if (id.startsWith("nia_") || id.startsWith("nia-")) return { org: "NIA" };
  if (id.startsWith("cid_") || id.startsWith("cid-")) return { org: "CID" };
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

/** Seeded state police jurisdictions for the demo (extensible). */
export const KNOWN_STATES: KnownState[] = [
  { code: "MAHARASHTRA", label: "Maharashtra" },
  { code: "KARNATAKA", label: "Karnataka" },
];