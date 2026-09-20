import { Router, Response } from "express";
import { db, DBCaseMember, DBCollabRequest } from "../db";
import { authenticateToken, requireRole, requireCaseMembership, AuthenticatedRequest } from "../auth";
import { isLead, tenureKey, caseTenureOf, sameTenure, KNOWN_STATES } from "../../src/data/roles";
import type { DBRole } from "../db";
import { broadcastCaseUpdate } from "../realtime";
import { auditRecord } from "../services/diaryService";

const router = Router();
router.use(authenticateToken);

// Statewise admins: State Police + CID (both carry state jurisdiction).
const STATE_ADMINS: DBRole[] = ["POLICE_ADMIN", "CID_ADMIN"] as DBRole[];

function myState(req: AuthenticatedRequest): string {
  return String(req.user!.state || "").toUpperCase();
}

/**
 * Item 1 — state-to-state collaboration.
 * A State Police Admin requests joint work on a case; the counter-state Admin
 * approves and attaches one of their Leads. Approval shares every current
 * exhibit (bridge flags) and seats the attached Lead on the case roster.
 */

// Outbox: requests my state sent.
router.get("/requests/outbox", requireRole(STATE_ADMINS), async (req: AuthenticatedRequest, res: Response) => {
  const list = await db.collab_requests.find({ from_state: myState(req) });
  res.json({ requests: list });
});

// Inbox: requests other states sent to mine.
router.get("/requests/inbox", requireRole(STATE_ADMINS), async (req: AuthenticatedRequest, res: Response) => {
  const list = await db.collab_requests.find({ to_state: myState(req) });
  res.json({ requests: list });
});

// Request collaboration on one of my state's cases.
router.post("/requests", requireRole(STATE_ADMINS), async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const { caseId, toState, message } = req.body;
  const target = String(toState || "").toUpperCase();

  if (!KNOWN_STATES.some((s) => s.code === target)) {
    res.status(400).json({ error: "toState must be a known state jurisdiction." });
    return;
  }
  if (target === myState(req)) {
    res.status(400).json({ error: "Cannot request collaboration with your own state." });
    return;
  }
  const caseObj: any = await db.cases.findOne(caseId);
  if (!caseObj) {
    res.status(404).json({ error: "Case not found." });
    return;
  }
  const ct = caseTenureOf(caseObj);
  if (ct !== tenureKey(admin.role, admin.state)) {
    res.status(403).json({ error: "Tenant Isolation", message: "You may request collaboration only on your own state's cases." });
    return;
  }
  const dup = (await db.collab_requests.find({})).find(
    (r) => r.case_id === caseId && r.to_state === target && r.status === "PENDING"
  );
  if (dup) {
    res.status(400).json({ error: "A pending collaboration request for this case/state already exists." });
    return;
  }
  const now = new Date().toISOString();
  const doc: DBCollabRequest = {
    _id: `col-${caseId}-${target}-${Date.now().toString(36)}`,
    case_id: caseId,
    case_code: caseObj.codeName,
    from_state: myState(req),
    to_state: target,
    requested_by: admin.name,
    requested_by_role: admin.role,
    message: String(message || "").slice(0, 500),
    status: "PENDING",
    requested_at: now,
  };
  await db.collab_requests.insertOne(doc);
  res.status(201).json({ success: true, request: doc });
});

// Approve: attach one of MY leads + share all current exhibits with my state.
router.post(
  "/requests/:id/approve",
  requireRole(STATE_ADMINS),
  async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const { leadId, notes } = req.body;
    const doc = await db.collab_requests.findOne(req.params.id);
    if (!doc || doc.status !== "PENDING") {
      res.status(404).json({ error: "Pending collaboration request not found." });
      return;
    }
    if (doc.to_state !== myState(req)) {
      res.status(403).json({ error: "Tenant Isolation", message: "This request is addressed to another state." });
      return;
    }
    const lead = await db.users.findOne({ _id: leadId });
    if (!lead || lead.status !== "ACTIVE" || !isLead(lead.role) || !sameTenure(admin.role, admin.state, lead.role, lead.state)) {
      res.status(400).json({ error: "leadId must be an ACTIVE *_LEAD officer of your state." });
      return;
    }
    const now = new Date().toISOString();
    const existing = await db.case_members.findOne({ case_id: doc.case_id, user_id: lead._id });
    if (!existing) {
      const member: DBCaseMember = {
        _id: `mem-${doc.case_id}-${lead._id}-collab`,
        case_id: doc.case_id,
        user_id: lead._id,
        user_name: lead.name,
        user_email: lead.email,
        official_id: lead.official_id,
        agency: lead.agency,
        role: lead.role,
        state: lead.state,
        access: "FULL_EDIT",
        status: "ACTIVE",
        assigned_at: now,
        assigned_by: admin.name,
      };
      await db.case_members.insertOne(member);
    }
    // Share every current exhibit with the approving state (bridge flags).
    const exhibits = await db.evidence.find({ case_id: doc.case_id });
    for (const ev of exhibits) {
      const sharedTo = [...new Set([...(ev.sharedTo || []), myState(req)])];
      await db.evidence.updateOne(ev._id, { sharedTo, sharedBy: admin.name, sharedAt: now });
    }
    await db.collab_requests.updateOne(doc._id, {
      status: "APPROVED",
      reviewed_by: admin.name,
      reviewed_at: now,
      review_notes: notes,
      attached_lead_id: lead._id,
      attached_lead_name: lead.name,
    });
    await auditRecord(
      doc.case_id,
      admin,
      "COLLAB_APPROVED",
      `${admin.name} approved interstate collaboration ${doc.from_state} ↔ ${doc.to_state} on ${doc.case_code}; attached Lead ${lead.name}; ${exhibits.length} exhibits mirrored.`,
      "CASE",
      doc.case_id,
      doc.case_code,
      { toState: doc.to_state },
      req.ip
    );
    broadcastCaseUpdate(doc.case_id, {
      event_type: "TEAM_UPDATED",
      title: "Interstate collaboration live",
      message: `${lead.name} (${doc.to_state}) joined ${doc.case_code}; case files shared.`,
      changes: {},
      actor_name: admin.name,
      actor_role: admin.role,
    });
    res.json({ success: true, attachedLead: lead.name, exhibitsShared: exhibits.length });
  }
);

router.post(
  "/requests/:id/reject",
  requireRole(STATE_ADMINS),
  async (req: AuthenticatedRequest, res: Response) => {
    const admin = req.user!;
    const doc = await db.collab_requests.findOne(req.params.id);
    if (!doc || doc.status !== "PENDING") {
      res.status(404).json({ error: "Pending collaboration request not found." });
      return;
    }
    if (doc.to_state !== myState(req)) {
      res.status(403).json({ error: "Tenant Isolation", message: "This request is addressed to another state." });
      return;
    }
    await db.collab_requests.updateOne(doc._id, {
      status: "REJECTED",
      reviewed_by: admin.name,
      reviewed_at: new Date().toISOString(),
      review_notes: req.body?.notes,
    });
    res.json({ success: true });
  }
);

// Case-scoped history (members of the case).
router.get(
  "/cases/:caseId/collaborations",
  requireCaseMembership,
  async (req: AuthenticatedRequest, res: Response) => {
    const all = await db.collab_requests.find({});
    res.json({ requests: all.filter((r) => r.case_id === req.params.caseId) });
  }
);

export default router;
