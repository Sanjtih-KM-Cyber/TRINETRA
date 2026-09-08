import { Router, Response } from "express";
import { db, DBUser } from "../db";
import { authenticateToken, requireCaseMembership, requireEditAccess, AuthenticatedRequest } from "../auth";
import {
  SP_ELIGIBLE_ROLES,
  sha256,
  recordHash,
  appendDiaryEntry,
  autoLogDiary,
  auditRecord,
  notifyCase,
  computeCustody,
  addDays,
  PC_LIMIT_DAYS,
} from "../services/diaryService";
import { validateAadhaar, maskAadhaar } from "../../src/services/aadhaar";
import { MO_CODES } from "../../src/data/moCodes";
import { sahayakChargeAssist } from "../services/sahayak";

const router = Router();
router.use(authenticateToken);

const STATUTES = ["CRPC_41", "CRPC_41A", "CRPC_102", "BNSS_35", "BNSS_35_3", "BNSS_185"];
const VALID_MO = new Set(MO_CODES.map((m) => m.code));

function requireSP(user: DBUser): boolean {
  return SP_ELIGIBLE_ROLES.includes(user.role);
}

// ---------------------------------------------------------------------------
// SECTION 172 CASE DIARY
// ---------------------------------------------------------------------------

router.get("/:caseId/diary", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const entries = await db.case_diary.find(req.params.caseId);
  res.json({ entries });
});

router.post("/:caseId/diary", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { date, time, place, firRef, proceedings, actionTaken, voiceLocale } = req.body;

  if (!proceedings || typeof proceedings !== "string" || proceedings.trim().length < 10) {
    res.status(400).json({ error: "Proceedings narrative is required (minimum 10 characters)." });
    return;
  }
  if (!place || typeof place !== "string") {
    res.status(400).json({ error: "Place of proceedings is required." });
    return;
  }

  const entry = await appendDiaryEntry(caseId, user, {
    date,
    time,
    place,
    firRef,
    proceedings: proceedings.trim(),
    actionTaken,
    voiceLocale,
  });

  await auditRecord(
    caseId, user, "DIARY_ENTRY_CREATED",
    `Sec 172 diary entry No.${entry.diaryNo} recorded by ${user.name} at ${place}.`,
    "DOSSIER", entry._id, `Case Diary No.${entry.diaryNo}`,
    { diaryNo: entry.diaryNo }, req.ip
  );
  notifyCase(caseId, "DIARY_ENTRY_CREATED", "Case Diary Updated",
    `${user.name} recorded Sec 172 diary entry No.${entry.diaryNo}.`, user);

  res.status(201).json({ success: true, entry });
});

router.post("/:caseId/diary/:entryId/sign", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, entryId } = req.params;
  const user = req.user!;
  const entry = await db.case_diary.findOne(entryId);
  if (!entry || entry.case_id !== caseId) {
    res.status(404).json({ error: "Diary entry not found." });
    return;
  }
  if (entry.status !== "DRAFT") {
    res.status(400).json({ error: `Entry is already ${entry.status}.` });
    return;
  }
  if (entry.ioId !== user._id && !SP_ELIGIBLE_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Only the recording officer (or Lead IO / Admin) may sign this entry." });
    return;
  }

  const now = new Date().toISOString();
  const ioSignature = {
    name: user.name,
    rank: user.designation,
    badgeNumber: user.official_id,
    signedAt: now,
    hash: sha256(`${entry.hash}|IO-SIGN|${user._id}|${now}`),
  };
  const updated = await db.case_diary.updateOne(entryId, { ioSignature, status: "SIGNED", updated_at: now });

  await auditRecord(caseId, user, "DIARY_ENTRY_SIGNED",
    `${user.name} signed Sec 172 diary entry No.${entry.diaryNo}.`, "DOSSIER",
    entryId, `Case Diary No.${entry.diaryNo}`, undefined, req.ip);
  notifyCase(caseId, "DIARY_ENTRY_SIGNED", "Diary Entry Signed",
    `${user.name} signed diary entry No.${entry.diaryNo}.`, user);

  res.json({ success: true, entry: updated });
});

router.post("/:caseId/diary/:entryId/countersign", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, entryId } = req.params;
  const user = req.user!;
  const entry = await db.case_diary.findOne(entryId);
  if (!entry || entry.case_id !== caseId) {
    res.status(404).json({ error: "Diary entry not found." });
    return;
  }
  if (!requireSP(user)) {
    res.status(403).json({
      error: "Countersign requires SP rank or above (SP / Director / central agency officer).",
    });
    return;
  }
  if (entry.status !== "SIGNED") {
    res.status(400).json({ error: "Entry must be IO-signed before SP countersign." });
    return;
  }

  const now = new Date().toISOString();
  const countersign = {
    name: user.name,
    rank: user.designation,
    badgeNumber: user.official_id,
    signedAt: now,
    hash: sha256(`${entry.hash}|SP-COUNTERSIGN|${user._id}|${now}`),
  };
  const updated = await db.case_diary.updateOne(entryId, { countersign, status: "COUNTERSIGNED", updated_at: now });

  await auditRecord(caseId, user, "DIARY_ENTRY_COUNTERSIGNED",
    `${user.name} (${user.designation}) countersigned Sec 172 diary entry No.${entry.diaryNo}.`,
    "DOSSIER", entryId, `Case Diary No.${entry.diaryNo}`, undefined, req.ip);
  await autoLogDiary(caseId, user,
    `SP countersign recorded on Sec 172 diary entry No.${entry.diaryNo} by ${user.name} (${user.designation}).`,
    "DIARY_COUNTERSIGN");
  notifyCase(caseId, "DIARY_COUNTERSIGNED", "Diary Countersigned",
    `${user.name} countersigned diary entry No.${entry.diaryNo}.`, user);

  res.json({ success: true, entry: updated });
});

