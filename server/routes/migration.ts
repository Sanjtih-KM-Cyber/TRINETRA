import { Router, Response } from "express";
import { db, DBCaseMember, DBRole } from "../db";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../auth";
import { ADMIN_ROLES, isLead, tenureKey, orgOf, type Org } from "../../src/data/roles";
import { broadcastCaseUpdate } from "../realtime";
import { auditRecord } from "../services/diaryService";

const router = Router();
router.use(authenticateToken);
router.use(requireRole([...ADMIN_ROLES] as DBRole[]));

function caseTenure(c: any): string {
  if (!c?.org || c.org === "UNKNOWN") return "SHARED";
  return c.org === "POLICE" ? `POLICE:${String(c.state || "POLICE").toUpperCase()}` : String(c.org).toUpperCase();
}

function orderRefOf(body: any): string | null {
  const ref = String(body?.orderRef || "").trim();
  return ref.length >= 6 ? ref : null;
}

/**
 * Phase 6 Req27 — instantaneous administrative handover.
 * Re-keys the case container to the incoming agency tenure and exposes all
 * case files + operational data to the incoming Admin in one atomic call.
 */
router.post("/handover", async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { caseId, toOrg, toState, toAdminId, orderRef, reason } = req.body;

  const ref = orderRefOf(req.body);
  if (!ref) {
    res.status(400).json({ error: "orderRef (transfer order / court mandate ref, min 6 chars) is required." });
    return;
  }
  const targetOrg = String(toOrg || "").toUpperCase() as Org;
  if (!["CBI", "NIA", "CID", "POLICE"].includes(targetOrg)) {
    res.status(400).json({ error: "toOrg must be one of CBI/NIA/CID/POLICE." });
    return;
  }
  const targetState = targetOrg === "POLICE" ? String(toState || "").toUpperCase() : undefined;
  if (targetOrg === "POLICE" && !targetState) {
    res.status(400).json({ error: "toState is required for State Police handover." });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }
  const fromTenure = caseTenure(caseObj);
  if (fromTenure !== "SHARED" && fromTenure !== tenureKey(admin.role, admin.state)) {
    res.status(403).json({ error: "Tenant Isolation", message: "You may hand over only cases in your own tenure." });
    return;
  }
  const incoming = await db.users.findOne({ _id: toAdminId });
  if (!incoming || incoming.status !== "ACTIVE" || !String(incoming.role).endsWith("_ADMIN")) {
    res.status(400).json({ error: "toAdminId must be an ACTIVE *_ADMIN officer." });
    return;
  }
  const wantTenure = targetOrg === "POLICE" ? `POLICE:${targetState}` : targetOrg;
  if (tenureKey(incoming.role, incoming.state) !== wantTenure) {
    res.status(400).json({ error: `Incoming admin tenure '${tenureKey(incoming.role, incoming.state)}' does not match target '${wantTenure}'.` });
    return;
  }

  const now = new Date().toISOString();
  const toTenure = wantTenure;
  await db.cases.updateOne(caseId, {
    org: targetOrg,
    state: targetState,
    leadAgency: incoming.agency,
    handover: {
      from: fromTenure,
      to: toTenure,
      orderRef: ref,
      reason: String(reason || "").slice(0, 500),
      by: admin.name,
      at: now,
    },
  });

  const existing = await db.case_members.findOne({ case_id: caseId, user_id: incoming._id });
  if (!existing) {
    const member: DBCaseMember = {
      _id: `mem-${caseId}-${incoming._id}-handover`,
      case_id: caseId,
      user_id: incoming._id,
      user_name: incoming.name,
      user_email: incoming.email,
      official_id: incoming.official_id,
      agency: incoming.agency,
      role: incoming.role,
      state: incoming.state,
      access: "FULL_EDIT",
      status: "ACTIVE",
      assigned_at: now,
      assigned_by: admin.name,
    };
    await db.case_members.insertOne(member);
  } else {
    await db.case_members.updateOne(existing._id, { access: "FULL_EDIT", status: "ACTIVE" });
  }

  await auditRecord(
    caseId,
    admin,
    "HANDOVER_EXECUTED",
    `Administrative handover ${fromTenure} → ${toTenure} per order ${ref}. Incoming: ${incoming.name} (${incoming.role}). Reason: ${reason || "—"}`,
    "CASE",
    caseId,
    caseObj.codeName,
    { toOrg: targetOrg, orderRef: ref },
    req.ip
  );
  broadcastCaseUpdate(caseId, {
    event_type: "TRANSFER_EXECUTED",
    title: "Case handed over",
    message: `${caseObj.codeName}: ${fromTenure} → ${toTenure} (order ${ref}).`,
    changes: {},
    actor_name: admin.name,
    actor_role: admin.role,
  });
  res.json({ success: true, from: fromTenure, to: toTenure, orderRef: ref });
});

