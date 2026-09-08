import { Router, Response } from "express";
import { db } from "../db";
import { authenticateToken, requireCaseMembership, requireEditAccess, requireFunctional, AuthenticatedRequest } from "../auth";
import { validateImei, validateNcrpAck } from "../../src/services/imei";
import { NCRP_CATEGORIES, CERT_REPORT_HOURS } from "../../src/data/cyberMasters";
import { sha256, recordHash, autoLogDiary, auditRecord, notifyCase } from "../services/diaryService";

const router = Router();
router.use(authenticateToken);

const KINDS = ["NCRP_REFERRAL", "CERT_INCIDENT", "SEC69_INTERCEPT", "CRYPTO_TRAIL", "IMEI_CEIR"] as const;

const FLOWS: Record<string, string[]> = {
  NCRP_REFERRAL: ["DRAFT", "PUSHED", "ACKNOWLEDGED", "CLOSED"],
  CERT_INCIDENT: ["OPEN", "REPORTED", "MITIGATING", "CLOSED"],
  SEC69_INTERCEPT: ["DRAFT", "ORDERED", "ACTIVE", "EXPIRED", "REVOKED"],
  IMEI_CEIR: ["DRAFT", "SUBMITTED", "BLOCKED", "UNBLOCKED"],
  CRYPTO_TRAIL: ["COMPUTED", "SHARED", "CLOSED"],
};

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}
function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

async function nextRefNo(caseId: string, kind: string): Promise<string> {
  const existing = await db.cyber_incidents.find(caseId, kind);
  const short = kind === "NCRP_REFERRAL" ? "NCRP" : kind === "CERT_INCIDENT" ? "CERT" : kind === "SEC69_INTERCEPT" ? "S69" : kind === "IMEI_CEIR" ? "CEIR" : "TRAIL";
  return `CYB-${new Date().getFullYear()}-${short}-${String(existing.length + 1).padStart(3, "0")}`;
}

router.get("/:caseId/cyber", requireCaseMembership, requireFunctional(["ADMIN", "CYBER"]), async (req: AuthenticatedRequest, res: Response) => {
  const incidents = await db.cyber_incidents.find(req.params.caseId, req.query.kind as string);
  res.json({ incidents });
});

