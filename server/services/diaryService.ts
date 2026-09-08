import crypto from "crypto";
import { db, DBUser } from "../db";
import { broadcastCaseUpdate } from "../realtime";

/** Ranks empowered to countersign a Sec 172 diary / approve a charge sheet (admins + leads, all tenants). */
import { REVIEWER_ROLES } from "../../src/data/roles";

export const SP_ELIGIBLE_ROLES: string[] = [...REVIEWER_ROLES];

export function sha256(payload: string): string {
  return `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`;
}

export function recordHash(canonical: unknown, prevHash?: string, at?: string): string {
  return sha256(`${prevHash || "GENESIS"}|${JSON.stringify(canonical)}|${at || new Date().toISOString()}`);
}

/**
 * Appends a tamper-evident Sec 172 case-diary entry chained to the previous
 * entry's hash. Used for manual entries and automatic graph-action logging.
 */
export async function appendDiaryEntry(
  caseId: string,
  user: DBUser,
  input: {
    date?: string;
    time?: string;
    place: string;
    firRef?: string;
    proceedings: string;
    actionTaken?: string;
    autoLogged?: boolean;
    sourceAction?: string;
    voiceLocale?: string;
  }
) {
  const now = new Date().toISOString();
  const existing = await db.case_diary.find(caseId);
  const diaryNo = existing.length + 1;
  const prevHash = existing.length > 0 ? existing[existing.length - 1].hash : undefined;

  const canonical = {
    caseId,
    diaryNo,
    proceedings: input.proceedings,
    actionTaken: input.actionTaken || "",
    ioId: user._id,
  };
  const hash = recordHash(canonical, prevHash, now);

  const entry = await db.case_diary.insertOne({
    _id: `diary-${caseId}-${diaryNo}-${Date.now()}`,
    case_id: caseId,
    diaryNo,
    date: input.date || now.slice(0, 10),
    time: input.time,
    place: input.place,
    firRef: input.firRef,
    proceedings: input.proceedings,
    actionTaken: input.actionTaken,
    autoLogged: !!input.autoLogged,
    sourceAction: input.sourceAction,
    voiceLocale: input.voiceLocale,
    status: "DRAFT",
    ioName: user.name,
    ioRank: user.designation,
    ioId: user._id,
    prevHash,
    hash,
    created_at: now,
    updated_at: now,
  });

  return entry;
}

/** Fire-and-forget Sec 172 auto-log for graph / evidence / custody actions. Never throws. */
export async function autoLogDiary(
  caseId: string,
  user: DBUser,
  proceedings: string,
  sourceAction: string,
  place = "Crime Intelligence Workstation"
): Promise<void> {
  try {
    await appendDiaryEntry(caseId, user, {
      place,
      proceedings,
      autoLogged: true,
      sourceAction,
    });
  } catch (err) {
    console.error("[DIARY] auto-log failed:", err);
  }
}

export async function auditRecord(
  caseId: string,
  user: DBUser,
  action: string,
  details: string,
  targetType: string,
  targetId?: string,
  targetLabel?: string,
  metadata?: any,
  ip = "127.0.0.1"
) {
  const now = new Date().toISOString();
  const digitalHash = sha256(`${caseId}:${action}:${targetId || "none"}:${user._id}:${now}`);
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action,
    case_id: caseId,
    target_type: targetType,
    target_id: targetId,
    target_label: targetLabel,
    details,
    digital_hash: digitalHash,
    result: "SUCCESS",
    ip_address: ip,
    metadata: metadata || null,
  });
  return digitalHash;
}

export function notifyCase(
  caseId: string,
  event_type: string,
  title: string,
  message: string,
  user: DBUser
) {
  broadcastCaseUpdate(caseId, {
    event_type,
    title,
    message,
    changes: {},
    actor_name: user.name,
    actor_role: user.role,
  });
}

// ---------------------------------------------------------------------------
// Custody law engine (Sec 167 CrPC / Sec 187 BNSS + bail provisions)
// ---------------------------------------------------------------------------

export const PC_LIMIT_DAYS = 15;

export function chargeSheetLimitDays(punishmentYears: number): 60 | 90 {
  return punishmentYears >= 10 ? 90 : 60;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000);
}

export interface CustodyComputation {
  pcUsed: number;
  pcRemaining: number;
  dueDate: string;
  limitDays: 60 | 90;
  daysToDue: number;
  lastRemandExpiry?: string;
  daysToRemandExpiry?: number;
  grantedBail?: boolean;
}

export function computeCustody(record: {
  arrestDate: string;
  offencePunishmentYears: number;
  remands: Array<{ orderDate: string; daysGranted: number; custodyType: string }>;
  bailApplications: Array<{ status: string }>;
}): CustodyComputation {
  const now = new Date().toISOString();
  const pcUsed = record.remands
    .filter((r) => r.custodyType === "PC")
    .reduce((sum, r) => sum + (Number(r.daysGranted) || 0), 0);
  const limitDays = chargeSheetLimitDays(Number(record.offencePunishmentYears) || 0);
  const dueDate = addDays(record.arrestDate, limitDays);
  const daysToDue = daysBetween(now, dueDate);

  let lastRemandExpiry: string | undefined;
  if (record.remands.length > 0) {
    const last = record.remands[record.remands.length - 1];
    lastRemandExpiry = addDays(last.orderDate, Number(last.daysGranted) || 0);
  }
  const grantedBail = record.bailApplications.some((b) => b.status === "GRANTED");

  return {
    pcUsed,
    pcRemaining: Math.max(0, PC_LIMIT_DAYS - pcUsed),
    dueDate,
    limitDays,
    daysToDue,
    lastRemandExpiry,
    daysToRemandExpiry: lastRemandExpiry ? daysBetween(now, lastRemandExpiry) : undefined,
    grantedBail,
  };
}