/**
 * Phase 6 Req28 Path A — State Escalation (CID Admin only).
 * Pulls a local police_ case into the state CID workspace per State Executive /
 * High Court directive. Police personnel become read-only; CID command takes over.
 */
router.post("/escalate", requireRole(["CID_ADMIN"] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { caseId, orderRef, cidLeadId } = req.body;
  const ref = orderRefOf(req.body);
  if (!ref) {
    res.status(400).json({ error: "orderRef (State Executive / High Court directive ref, min 6 chars) is required." });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }
  if (caseObj.org !== "POLICE") {
    res.status(400).json({ error: "Escalation pulls POLICE cases only." });
    return;
  }
  const state = caseObj.state;
  const members = await db.case_members.find({ case_id: caseId });
  const now = new Date().toISOString();

  let cidLead: any = null;
  if (cidLeadId) {
    cidLead = await db.users.findOne({ _id: cidLeadId });
    if (!cidLead || cidLead.status !== "ACTIVE" || !isLead(cidLead.role) || orgOf(cidLead.role) !== "CID") {
      res.status(400).json({ error: "cidLeadId must be an ACTIVE CID_LEAD officer." });
      return;
    }
  }

  await db.cases.updateOne(caseId, {
    org: "CID",
    migration: { path: "A_STATE_ESCALATION", from: `POLICE:${String(state || "POLICE").toUpperCase()}`, to: "CID", orderRef: ref, by: admin.name, at: now },
  });

  // Police hands become read-only; CID command takes FULL_EDIT.
  for (const m of members) {
    if (m.status !== "ACTIVE") continue;
    if (String(m.role).startsWith("POLICE_") && !String(m.role).endsWith("_ADMIN")) {
      await db.case_members.updateOne(m._id, { access: "VIEW_ONLY" });
    }
  }
  const ensureFull = async (u: any, role: DBRole) => {
    const ex = await db.case_members.findOne({ case_id: caseId, user_id: u._id });
    if (!ex) {
      await db.case_members.insertOne({
        _id: `mem-${caseId}-${u._id}-escalated`,
        case_id: caseId,
        user_id: u._id,
        user_name: u.name,
        user_email: u.email,
        official_id: u.official_id,
        agency: u.agency,
        role,
        state: u.state,
        access: "FULL_EDIT",
        status: "ACTIVE",
        assigned_at: now,
        assigned_by: admin.name,
      });
    } else {
      await db.case_members.updateOne(ex._id, { access: "FULL_EDIT", status: "ACTIVE" });
    }
  };
  await ensureFull(admin, admin.role);
  if (cidLead) await ensureFull(cidLead, cidLead.role);

  await auditRecord(
    caseId,
    admin,
    "MIGRATION_ESCALATED",
    `Path A escalation POLICE:${String(state || "?").toUpperCase()} → CID per ${ref}. Police hands set VIEW_ONLY; CID command FULL_EDIT.`,
    "CASE",
    caseId,
    caseObj.codeName,
    { path: "A", orderRef: ref },
    req.ip
  );
  broadcastCaseUpdate(caseId, {
    event_type: "TRANSFER_EXECUTED",
    title: "Case escalated to CID",
    message: `${caseObj.codeName} escalated to CID (order ${ref}).`,
    changes: {},
    actor_name: admin.name,
    actor_role: admin.role,
  });
  res.json({ success: true, path: "A_STATE_ESCALATION", orderRef: ref });
});

