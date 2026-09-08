import type { CSSProperties } from "react";
import type { DepartmentIdentity } from "../data/departments";

/**
 * Phase 1 Req2 — department dynamic theming.
 * Resolved from the gov-ID prefix at login (departmentForUser) and applied as
 * CSS vars on <html> so shell, navigation and headers follow the agency palette:
 * CBI deep navy/gold, NIA dark-ochre/crimson/gold, CID royal blue/white,
 * State Police khaki-brown/police-blue.
 */
export function applyDepartmentTheme(dept: DepartmentIdentity | null): void {
  const root = document.documentElement;
  if (!dept) {
    root.style.removeProperty("--dept-primary");
    root.style.removeProperty("--dept-secondary");
    root.style.removeProperty("--dept-accent");
    root.removeAttribute("data-dept");
    return;
  }
  root.style.setProperty("--dept-primary", dept.primaryColor);
  root.style.setProperty("--dept-secondary", dept.secondaryColor);
  root.style.setProperty("--dept-accent", dept.accentColor);
  root.setAttribute("data-dept", dept.code);
}

export function departmentShellStyle(dept: DepartmentIdentity | null): CSSProperties {
  if (!dept) return {};
  return {
    borderColor: `${dept.accentColor}55`,
  };
}