// ---------------------------------------------------------------------------
// ARREST / SEIZURE MEMOS (Sec 41 / 102 CrPC · Sec 35 / 185 BNSS)
// ---------------------------------------------------------------------------

router.get("/:caseId/arrest-memos", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const memos = await db.arrest_memos.find(req.params.caseId);
  res.json({ memos });
});

router.post("/:caseId/arrest-memos", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const {
    memoType, statute, date, time, place, firNumber, sections,
    accused, groundsOfArrest, articles, witnesses,
    rightsRead, intimationName, intimationRelation, intimationPhone,
    aadhaarNumber, esignName,
  } = req.body;

  if (!["ARREST", "SEIZURE", "ARREST_CUM_SEIZURE"].includes(memoType)) {
    res.status(400).json({ error: "memoType must be ARREST, SEIZURE or ARREST_CUM_SEIZURE." });
    return;
  }
  if (!STATUTES.includes(statute)) {
    res.status(400).json({ error: `statute must be one of: ${STATUTES.join(", ")}.` });
    return;
  }
  if (!place || !firNumber) {
    res.status(400).json({ error: "place and firNumber are required." });
    return;
  }
  if (memoType !== "SEIZURE") {
    if (!accused?.name || !accused?.address) {
      res.status(400).json({ error: "Arrest memo requires accused name and address." });
      return;
    }
    if (!groundsOfArrest || String(groundsOfArrest).trim().length < 10) {
      res.status(400).json({ error: "Grounds of arrest are mandatory (Sec 41/50 CrPC compliance)." });
      return;
    }
  }
  const arts = Array.isArray(articles) ? articles : [];
  if (memoType !== "ARREST" && arts.length === 0) {
    res.status(400).json({ error: "Seizure memo requires at least one seized article." });
    return;
  }
  const wits = Array.isArray(witnesses) ? witnesses : [];
  const requiredWitnesses = memoType === "ARREST" ? 1 : 2;
  if (wits.length < requiredWitnesses || wits.some((w: any) => !w.name || !w.address)) {
    res.status(400).json({
      error: `Memo requires at least ${requiredWitnesses} independent witness(es) with name and address (Sec 100(4) CrPC).`,
    });
    return;
  }

  let esign: any = undefined;
  if (aadhaarNumber) {
    const check = validateAadhaar(String(aadhaarNumber));
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }
    const now0 = new Date().toISOString();
    esign = {
      signerName: esignName || user.name,
      signerRole: user.designation,
      aadhaarMasked: maskAadhaar(String(aadhaarNumber)),
      signedAt: now0,
      hash: sha256(`${caseId}|${esignName || user.name}|${maskAadhaar(String(aadhaarNumber))}|${now0}`),
    };
  }

  const now = new Date().toISOString();
  const existing = await db.arrest_memos.find(caseId);
  const memoNo = `AM-${new Date().getFullYear()}-${String(existing.length + 1).padStart(3, "0")}`;
  const canonical = { caseId, memoNo, memoType, firNumber, accused: accused?.name || "", articles: arts.length };
  const hash = recordHash(canonical, undefined, now);

  const memo = await db.arrest_memos.insertOne({
    _id: `memo-${caseId}-${Date.now()}`,
    case_id: caseId,
    memoNo,
    memoType,
    statute,
    date: date || now.slice(0, 10),
    time,
    place,
    firNumber,
    sections: Array.isArray(sections) ? sections : [],
    accused,
    groundsOfArrest,
    articles: arts.map((a: any) => ({
      description: a.description,
      quantity: a.quantity || "1",
      value: a.value,
      identificationMark: a.identificationMark,
      sealed: !!a.sealed,
      sealNo: a.sealNo,
    })),
    witnesses: wits.map((w: any) => ({
      name: w.name,
      address: w.address,
      relation: w.relation,
      signed: !!w.signed,
      signedAt: w.signed ? now : undefined,
    })),
    rightsRead: !!rightsRead,
    intimationName,
    intimationRelation,
    intimationPhone,
    intimationAt: intimationName ? now : undefined,
    ioName: user.name,
    ioRank: user.designation,
    ioId: user._id,
    esign,
    status: "DRAFT",
    hash,
    created_at: now,
    updated_at: now,
  });

  await auditRecord(caseId, user, "ARREST_MEMO_CREATED",
    `${memoType} memo ${memoNo} drawn at ${place} in FIR ${firNumber} by ${user.name}.`,
    "EXHIBIT", memo._id, memoNo, { memoType, statute }, req.ip);
  await autoLogDiary(caseId, user,
    `${memoType === "SEIZURE" ? "Seizure" : "Arrest"} memo ${memoNo} drawn at ${place} (FIR ${firNumber}, ${memo.sections.join(", ") || "sections as per FIR"}). Witnesses: ${wits.map((w: any) => w.name).join(", ")}.`,
    "MEMO_CREATED", place);
  notifyCase(caseId, "MEMO_CREATED", "Arrest/Seizure Memo Drawn",
    `${user.name} drew ${memoType} memo ${memoNo}.`, user);

  res.status(201).json({ success: true, memo });
});