/**
 * Phase 6 Req28 Path B — Federal Override (CBI Admin only).
 * Central takeover per Central Executive / Supreme Court mandate: locks out
 * state personnel (VIEW_ONLY) and moves the repository under cbi_ control.
 */
router.post("/takeover", requireRole(["CBI_ADMIN"] as DBRole[]), async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { caseId, orderRef, cbiLeadId } = req.body;
  const ref = orderRefOf(req.body);
  if (!ref) {
    res.status(400).json({ error: "orderRef (Central Executive / Supreme Court mandate ref, min 6 chars) is required." });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }
  if (caseObj.org === "CBI") {
    res.status(400).json({ error: "Case is already under CBI control." });
    return;
  }
  const fromTenure = caseTenure(caseObj);
  const members = await db.case_members.find({ case_id: caseId });
  const now = new Date().toISOString();

  let cbiLead: any = null;
  if (cbiLeadId) {
    cbiLead = await db.users.findOne({ _id: cbiLeadId });
    if (!cbiLead || cbiLead.status !== "ACTIVE" || !isLead(cbiLead.role) || orgOf(cbiLead.role) !== "CBI") {
      res.status(400).json({ error: "cbiLeadId must be an ACTIVE CBI_LEAD officer." });
      return;
    }
  }

  await db.cases.updateOne(caseId, {
    org: "CBI",
    state: undefined,
    leadAgency: admin.agency,
    migration: { path: "B_FEDERAL_OVERRIDE", from: fromTenure, to: "CBI", orderRef: ref, by: admin.name, at: now },
  });

  // Zero-latency lockout: every non-CBI hand becomes read-only, instantly.
  for (const m of members) {
    if (m.status !== "ACTIVE") continue;
    if (!String(m.role).startsWith("CBI_")) {
      await db.case_members.updateOne(m._id, { access: "VIEW_ONLY" });
    } else {
      await db.case_members.updateOne(m._id, { access: "FULL_EDIT" });
    }
  }
  const ensureFull = async (u: any, role: DBRole) => {
    const ex = await db.case_members.findOne({ case_id: caseId, user_id: u._id });
    if (!ex) {
      await db.case_members.insertOne({
        _id: `mem-${caseId}-${u._id}-takeover`,
        case_id: caseId,
        user_id: u._id,
        user_name: u.name,
        user_email: u.email,
        official_id: u.official_id,
        agency: u.agency,
        role,
        state: u.state,
        access: "FULL_EDIT",
        status: "ACTIVE",
        assigned_at: now,
        assigned_by: admin.name,
      });
    } else {
      await db.case_members.updateOne(ex._id, { access: "FULL_EDIT", status: "ACTIVE" });
    }
  };
  await ensureFull(admin, admin.role);
  if (cbiLead) await ensureFull(cbiLead, cbiLead.role);

  await auditRecord(
    caseId,
    admin,
    "MIGRATION_TAKEOVER",
    `Path B federal override ${fromTenure} → CBI per ${ref}. State personnel locked to VIEW_ONLY; repository under cbi_ control.`,
    "CASE",
    caseId,
    caseObj.codeName,
    { path: "B", orderRef: ref },
    req.ip
  );
  broadcastCaseUpdate(caseId, {
    event_type: "TRANSFER_EXECUTED",
    title: "CBI takeover executed",
    message: `${caseObj.codeName} under CBI control (order ${ref}). State hands locked VIEW_ONLY.`,
    changes: {},
    actor_name: admin.name,
    actor_role: admin.role,
  });
  res.json({ success: true, path: "B_FEDERAL_OVERRIDE", orderRef: ref });
});

export default router;
