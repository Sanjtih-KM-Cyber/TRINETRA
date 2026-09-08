import { UserRole } from "../types";
import { USER_ROLES, isAdmin, isForensic, isField, isLead, isCyber } from "../data/roles";
import { DepartmentCode, DEPARTMENTS, DepartmentIdentity, agencyToDepartment, departmentFromGovId } from "../data/departments";

export const AGENCY_ROLE_DEPARTMENT: Record<string, DepartmentCode> = {
  CBI_ADMIN: "CBI",
  CBI_LEAD: "CBI",
  CBI_CYBER: "CBI",
  CBI_FORENSIC: "CBI",
  CBI_FIELD: "CBI",
  NIA_ADMIN: "NIA",
  NIA_LEAD: "NIA",
  NIA_CYBER: "NIA",
  NIA_FORENSIC: "NIA",
  NIA_FIELD: "NIA",
  CID_ADMIN: "CID",
  CID_LEAD: "CID",
  CID_CYBER: "CID",
  CID_FORENSIC: "CID",
  CID_FIELD: "CID",
  POLICE_ADMIN: "STATE_POLICE",
  POLICE_LEAD: "STATE_POLICE",
  POLICE_FIELD: "STATE_POLICE",
};

export function departmentForUser(
  role: UserRole,
  agency: string,
  officialId?: string
): DepartmentIdentity {
  // Gov-ID prefix wins (cbi_/nia_/cid_/police_kar_/police_mah_).
  if (officialId) {
    const { department } = departmentFromGovId(officialId);
    // Only trust it when it agrees with the role's org, else prefer role mapping.
    const mapped = AGENCY_ROLE_DEPARTMENT[role];
    if (mapped && DEPARTMENTS[mapped].code === department.code) return department;
    if (!mapped) return department;
  }
  const mapped = AGENCY_ROLE_DEPARTMENT[role];
  if (mapped) return DEPARTMENTS[mapped];
  return agencyToDepartment(agency);
}

/** Workstation shell per role. All canonical roles land via agency dashboard first except service portals. */
export function landingForRole(role: UserRole): "admin" | "forensic" | "field" | "lead" | "agency" {
  if (isAdmin(role)) return "admin";
  if (isForensic(role)) return "forensic";
  if (isField(role)) return "field";
  if (isLead(role) || isCyber(role)) return "agency";
  return "lead";
}

export const ALL_ROLES: UserRole[] = [...USER_ROLES];