router.post("/:caseId/cyber", requireCaseMembership, requireEditAccess, requireFunctional(["ADMIN", "CYBER"]), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { kind, title, description } = req.body;

  if (!KINDS.includes(kind)) {
    res.status(400).json({ error: `kind must be one of: ${KINDS.join(", ")}.` });
    return;
  }
  if (kind === "CRYPTO_TRAIL") {
    res.status(400).json({ error: "Crypto trails are computed via POST /cyber/trace." });
    return;
  }
  if (!title || String(title).trim().length < 5 || !description || String(description).trim().length < 10) {
    res.status(400).json({ error: "title (min 5) and description (min 10) are required." });
    return;
  }

  const now = new Date().toISOString();
  const base: any = {
    _id: `cyb-${caseId}-${Date.now()}`,
    case_id: caseId,
    refNo: await nextRefNo(caseId, kind),
    kind,
    title: String(title).trim(),
    description: String(description).trim(),
    recordedBy: user.name,
    recordedByRank: user.designation,
    created_at: now,
    updated_at: now,
  };

  if (kind === "NCRP_REFERRAL") {
    const { ncrpCategory, amountInvolved, ncrpAck } = req.body;
    if (!NCRP_CATEGORIES.includes(ncrpCategory)) {
      res.status(400).json({ error: `ncrpCategory must be one of the ${NCRP_CATEGORIES.length} NCRP categories.` });
      return;
    }
    if (ncrpAck) {
      const v = validateNcrpAck(String(ncrpAck));
      if (!v.ok) {
        res.status(400).json({ error: v.reason });
        return;
      }
    }
    Object.assign(base, {
      ncrpCategory,
      amountInvolved: amountInvolved !== undefined ? Number(amountInvolved) : undefined,
      ncrpAck: ncrpAck ? String(ncrpAck).replace(/[\s-]/g, "") : undefined,
      status: "DRAFT",
    });
  } else if (kind === "CERT_INCIDENT") {
    const { severity, detectedAt, affectedSystems, iocs, contactName, contactPhone } = req.body;
    if (!["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(severity)) {
      res.status(400).json({ error: "severity must be CRITICAL, HIGH, MEDIUM or LOW." });
      return;
    }
    if (!detectedAt || isNaN(new Date(detectedAt).getTime())) {
      res.status(400).json({ error: "detectedAt (ISO) is required — the 6-hour clock starts there." });
      return;
    }
    Object.assign(base, {
      severity,
      detectedAt,
      reportDueAt: addHours(detectedAt, CERT_REPORT_HOURS),
      affectedSystems,
      iocs: Array.isArray(iocs) ? iocs.map(String) : [],
      contactName,
      contactPhone,
      status: "OPEN",
    });
  } else if (kind === "SEC69_INTERCEPT") {
    const { orderNo, issuingAuthority, targetIdentifier, serviceProvider, periodDays } = req.body;
    if (!orderNo || !issuingAuthority || !targetIdentifier || !serviceProvider) {
      res.status(400).json({ error: "orderNo, issuingAuthority, targetIdentifier and serviceProvider are required (Sec 69 + 2009 Rules)." });
      return;
    }
    const days = Number(periodDays);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      res.status(400).json({ error: "periodDays must be 1–60 per interception order." });
      return;
    }
    Object.assign(base, {
      orderNo, issuingAuthority, targetIdentifier, serviceProvider, periodDays: days,
      reviewDueAt: addDays(now, 30),
      status: "DRAFT",
    });
  } else if (kind === "IMEI_CEIR") {
    const { imei, ceirAction, ownerName, firRef } = req.body;
    const v = validateImei(String(imei || ""));
    if (!v.ok) {
      res.status(400).json({ error: v.reason });
      return;
    }
    if (!["BLOCK", "UNBLOCK", "TRACK"].includes(ceirAction)) {
      res.status(400).json({ error: "ceirAction must be BLOCK, UNBLOCK or TRACK." });
      return;
    }
    Object.assign(base, {
      imei: String(imei).replace(/[\s-]/g, ""),
      ceirAction, ownerName, firRef,
      status: "DRAFT",
    });
  }

  base.hash = recordHash({ caseId, ref: base.refNo, kind }, undefined, now);
  const incident = await db.cyber_incidents.insertOne(base);

  await auditRecord(caseId, user, "CYBER_INCIDENT_RECORDED",
    `${kind} ${base.refNo} recorded by ${user.name}: ${base.title}.`,
    "EXHIBIT", incident._id, base.refNo, { kind }, req.ip);
  await autoLogDiary(caseId, user, `Cyber cell: ${kind} ${base.refNo} opened — ${base.title}.`, "CYBER_RECORDED");
  notifyCase(caseId, "CYBER_UPDATED", "Cyber Record Opened",
    `${user.name} opened ${kind} ${base.refNo}.`, user);

  res.status(201).json({ success: true, incident });
});