router.patch("/:caseId/arrest-memos/:memoId", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, memoId } = req.params;
  const user = req.user!;
  const { status, aadhaarNumber, esignName } = req.body;
  const memo = await db.arrest_memos.findOne(memoId);
  if (!memo || memo.case_id !== caseId) {
    res.status(404).json({ error: "Memo not found." });
    return;
  }

  const now = new Date().toISOString();
  const updates: any = { updated_at: now };

  if (status) {
    const order = ["DRAFT", "SIGNED", "FILED"];
    if (!order.includes(status)) {
      res.status(400).json({ error: "Invalid status." });
      return;
    }
    if (order.indexOf(status) < order.indexOf(memo.status)) {
      res.status(400).json({ error: `Memo cannot regress from ${memo.status} to ${status}.` });
      return;
    }
    if (status === "SIGNED" && memo.ioId !== user._id && !SP_ELIGIBLE_ROLES.includes(user.role)) {
      res.status(403).json({ error: "Only the drawing officer (or Lead IO / Admin) may sign the memo." });
      return;
    }
    updates.status = status;
  }

  if (aadhaarNumber) {
    const check = validateAadhaar(String(aadhaarNumber));
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }
    updates.esign = {
      signerName: esignName || user.name,
      signerRole: user.designation,
      aadhaarMasked: maskAadhaar(String(aadhaarNumber)),
      signedAt: now,
      hash: sha256(`${memoId}|${esignName || user.name}|${maskAadhaar(String(aadhaarNumber))}|${now}`),
    };
  }

  updates.hash = recordHash({ memoId, status: updates.status || memo.status, esign: !!updates.esign }, memo.hash, now);
  const updated = await db.arrest_memos.updateOne(memoId, updates);

  await auditRecord(caseId, user, "ARREST_MEMO_UPDATED",
    `Memo ${memo.memoNo} updated (${status ? `status → ${status}` : ""}${aadhaarNumber ? "Aadhaar e-sign affixed" : ""}).`,
    "EXHIBIT", memoId, memo.memoNo, undefined, req.ip);
  notifyCase(caseId, "MEMO_UPDATED", "Memo Updated", `${user.name} updated memo ${memo.memoNo}.`, user);

  res.json({ success: true, memo: updated });
});

// ---------------------------------------------------------------------------
// HISTORY SHEET / DOSSIER (Cat A/B/C · MO codes · Village Crime Notebook)
// ---------------------------------------------------------------------------

router.get("/:caseId/history-sheets", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const sheets = await db.history_sheets.find(req.params.caseId);
  res.json({ sheets });
});

router.post("/:caseId/history-sheets", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const {
    subjectName, aliases, dob, address, policeStation, district, category,
    moCodes, previousCases, associates,
    village, beatNo, beatOfficer, villageRemarks,
    surveillanceLevel, checkIntervalDays,
  } = req.body;

  if (!subjectName || !address || !policeStation || !district || !village) {
    res.status(400).json({ error: "subjectName, address, policeStation, district and village are required." });
    return;
  }
  if (!["A", "B", "C"].includes(category)) {
    res.status(400).json({ error: "category must be A (desperate), B (confirmed) or C (suspect)." });
    return;
  }
  const codes = Array.isArray(moCodes) ? moCodes : [];
  const bad = codes.filter((c: string) => !VALID_MO.has(c));
  if (bad.length > 0) {
    res.status(400).json({ error: `Unknown MO codes: ${bad.join(", ")}.` });
    return;
  }
  if (codes.length === 0) {
    res.status(400).json({ error: "At least one MO code is required." });
    return;
  }

  const now = new Date().toISOString();
  const existing = await db.history_sheets.find(caseId);
  const sheetNo = `HS-${new Date().getFullYear()}-${String(existing.length + 1).padStart(3, "0")}`;
  const interval = Number(checkIntervalDays) || (category === "A" ? 7 : category === "B" ? 30 : 90);
  const hash = recordHash({ caseId, sheetNo, subjectName, category }, undefined, now);

  const sheet = await db.history_sheets.insertOne({
    _id: `hs-${caseId}-${Date.now()}`,
    case_id: caseId,
    sheetNo,
    subjectName,
    aliases: Array.isArray(aliases) ? aliases : [],
    dob,
    address,
    policeStation,
    district,
    category,
    moCodes: codes,
    previousCases: Array.isArray(previousCases) ? previousCases : [],
    associates: Array.isArray(associates) ? associates : [],
    village,
    beatNo,
    beatOfficer,
    villageRemarks,
    villageLastChecked: now.slice(0, 10),
    surveillanceLevel: surveillanceLevel || (category === "A" ? "CLOSE_WATCH" : category === "B" ? "PERIODICAL_CHECK" : "DISCREET_INQUIRY"),
    checkIntervalDays: interval,
    lastChecked: now.slice(0, 10),
    nextCheck: addDays(now, interval).slice(0, 10),
    openedBy: user.name,
    openedByRank: user.designation,
    openedAt: now,
    status: "ACTIVE",
    hash,
    created_at: now,
    updated_at: now,
  });

  await auditRecord(caseId, user, "HISTORY_SHEET_OPENED",
    `History sheet ${sheetNo} (Cat ${category}) opened on ${subjectName} by ${user.name}.`,
    "NODE", sheet._id, subjectName, { category, moCodes: codes }, req.ip);
  await autoLogDiary(caseId, user,
    `History sheet ${sheetNo} (Category ${category}) opened on ${subjectName}; MO: ${codes.join(", ")}. Village crime notebook entry for ${village} updated.`,
    "HISTORY_SHEET_OPENED");
  notifyCase(caseId, "HISTORY_SHEET_OPENED", "History Sheet Opened",
    `${user.name} opened history sheet ${sheetNo} on ${subjectName}.`, user);

  res.status(201).json({ success: true, sheet });
});

router.patch("/:caseId/history-sheets/:sheetId", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, sheetId } = req.params;
  const user = req.user!;
  const { status, villageRemarks, lastChecked } = req.body;
  const sheet = await db.history_sheets.findOne(sheetId);
  if (!sheet || sheet.case_id !== caseId) {
    res.status(404).json({ error: "History sheet not found." });
    return;
  }

  const now = new Date().toISOString();
  const updates: any = { updated_at: now };
  if (status) {
    if (!["ACTIVE", "CLOSED"].includes(status)) {
      res.status(400).json({ error: "Invalid status." });
      return;
    }
    if (status === "CLOSED" && !requireSP(user)) {
      res.status(403).json({ error: "Closing a history sheet requires SP rank or above." });
      return;
    }
    updates.status = status;
  }
  if (villageRemarks !== undefined) {
    updates.villageRemarks = villageRemarks;
    updates.villageLastChecked = (lastChecked || now).slice(0, 10);
    updates.lastChecked = (lastChecked || now).slice(0, 10);
    updates.nextCheck = addDays(lastChecked || now, sheet.checkIntervalDays || 30).slice(0, 10);
  }
  updates.hash = recordHash({ sheetId, status: updates.status || sheet.status }, sheet.hash, now);
  const updated = await db.history_sheets.updateOne(sheetId, updates);

  await auditRecord(caseId, user, "HISTORY_SHEET_UPDATED",
    `History sheet ${sheet.sheetNo} updated by ${user.name}.`, "NODE", sheetId, sheet.subjectName, undefined, req.ip);

  res.json({ success: true, sheet: updated });
});

