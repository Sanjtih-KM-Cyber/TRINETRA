import type { CSSProperties } from "react";
import type { DepartmentIdentity } from "../data/departments";

/**
 * Phase 1 Req2 — department dynamic theming.
 * Resolved directly from the officer ID at login (departmentForUser) and
 * applied as CSS vars on <html> so shell, navigation and headers follow the
 * sanctioned agency palette: CBI navy/gold/red, NIA navy/saffron/red, CID
 * navy-blue, and each state police force in its official colours
 * (Maharashtra blue/white, West Bengal Prussian blue/red, Kerala
 * orange/blue/gold/red, Delhi blue/gold/red, royal blue/gold/red elsewhere).
 */
export function applyDepartmentTheme(dept: DepartmentIdentity | null): void {
  const root = document.documentElement;
  if (!dept) {
    root.style.removeProperty("--dept-primary");
    root.style.removeProperty("--dept-secondary");
    root.style.removeProperty("--dept-accent");
    root.style.removeProperty("--dept-danger");
    root.removeAttribute("data-dept");
    return;
  }
  root.style.setProperty("--dept-primary", dept.primaryColor);
  root.style.setProperty("--dept-secondary", dept.secondaryColor);
  root.style.setProperty("--dept-accent", dept.accentColor);
  root.style.setProperty("--dept-danger", dept.dangerColor);
  root.setAttribute("data-dept", dept.tenant || dept.code);
}

export function departmentShellStyle(dept: DepartmentIdentity | null): CSSProperties {
  if (!dept) return {};
  return {
    borderColor: `${dept.accentColor}55`,
  };
}