router.patch("/:caseId/cyber/:incidentId", requireCaseMembership, requireEditAccess, requireFunctional(["ADMIN", "CYBER"]), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId, incidentId } = req.params;
  const user = req.user!;
  const { status, ncrpAck, reviewNote } = req.body;
  const incident = await db.cyber_incidents.findOne(incidentId);
  if (!incident || incident.case_id !== caseId) {
    res.status(404).json({ error: "Cyber record not found." });
    return;
  }
  const flow = FLOWS[incident.kind] || [];
  if (!flow.includes(status)) {
    res.status(400).json({ error: `Invalid status for ${incident.kind}. Allowed: ${flow.join(" → ")}.` });
    return;
  }
  const fromIdx = flow.indexOf(incident.status);
  const toIdx = flow.indexOf(status);
  const terminalBacktrack = incident.kind === "IMEI_CEIR" && incident.status === "BLOCKED" && status === "UNBLOCKED";
  if (toIdx < fromIdx && !terminalBacktrack) {
    res.status(400).json({ error: `Status cannot regress from ${incident.status} to ${status}.` });
    return;
  }

  const now = new Date().toISOString();
  const updates: any = { status, updated_at: now };
  if (status === "ACKNOWLEDGED" && incident.kind === "NCRP_REFERRAL") {
    const ack = ncrpAck || incident.ncrpAck;
    const v = validateNcrpAck(String(ack || ""));
    if (!v.ok) {
      res.status(400).json({ error: `Acknowledgement requires a valid NCRP number: ${v.reason}` });
      return;
    }
    updates.ncrpAck = String(ack).replace(/[\s-]/g, "");
  }
  if (ncrpAck && incident.kind === "NCRP_REFERRAL" && status !== "ACKNOWLEDGED") {
    const v = validateNcrpAck(String(ncrpAck));
    if (!v.ok) {
      res.status(400).json({ error: v.reason });
      return;
    }
    updates.ncrpAck = String(ncrpAck).replace(/[\s-]/g, "");
  }
  if (incident.kind === "CERT_INCIDENT" && status === "REPORTED" && !incident.reportedAt) {
    updates.reportedAt = now;
  }
  updates.hash = recordHash({ incidentId, status }, incident.hash, now);
  const updated = await db.cyber_incidents.updateOne(incidentId, updates);

  await auditRecord(caseId, user, "CYBER_STATUS_CHANGED",
    `${incident.kind} ${incident.refNo}: ${incident.status} → ${status} by ${user.name}.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
    "EXHIBIT", incidentId, incident.refNo, { status }, req.ip);
  notifyCase(caseId, "CYBER_UPDATED", "Cyber Record Updated",
    `${user.name} moved ${incident.refNo} to ${status}.`, user);

  res.json({ success: true, incident: updated });
});

// Crypto / fund trail tracer: BFS over FUNDS_TRANSFER edges from a start label
router.post("/:caseId/cyber/trace", requireCaseMembership, requireEditAccess, requireFunctional(["ADMIN", "CYBER"]), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { startLabel, direction, maxHops } = req.body;

  if (!startLabel || typeof startLabel !== "string") {
    res.status(400).json({ error: "startLabel (account/VPA/address) is required." });
    return;
  }
  if (!["IN", "OUT", "BOTH"].includes(direction)) {
    res.status(400).json({ error: "direction must be IN, OUT or BOTH." });
    return;
  }
  const hops = Math.min(5, Math.max(1, Number(maxHops) || 3));

  const relationships = await db.relationships.find({ case_id: caseId });
  const edges = relationships.filter((r) => r.relationType === "FUNDS_TRANSFER");
  // Resolve entity ids → labels for readable trails
  const entities = await db.entities.find({ case_id: caseId });
  const idToLabel = new Map(entities.map((e) => [e.id, e.label]));
  const name = (id: string) => idToLabel.get(id) || id;

  const start = startLabel.toLowerCase().trim();
  const matchId = (label: string) => label.toLowerCase().includes(start) || start.includes(label.toLowerCase());

  const seedIds = entities.filter((e) => e.type === "FINANCIAL" && matchId(e.label)).map((e) => e.id);
  if (seedIds.length === 0) {
    res.status(404).json({ error: `No financial entity matches "${startLabel}" on the main graph. Approve it from staging first.` });
    return;
  }

  const visited = new Set<string>(seedIds);
  const trail: any[] = [];
  let frontier = seedIds.map((id) => ({ id, hop: 0 }));
  let totalIn = 0;
  let totalOut = 0;

  while (frontier.length > 0) {
    const next: Array<{ id: string; hop: number }> = [];
    for (const cur of frontier) {
      if (cur.hop >= hops) continue;
      for (const e of edges) {
        const out = direction !== "IN" && e.source === cur.id && !visited.has(e.target);
        const inn = direction !== "OUT" && e.target === cur.id && !visited.has(e.source);
        if (!out && !inn) continue;
        const other = out ? e.target : e.source;
        visited.add(other);
        next.push({ id: other, hop: cur.hop + 1 });
        const amt = Number(e.amount) || 0;
        if (out) totalOut += amt;
        else totalIn += amt;
        trail.push({
          hop: cur.hop + 1,
          fromLabel: out ? name(cur.id) : name(other),
          toLabel: out ? name(other) : name(cur.id),
          amount: e.amount,
          frequency: e.frequency,
          details: e.details,
        });
      }
    }
    frontier = next;
  }

  const now = new Date().toISOString();
  const trailResult = {
    startLabel,
    direction,
    maxHops: hops,
    hops: trail,
    nodesVisited: visited.size,
    totalIn,
    totalOut,
    computedAt: now,
  };
  const incident = await db.cyber_incidents.insertOne({
    _id: `cyb-${caseId}-${Date.now()}`,
    case_id: caseId,
    refNo: await nextRefNo(caseId, "CRYPTO_TRAIL"),
    kind: "CRYPTO_TRAIL",
    title: `Fund trail from ${startLabel} (${direction}, ≤${hops} hops)`,
    description: `Traced ${trail.length} transfers across ${visited.size} accounts. In: ₹${totalIn.toLocaleString("en-IN")}; Out: ₹${totalOut.toLocaleString("en-IN")}.`,
    trailResult,
    status: "COMPUTED",
    recordedBy: user.name,
    recordedByRank: user.designation,
    hash: recordHash({ caseId, startLabel, direction }, undefined, now),
    created_at: now,
    updated_at: now,
  });

  await auditRecord(caseId, user, "CRYPTO_TRAIL_COMPUTED",
    `${user.name} traced ${trail.length} transfers from "${startLabel}" (${visited.size} accounts).`,
    "EXHIBIT", incident._id, incident.refNo, { hops: trail.length }, req.ip);
  await autoLogDiary(caseId, user,
    `Crypto/fund trail ${incident.refNo}: ${trail.length} transfers across ${visited.size} accounts from "${startLabel}".`,
    "CRYPTO_TRAIL");
  notifyCase(caseId, "CYBER_UPDATED", "Trail Computed",
    `${user.name} computed fund trail ${incident.refNo}.`, user);

  res.status(201).json({ success: true, incident, trail: trailResult });
});

// Cyber clocks: CERT-In 6-hour breaches, Sec 69 expiries, stale CEIR submissions
// Burner Swap Correlator (Changes.md Cyber portal): shared IMEI hardware
// running multiple MSISDN lines, including cross-state tower footprints.
router.get("/:caseId/cyber/correlate", requireCaseMembership, requireFunctional(["ADMIN", "CYBER"]), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const rows = await db.cdrs.find(caseId);
  const byImei = new Map<string, { msisdns: Set<string>; towers: Set<string>; rows: number; first: string; last: string }>();
  for (const r of rows as any[]) {
    for (const imei of [r.imeiA, r.imeiB].filter(Boolean)) {
      const key = String(imei);
      if (!byImei.has(key)) byImei.set(key, { msisdns: new Set(), towers: new Set(), rows: 0, first: r.timestamp, last: r.timestamp });
      const g = byImei.get(key)!;
      if (r.aParty) g.msisdns.add(String(r.aParty));
      if (r.bParty) g.msisdns.add(String(r.bParty));
      if (r.towerLocation) g.towers.add(String(r.towerLocation));
      g.rows += 1;
      if (r.timestamp && r.timestamp < g.first) g.first = r.timestamp;
      if (r.timestamp && r.timestamp > g.last) g.last = r.timestamp;
    }
  }
  const clusters = [...byImei.entries()]
    .map(([imei, g]) => ({
      imei,
      msisdnCount: g.msisdns.size,
      msisdns: [...g.msisdns],
      towers: [...g.towers],
      rows: g.rows,
      firstSeen: g.first,
      lastSeen: g.last,
      burner: g.msisdns.size >= 2,
    }))
    .sort((a, b) => b.msisdnCount - a.msisdnCount);
  res.json({ clusters, burnerCount: clusters.filter((c) => c.burner).length });
});

router.get("/:caseId/cyber/alerts", requireCaseMembership, requireFunctional(["ADMIN", "CYBER"]), async (req: AuthenticatedRequest, res: Response) => {
  const incidents = await db.cyber_incidents.find(req.params.caseId);
  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const alerts: any[] = [];

  for (const i of incidents) {
    if (i.kind === "CERT_INCIDENT" && i.status === "OPEN" && i.reportDueAt) {
      const ms = new Date(i.reportDueAt).getTime() - nowMs;
      if (ms < 0) {
        alerts.push({ refNo: i.refNo, severity: "CRITICAL", kind: "CERT_OVERDUE", message: `${i.refNo}: CERT-In 6-hour window lapsed — report immediately.` });
      } else if (ms < 2 * 3600000) {
        alerts.push({ refNo: i.refNo, severity: "HIGH", kind: "CERT_DUE", message: `${i.refNo}: CERT-In report due within 2 hours.` });
      }
    }
    if (i.kind === "SEC69_INTERCEPT" && (i.status === "ACTIVE" || i.status === "ORDERED") && i.reviewDueAt) {
      const ms = new Date(i.reviewDueAt).getTime() - nowMs;
      if (ms < 0) {
        alerts.push({ refNo: i.refNo, severity: "HIGH", kind: "SEC69_REVIEW", message: `${i.refNo}: Review Committee review overdue.` });
      } else if (ms < 7 * 86400000) {
        alerts.push({ refNo: i.refNo, severity: "MEDIUM", kind: "SEC69_REVIEW", message: `${i.refNo}: review due within 7 days.` });
      }
    }
    if (i.kind === "IMEI_CEIR" && i.status === "SUBMITTED") {
      const ageDays = (nowMs - new Date(i.created_at).getTime()) / 86400000;
      if (ageDays > 2) {
        alerts.push({ refNo: i.refNo, severity: "MEDIUM", kind: "CEIR_STALE", message: `${i.refNo}: CEIR request pending over 2 days — escalate.` });
      }
    }
  }
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 } as Record<string, number>;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  res.json({ alerts, generatedAt: now });
});

export default router;
