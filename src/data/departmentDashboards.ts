import type { DepartmentCode } from "./departments";

export type DeptWidgetKey =
  | "cases"
  | "entities"
  | "links"
  | "patterns"
  | "persons"
  | "phones"
  | "financialEntities"
  | "transferValue"
  | "transferLinks"
  | "highValueTrails"
  | "diary"
  | "memos"
  | "custody"
  | "custodyCritical"
  | "chargeSheets"
  | "exhibits"
  | "stagedPending"
  | "batches"
  | "pool"
  | "transfers"
  | "intel";

export interface DeptWidget {
  key: DeptWidgetKey;
  label: string;
  hint: string;
  money?: boolean;
}

/** Each supported agency gets a tailored 4-widget command strip. */
export const DEPT_WIDGETS: Record<DepartmentCode, DeptWidget[]> = {
  CBI: [
    { key: "cases", label: "Cases held", hint: "Across authorisations" },
    { key: "entities", label: "Entities", hint: "Live graph" },
    { key: "diary", label: "Diary entries", hint: "Sec 172 spine" },
    { key: "transfers", label: "Transfers", hint: "Inter-dept ledger" },
  ],
  NIA: [
    { key: "custody", label: "In custody", hint: "Clock running" },
    { key: "custodyCritical", label: "Critical alerts", hint: "Act today" },
    { key: "chargeSheets", label: "Charge sheets", hint: "Sec 173 filed" },
    { key: "diary", label: "Diary entries", hint: "UAPA trail" },
  ],
  CID: [
    { key: "cases", label: "CID cases", hint: "Escalated + multi-district" },
    { key: "entities", label: "Entities", hint: "Live graph" },
    { key: "stagedPending", label: "Pending review", hint: "Awaiting lead" },
    { key: "transfers", label: "Escalations", hint: "Police → CID ledger" },
  ],
  STATE_POLICE: [
    { key: "diary", label: "Diary entries", hint: "Sec 172" },
    { key: "memos", label: "Memos", hint: "Sec 41/102" },
    { key: "custody", label: "Custody", hint: "15/60/90-day" },
    { key: "chargeSheets", label: "Charge sheets", hint: "Sec 173" },
  ],
};

export interface PipelineSnapshot {
  diary: number;
  memos: number;
  custody: number;
  custodyCritical: number;
  chargeSheets: number;
  exhibits: number;
  stagedPending: number;
  batches: number;
  pool: number;
  transfers: number;
  intel: number;
}

export const EMPTY_PIPELINE: PipelineSnapshot = {
  diary: 0,
  memos: 0,
  custody: 0,
  custodyCritical: 0,
  chargeSheets: 0,
  exhibits: 0,
  stagedPending: 0,
  batches: 0,
  pool: 0,
  transfers: 0,
  intel: 0,
};