// ---------------------------------------------------------------------------
// ARREST / BAIL / REMAND TRACKER (15 / 60 / 90-day limits)
// ---------------------------------------------------------------------------

router.get("/:caseId/custody", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const records = await db.custody.find(req.params.caseId);
  const enriched = records.map((r) => ({ ...r, computed: computeCustody(r as any) }));
  res.json({ records: enriched });
});

router.get("/:caseId/custody/alerts", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const records = await db.custody.find(req.params.caseId);
  const now = new Date().toISOString();
  const alerts: any[] = [];

  for (const r of records) {
    const c = computeCustody(r as any);
    if (r.status === "BAIL" || r.status === "DISCHARGED") continue;

    if (c.pcRemaining <= 0 && r.status === "POLICE_CUSTODY") {
      alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "CRITICAL", kind: "PC_EXHAUSTED", message: `${r.accusedName}: 15-day police custody exhausted — produce before Magistrate for judicial custody.` });
    } else if (c.pcRemaining <= 3 && r.status === "POLICE_CUSTODY") {
      alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "HIGH", kind: "PC_EXPIRY", message: `${r.accusedName}: police custody expires in ${c.pcRemaining} day(s).`, daysLeft: c.pcRemaining });
    }

    if (c.daysToRemandExpiry !== undefined && !c.grantedBail && r.status !== "BAIL") {
      if (c.daysToRemandExpiry < 0) {
        alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "CRITICAL", kind: "REMAND_EXPIRY", message: `${r.accusedName}: remand expired ${-c.daysToRemandExpiry} day(s) ago — seek extension or release on bail.`, dueDate: c.lastRemandExpiry, daysLeft: c.daysToRemandExpiry });
      } else if (c.daysToRemandExpiry <= 2) {
        alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "HIGH", kind: "REMAND_EXPIRY", message: `${r.accusedName}: remand expires in ${c.daysToRemandExpiry} day(s) — schedule production.`, dueDate: c.lastRemandExpiry, daysLeft: c.daysToRemandExpiry });
      }
    }

    if (!c.grantedBail) {
      if (c.daysToDue < 0) {
        alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "CRITICAL", kind: "DEFAULT_BAIL_OVERDUE", message: `${r.accusedName}: ${c.limitDays}-day period lapsed on ${c.dueDate.slice(0, 10)} without charge sheet — accused entitled to default bail u/s 167(2).`, dueDate: c.dueDate, daysLeft: c.daysToDue });
      } else if (c.daysToDue <= 7) {
        alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "HIGH", kind: "CHARGESHEET_DUE", message: `${r.accusedName}: charge sheet due in ${c.daysToDue} day(s) (${c.dueDate.slice(0, 10)}); default-bail clock running.`, dueDate: c.dueDate, daysLeft: c.daysToDue });
      } else if (c.daysToDue <= 15) {
        alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "MEDIUM", kind: "CHARGESHEET_DUE", message: `${r.accusedName}: charge sheet due in ${c.daysToDue} day(s) (${c.dueDate.slice(0, 10)}).`, dueDate: c.dueDate, daysLeft: c.daysToDue });
      }
    }

    const pendingBail = (r.bailApplications || []).filter((b: any) => b.status === "PENDING");
    for (const b of pendingBail) {
      const age = Math.floor((new Date(now).getTime() - new Date(b.filedDate).getTime()) / 86400000);
      if (age >= 3) {
        alerts.push({ recordId: r._id, accusedName: r.accusedName, severity: "MEDIUM", kind: "BAIL_PENDING", message: `${r.accusedName}: ${b.bailType.replace(/_/g, " ")} bail pending in ${b.court} for ${age} day(s).` });
      }
    }
  }

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 } as Record<string, number>;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  res.json({ alerts, generatedAt: now });
});

router.post("/:caseId/custody", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { accusedName, firNumber, sections, arrestDate, arrestMemoId, offencePunishmentYears } = req.body;

  if (!accusedName || !firNumber || !arrestDate) {
    res.status(400).json({ error: "accusedName, firNumber and arrestDate are required." });
    return;
  }
  const py = Number(offencePunishmentYears);
  if (!Number.isFinite(py) || py <= 0) {
    res.status(400).json({ error: "offencePunishmentYears must be a positive number (max punishment for the gravest section)." });
    return;
  }
  if (arrestMemoId) {
    const memo = await db.arrest_memos.findOne(arrestMemoId);
    if (!memo || memo.case_id !== caseId || memo.memoType === "SEIZURE") {
      res.status(400).json({ error: "arrestMemoId must reference an arrest memo of this case." });
      return;
    }
  }

  const now = new Date().toISOString();
  const dueDate = addDays(arrestDate, py >= 10 ? 90 : 60);
  const rec = await db.custody.insertOne({
    _id: `cust-${caseId}-${Date.now()}`,
    case_id: caseId,
    accusedName,
    firNumber,
    sections: Array.isArray(sections) ? sections : [],
    arrestDate,
    arrestMemoId,
    offencePunishmentYears: py,
    remands: [],
    bailApplications: [],
    status: "POLICE_CUSTODY",
    recordedBy: user.name,
    recordedByRank: user.designation,
    policeCustodyUsedDays: 0,
    chargeSheetDueDate: dueDate,
    hash: recordHash({ caseId, accusedName, arrestDate }, undefined, now),
    created_at: now,
    updated_at: now,
  });

  await auditRecord(caseId, user, "CUSTODY_REGISTERED",
    `Custody clock opened for ${accusedName} (arrested ${arrestDate}); ${py >= 10 ? 90 : 60}-day charge-sheet limit applies (due ${dueDate.slice(0, 10)}).`,
    "CASE", rec._id, accusedName, undefined, req.ip);
  await autoLogDiary(caseId, user,
    `Arrest of ${accusedName} recorded (FIR ${firNumber}, ${arrestDate}). Custody clock opened — charge sheet due by ${dueDate.slice(0, 10)} (${py >= 10 ? "90" : "60"}-day limit).`,
    "CUSTODY_REGISTERED");
  notifyCase(caseId, "CUSTODY_REGISTERED", "Arrest Recorded",
    `${user.name} opened custody record for ${accusedName}.`, user);

  res.status(201).json({ success: true, record: { ...rec, computed: computeCustody(rec as any) } });
});

