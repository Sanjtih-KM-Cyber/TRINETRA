import { UserRole } from "../types";
import { USER_ROLES, isAdmin, isForensic, isField, isLead, isCyber } from "../data/roles";
import { DepartmentCode, DEPARTMENTS, DepartmentIdentity, agencyToDepartment, departmentForState, departmentFromGovId, detectGovTenant } from "../data/departments";

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
  POLICE_CYBER: "STATE_POLICE",
  POLICE_FORENSIC: "STATE_POLICE",
  POLICE_FIELD: "STATE_POLICE",
};

export function departmentForUser(
  role: UserRole,
  agency: string,
  officialId?: string
): DepartmentIdentity {
  // Officer ID is the source of truth: its badge prefix or gov-mail domain
  // resolves the department (and sanctioned state palette) directly, so the
  // frontend recolors to suit the signed-in officer.
  if (officialId && detectGovTenant(officialId)) {
    const { department, state } = departmentFromGovId(officialId);
    // State police resolve to their sanctioned state palette.
    if (department.code === "STATE_POLICE") return departmentForState(state);
    return department;
  }
  const mapped = AGENCY_ROLE_DEPARTMENT[role];
  if (mapped) {
    if (mapped === "STATE_POLICE") return departmentForState(undefined);
    return DEPARTMENTS[mapped];
  }
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