router.post("/:caseId/custody/:recordId/remand", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, recordId } = req.params;
  const user = req.user!;
  const { orderDate, court, daysGranted, custodyType, producedViaVC, orderRef } = req.body;
  const rec = await db.custody.findOne(recordId);
  if (!rec || rec.case_id !== caseId) {
    res.status(404).json({ error: "Custody record not found." });
    return;
  }
  if (!orderDate || !court || !daysGranted || !["PC", "JC"].includes(custodyType)) {
    res.status(400).json({ error: "orderDate, court, daysGranted and custodyType (PC/JC) are required." });
    return;
  }
  const days = Number(daysGranted);
  if (!Number.isInteger(days) || days <= 0 || days > 15) {
    res.status(400).json({ error: "daysGranted must be 1–15 per remand order." });
    return;
  }
  const c = computeCustody(rec as any);
  if (custodyType === "PC" && c.pcUsed + days > PC_LIMIT_DAYS) {
    res.status(400).json({
      error: `Police custody ceiling is ${PC_LIMIT_DAYS} days in total (Sec 167). Already used: ${c.pcUsed}. Requested: ${days}.`,
    });
    return;
  }

  const now = new Date().toISOString();
  const order = {
    id: `rem-${Date.now()}`,
    orderDate,
    court,
    daysGranted: days,
    custodyType,
    producedViaVC: !!producedViaVC,
    orderRef,
    recordedBy: user.name,
    recordedAt: now,
  };
  const remands = [...rec.remands, order];
  const pcUsed = remands.filter((r: any) => r.custodyType === "PC").reduce((s: number, r: any) => s + r.daysGranted, 0);
  const updated = await db.custody.updateOne(recordId, {
    remands,
    policeCustodyUsedDays: pcUsed,
    status: custodyType === "PC" ? "POLICE_CUSTODY" : "JUDICIAL_CUSTODY",
    hash: recordHash({ recordId, order }, rec.hash, now),
    updated_at: now,
  });

  await auditRecord(caseId, user, "REMAND_EXTENDED",
    `${days}-day ${custodyType} remand for ${rec.accusedName} ordered by ${court} (w.e.f. ${orderDate}).`,
    "CASE", recordId, rec.accusedName, { custodyType, days }, req.ip);
  await autoLogDiary(caseId, user,
    `Remand: ${rec.accusedName} remanded to ${custodyType} for ${days} day(s) by ${court} (order ${orderRef || "oral order recorded"}). PC used: ${pcUsed}/${PC_LIMIT_DAYS} days.`,
    "REMAND_EXTENDED");
  notifyCase(caseId, "REMAND_EXTENDED", "Remand Extended",
    `${user.name} recorded ${days}-day ${custodyType} remand for ${rec.accusedName}.`, user);

  res.status(201).json({ success: true, record: { ...updated!, computed: computeCustody(updated as any) } });
});

router.post("/:caseId/custody/:recordId/bail", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, recordId } = req.params;
  const user = req.user!;
  const { bailType, filedDate, court, status, decidedDate, conditions, suretyAmount } = req.body;
  const rec = await db.custody.findOne(recordId);
  if (!rec || rec.case_id !== caseId) {
    res.status(404).json({ error: "Custody record not found." });
    return;
  }
  const now = new Date().toISOString();
  const existing = (rec.bailApplications || []).find((b: any) => b.id === req.body.applicationId);

  if (existing) {
    if (!["GRANTED", "REJECTED", "WITHDRAWN"].includes(status)) {
      res.status(400).json({ error: "Decision status must be GRANTED, REJECTED or WITHDRAWN." });
      return;
    }
    // Recording a court order is clerical — any case member may record it,
    // but GRANTED decisions must carry the deciding court and date.
    if (status === "GRANTED" && (!decidedDate || !court)) {
      res.status(400).json({ error: "decidedDate and court are required to record a granted bail order." });
      return;
    }
    const bailApplications = rec.bailApplications.map((b: any) =>
      b.id === existing.id
        ? { ...b, status, decidedDate: decidedDate || now, conditions, suretyAmount, decidedBy: user.name }
        : b
    );
    const updates: any = {
      bailApplications,
      hash: recordHash({ recordId, decision: status }, rec.hash, now),
      updated_at: now,
    };
    if (status === "GRANTED") updates.status = "BAIL";
    const updated = await db.custody.updateOne(recordId, updates);
    await auditRecord(caseId, user, "BAIL_DECISION",
      `${existing.bailType.replace(/_/g, " ")} bail for ${rec.accusedName}: ${status} by ${court || existing.court}.`,
      "CASE", recordId, rec.accusedName, { status }, req.ip);
    await autoLogDiary(caseId, user,
      `Bail decision: ${existing.bailType.replace(/_/g, " ")} application of ${rec.accusedName} ${status} (${court || existing.court}).${conditions ? ` Conditions: ${conditions}` : ""}`,
      "BAIL_DECISION");
    notifyCase(caseId, "BAIL_DECISION", "Bail Decided",
      `${user.name} recorded ${status} on ${rec.accusedName}'s bail plea.`, user);
    res.json({ success: true, record: { ...updated!, computed: computeCustody(updated as any) } });
    return;
  }

  if (!["REGULAR_437", "ANTICIPATORY_438", "SESSIONS_439", "DEFAULT_167_2"].includes(bailType)) {
    res.status(400).json({ error: "bailType must be REGULAR_437, ANTICIPATORY_438, SESSIONS_439 or DEFAULT_167_2." });
    return;
  }
  if (!filedDate || !court) {
    res.status(400).json({ error: "filedDate and court are required to file a bail application." });
    return;
  }
  const app = {
    id: `bail-${Date.now()}`,
    bailType,
    filedDate,
    court,
    status: "PENDING" as const,
    decidedBy: undefined,
  };
  const bailApplications = [...(rec.bailApplications || []), app];
  const updated = await db.custody.updateOne(recordId, {
    bailApplications,
    hash: recordHash({ recordId, bailFiled: bailType }, rec.hash, now),
    updated_at: now,
  });
  await auditRecord(caseId, user, "BAIL_FILED",
    `${bailType.replace(/_/g, " ")} bail filed for ${rec.accusedName} in ${court}.`,
    "CASE", recordId, rec.accusedName, { bailType }, req.ip);
  await autoLogDiary(caseId, user,
    `Bail application (${bailType.replace(/_/g, " ")}) filed for ${rec.accusedName} in ${court}.`,
    "BAIL_FILED");
  notifyCase(caseId, "BAIL_FILED", "Bail Filed",
    `${user.name} filed ${bailType.replace(/_/g, " ")} bail for ${rec.accusedName}.`, user);
  res.status(201).json({ success: true, record: { ...updated!, computed: computeCustody(updated as any) } });
});

router.patch("/:caseId/custody/:recordId/status", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, recordId } = req.params;
  const user = req.user!;
  const { status } = req.body;
  const rec = await db.custody.findOne(recordId);
  if (!rec || rec.case_id !== caseId) {
    res.status(404).json({ error: "Custody record not found." });
    return;
  }
  if (!["POLICE_CUSTODY", "JUDICIAL_CUSTODY", "BAIL", "ABSCONDING", "DISCHARGED", "CONVICTED"].includes(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }
  const now = new Date().toISOString();
  const updated = await db.custody.updateOne(recordId, {
    status,
    hash: recordHash({ recordId, status }, rec.hash, now),
    updated_at: now,
  });
  await auditRecord(caseId, user, "CUSTODY_STATUS_CHANGED",
    `Custody status of ${rec.accusedName} changed to ${status} by ${user.name}.`,
    "CASE", recordId, rec.accusedName, { status }, req.ip);
  res.json({ success: true, record: { ...updated!, computed: computeCustody(updated as any) } });
});

// ---------------------------------------------------------------------------
// CHARGE SHEET BUILDER (Sec 173 CrPC / Sec 193 BNSS)
// ---------------------------------------------------------------------------

router.get("/:caseId/charge-sheets", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const sheets = await db.charge_sheets.find(req.params.caseId);
  res.json({ chargeSheets: sheets });
});

/** SAHAYAK-assisted draft: assembles a Sec 173 charge sheet from live case state. */
router.post("/:caseId/charge-sheets/draft", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { firNumber, policeStation, district, state, sections, assist } = req.body;

  const caseObj = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }
  const firs = await db.firs.find(caseId);
  const entities = await db.entities.find({ case_id: caseId });
  const evidence = await db.evidence.find({ case_id: caseId });
  const custody = await db.custody.find(caseId);

  const accusedEntities = entities.filter((e: any) => e.type === "PERSON" && e.reviewState === "CONFIRMED");
  const committedExhibits = evidence.filter((e: any) => e.status === "COMMITTED");
  const primaryFir = firs.find((f: any) => !firNumber || f.firNumber === firNumber || f.id === firNumber) || firs[0];

  const accused = accusedEntities.slice(0, 12).map((e: any) => ({
    name: e.label,
    address: e.details?.address || "",
    custodyStatus: (custody.find((c: any) => c.accusedName === e.label)?.status) || "NOT_ARRESTED",
    chargeFramed: e.role || "",
  }));
  const witnesses = accusedEntities.slice(0, 8).map((e: any, i: number) => ({
    name: e.label,
    type: "PROSECUTION",
    address: e.details?.address || "",
    statement: `PW-${i + 1}: statement corroborates ${e.role || "the prosecution case"} as per exhibit trail.`,
  }));
  const exhibits = committedExhibits.map((e: any) => e._id);

  const firText = primaryFir
    ? `FIR ${primaryFir.firNumber} dated ${primaryFir.date} registered at ${primaryFir.policeStation} u/s ${(primaryFir.sections || []).join(", ")}. Complainant: ${primaryFir.complainant}. Brief: ${primaryFir.briefNarrative}`
    : "FIR particulars as per case file.";
  const factsOfCase = [
    `1. ${firText}`,
    `2. Investigation revealed an organised network of ${accusedEntities.length} confirmed person(s). ${accused.map((a: any) => `${a.name} (${a.custodyStatus.replace(/_/g, " ").toLowerCase()})`).join("; ") || "Accused particulars under verification"}.`,
    `3. ${committedExhibits.length} exhibit(s) committed to the case graph, comprising ${committedExhibits.map((e: any) => `${e.file_name} [${e.file_type}]`).join("; ") || "documentary and digital exhibits"}.`,
    `4. Custody record: ${custody.length > 0 ? custody.map((c: any) => `${c.accusedName} — ${c.status.replace(/_/g, " ")} since ${c.arrestDate}`).join("; ") : "no arrests recorded yet"}.`,
    `5. The evidence collected establishes a prima facie case u/s ${(sections && sections.length > 0 ? sections : primaryFir?.sections || []).join(", ") || "as charged"}. Sanction, where required, is being obtained separately.`,
  ].join("\n");
  const evidenceSummary = committedExhibits.length > 0
    ? committedExhibits.map((e: any, i: number) => `Ex.${i + 1} ${e.file_name} (${e.file_type}, ${e.file_size_formatted || "size as per seizure memo"}, SHA-256 ${String(e.file_hash || "").slice(0, 24)}…) — ${e.summary || "exhibit on record"}`).join("\n")
    : "Documentary and digital evidence as per annexures; hashes verified u/s 65B BSA where applicable.";

  // Phase 3 — optional LLM polish + corpus legal opinion over the template draft
  let factsFinal = factsOfCase;
  let legalOpinion = "";
  let assistMeta: any = undefined;
  if (assist === "llm") {
    try {
      const assistOut = await sahayakChargeAssist({
        sections: Array.isArray(sections) && sections.length > 0 ? sections : primaryFir?.sections || [],
        accusedCount: accused.length,
        exhibitCount: exhibits.length,
        factsDraft: factsOfCase,
        evidenceDraft: evidenceSummary,
      });
      if (assistOut.polishedFacts) factsFinal = assistOut.polishedFacts;
      legalOpinion = assistOut.legalOpinion;
      assistMeta = { provider: assistOut.provider, llmUsed: assistOut.llmUsed, citations: assistOut.citations };
    } catch (err) {
      console.error("[CHARGESHEET] SAHAYAK assist failed, using template draft:", err);
    }
  }

  const now = new Date().toISOString();
  const existing = await db.charge_sheets.find(caseId);
  const csNo = `CS-${new Date().getFullYear()}-${String(existing.length + 1).padStart(3, "0")}`;

  const draft = await db.charge_sheets.insertOne({
    _id: `cs-${caseId}-${Date.now()}`,
    case_id: caseId,
    csNo,
    firNumber: firNumber || primaryFir?.firNumber || "",
    policeStation: policeStation || primaryFir?.policeStation || "",
    district: district || primaryFir?.district || "",
    state: state || primaryFir?.state || "",
    sections: Array.isArray(sections) && sections.length > 0 ? sections : primaryFir?.sections || [],
    accused,
    witnesses,
    exhibits,
    factsOfCase: factsFinal,
    evidenceSummary,
    legalOpinion,
    assistMeta,
    annexures: [],
    ioName: user.name,
    ioRank: user.designation,
    draftSource: "SAHAYAK_ASSIST",
    status: "DRAFT",
    hash: recordHash({ caseId, csNo, accused: accused.length, exhibits: exhibits.length }, undefined, now),
    created_at: now,
    updated_at: now,
  });

  await auditRecord(caseId, user, "CHARGESHEET_DRAFTED",
    `SAHAYAK-assisted Sec 173 draft ${csNo} generated from live case state (${accused.length} accused, ${exhibits.length} exhibits)${assistMeta ? ` [${assistMeta.llmUsed ? assistMeta.provider : "corpus/template"}]` : ""}.`,
    "DOSSIER", draft._id, csNo, { draftSource: "SAHAYAK_ASSIST", assistMeta }, req.ip);
  notifyCase(caseId, "CHARGESHEET_DRAFTED", "Charge Sheet Drafted",
    `${user.name} generated SAHAYAK-assisted draft ${csNo}.`, user);

  res.status(201).json({ success: true, chargeSheet: draft });
});

router.post("/:caseId/charge-sheets", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const {
    firNumber, policeStation, district, state, sections,
    accused, witnesses, exhibits, factsOfCase, evidenceSummary, legalOpinion,
  } = req.body;

  if (!firNumber || !policeStation) {
    res.status(400).json({ error: "firNumber and policeStation are required." });
    return;
  }
  if (!factsOfCase || String(factsOfCase).trim().length < 50) {
    res.status(400).json({ error: "factsOfCase narrative is required (minimum 50 characters)." });
    return;
  }

  const now = new Date().toISOString();
  const existing = await db.charge_sheets.find(caseId);
  const csNo = `CS-${new Date().getFullYear()}-${String(existing.length + 1).padStart(3, "0")}`;
  const cs = await db.charge_sheets.insertOne({
    _id: `cs-${caseId}-${Date.now()}`,
    case_id: caseId,
    csNo,
    firNumber,
    policeStation,
    district: district || "",
    state: state || "",
    sections: Array.isArray(sections) ? sections : [],
    accused: Array.isArray(accused) ? accused : [],
    witnesses: Array.isArray(witnesses) ? witnesses : [],
    exhibits: Array.isArray(exhibits) ? exhibits : [],
    factsOfCase,
    evidenceSummary: evidenceSummary || "",
    legalOpinion: legalOpinion || "",
    annexures: [],
    ioName: user.name,
    ioRank: user.designation,
    draftSource: "MANUAL",
    status: "DRAFT",
    hash: recordHash({ caseId, csNo }, undefined, now),
    created_at: now,
    updated_at: now,
  });

  await auditRecord(caseId, user, "CHARGESHEET_CREATED",
    `Sec 173 charge sheet ${csNo} opened manually by ${user.name} (FIR ${firNumber}).`,
    "DOSSIER", cs._id, csNo, { draftSource: "MANUAL" }, req.ip);
  notifyCase(caseId, "CHARGESHEET_CREATED", "Charge Sheet Opened",
    `${user.name} opened charge sheet ${csNo}.`, user);

  res.status(201).json({ success: true, chargeSheet: cs });
});

router.patch("/:caseId/charge-sheets/:csId", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, csId } = req.params;
  const user = req.user!;
  const cs = await db.charge_sheets.findOne(csId);
  if (!cs || cs.case_id !== caseId) {
    res.status(404).json({ error: "Charge sheet not found." });
    return;
  }

  const now = new Date().toISOString();
  const updates: any = { updated_at: now };
  const editable = ["firNumber", "policeStation", "district", "state", "sections", "accused", "witnesses", "exhibits", "factsOfCase", "evidenceSummary", "legalOpinion", "forwardingOfficer"];
  for (const key of editable) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (req.body.status) {
    const order = ["DRAFT", "IO_SIGNED", "SP_APPROVED", "FILED"];
    const next = req.body.status;
    if (!order.includes(next)) {
      res.status(400).json({ error: "Invalid status." });
      return;
    }
    if (order.indexOf(next) < order.indexOf(cs.status)) {
      res.status(400).json({ error: `Charge sheet cannot regress from ${cs.status} to ${next}.` });
      return;
    }
    if (next === "IO_SIGNED" && cs.ioName !== user.name && !SP_ELIGIBLE_ROLES.includes(user.role)) {
      res.status(403).json({ error: "Only the drafting IO (or Lead IO / Admin) may sign the charge sheet." });
      return;
    }
    if ((next === "SP_APPROVED" || next === "FILED") && !requireSP(user)) {
      res.status(403).json({ error: "Approval and court filing require SP rank or above." });
      return;
    }
    if (next === "FILED") {
      if (!req.body.filedInCourt || !req.body.filingDate) {
        res.status(400).json({ error: "filedInCourt and filingDate are required to file in court." });
        return;
      }
      updates.filedInCourt = req.body.filedInCourt;
      updates.filingDate = req.body.filingDate;
      updates.cnrNumber = req.body.cnrNumber;
      updates.forwardingOfficer = updates.forwardingOfficer || cs.forwardingOfficer || user.name;
    }
    updates.status = next;
  }

  updates.hash = recordHash({ csId, status: updates.status || cs.status }, cs.hash, now);
  const updated = await db.charge_sheets.updateOne(csId, updates);

  await auditRecord(caseId, user, "CHARGESHEET_UPDATED",
    `Charge sheet ${cs.csNo} updated by ${user.name}${updates.status ? ` (status → ${updates.status})` : ""}.`,
    "DOSSIER", csId, cs.csNo, { status: updates.status }, req.ip);
  if (updates.status === "FILED") {
    await autoLogDiary(caseId, user,
      `Charge sheet ${cs.csNo} filed in ${updates.filedInCourt} on ${updates.filingDate}${updates.cnrNumber ? ` (CNR ${updates.cnrNumber})` : ""}.`,
      "CHARGESHEET_FILED");
  }
  notifyCase(caseId, "CHARGESHEET_UPDATED", "Charge Sheet Updated",
    `${user.name} updated charge sheet ${cs.csNo}.`, user);

  res.json({ success: true, chargeSheet: updated });
});

router.post("/:caseId/charge-sheets/:csId/annexures", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, csId } = req.params;
  const user = req.user!;
  const cs = await db.charge_sheets.findOne(csId);
  if (!cs || cs.case_id !== caseId) {
    res.status(404).json({ error: "Charge sheet not found." });
    return;
  }
  if (cs.status === "FILED") {
    res.status(400).json({ error: "Filed charge sheets are frozen; annexures cannot be added." });
    return;
  }
  const { title, docType, pages, hash, exhibitRef } = req.body;
  if (!title || !docType) {
    res.status(400).json({ error: "title and docType are required." });
    return;
  }
  if ((cs.annexures || []).length >= 26) {
    res.status(400).json({ error: "Annexure manager supports A–Z (26 annexures). Consolidate documents to add more." });
    return;
  }

  const now = new Date().toISOString();
  const letter = String.fromCharCode(65 + (cs.annexures || []).length);
  const annex = {
    id: `anx-${Date.now()}`,
    letter,
    title,
    docType,
    pages,
    hash,
    exhibitRef,
    filedBy: user.name,
    filedAt: now,
  };
  const annexures = [...(cs.annexures || []), annex];
  const updated = await db.charge_sheets.updateOne(csId, {
    annexures,
    hash: recordHash({ csId, annexure: letter }, cs.hash, now),
    updated_at: now,
  });

  await auditRecord(caseId, user, "ANNEXURE_FILED",
    `Annexure ${letter} (${title}) attached to charge sheet ${cs.csNo} by ${user.name}.`,
    "DOSSIER", csId, `Annexure ${letter}`, undefined, req.ip);

  res.status(201).json({ success: true, annexure: annex, chargeSheet: updated });
});

router.delete("/:caseId/charge-sheets/:csId/annexures/:annexId", requireCaseMembership, requireEditAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, csId, annexId } = req.params;
  const user = req.user!;
  const cs = await db.charge_sheets.findOne(csId);
  if (!cs || cs.case_id !== caseId) {
    res.status(404).json({ error: "Charge sheet not found." });
    return;
  }
  if (cs.status === "FILED") {
    res.status(400).json({ error: "Filed charge sheets are frozen." });
    return;
  }
  const remaining = (cs.annexures || []).filter((a: any) => a.id !== annexId);
  if (remaining.length === (cs.annexures || []).length) {
    res.status(404).json({ error: "Annexure not found." });
    return;
  }
  // Re-letter to keep the A–Z sequence tight
  const relettered = remaining.map((a: any, i: number) => ({ ...a, letter: String.fromCharCode(65 + i) }));
  const now = new Date().toISOString();
  const updated = await db.charge_sheets.updateOne(csId, {
    annexures: relettered,
    hash: recordHash({ csId, annexureRemoved: annexId }, cs.hash, now),
    updated_at: now,
  });
  await auditRecord(caseId, user, "ANNEXURE_REMOVED",
    `Annexure removed from charge sheet ${cs.csNo} by ${user.name}; sequence re-lettered.`,
    "DOSSIER", csId, cs.csNo, undefined, req.ip);
  res.json({ success: true, chargeSheet: updated });
});

export default router;
