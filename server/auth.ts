import { Request, Response, NextFunction } from "express";
import jsonwebtoken from "jsonwebtoken";
import { db, DBUser } from "./db";
import { isAdmin, tenureKey } from "../src/data/roles";

const JWT_SECRET = process.env.JWT_SECRET || "trinetra-os-national-security-vault-key-2026";

import type { DBRole } from "./db";

export interface AuthenticatedRequest extends Request {
  user?: DBUser;
  caseMemberRole?: DBRole;
  /** Phase 2 — per-case access level. Absent (legacy members) means FULL_EDIT. */
  caseAccess?: "FULL_EDIT" | "VIEW_ONLY";
}

export function generateToken(user: DBUser): string {
  return jsonwebtoken.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      agency: user.agency,
      official_id: user.official_id,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export function verifyToken(token: string): any {
  try {
    return jsonwebtoken.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json({
      error: "Authentication required",
      message: "No bearer authorization token provided. Please sign in with valid credentials.",
    });
    return;
  }

  const payload = verifyToken(token);
  if (!payload || !payload.userId) {
    res.status(401).json({
      error: "Invalid or expired token",
      message: "Session token is invalid or expired. Please re-authenticate.",
    });
    return;
  }

  const user = await db.users.findOne({ _id: payload.userId });
  if (!user) {
    res.status(401).json({
      error: "User not found",
      message: "The authenticated account no longer exists.",
    });
    return;
  }

  if (user.status !== "ACTIVE") {
    res.status(403).json({
      error: "Account not active",
      status: user.status,
      message:
        user.status === "PENDING"
          ? "Account pending administrator approval"
          : `Account has been ${user.status.toLowerCase()}`,
    });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(allowedRoles: DBRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Access denied. Role '${req.user.role}' is not authorized for this resource. Required: [${allowedRoles.join(", ")}]`,
      });
      return;
    }

    next();
  };
}

/**
 * Phase 4 Req18 — functional gate: only the listed functionals (plus admins)
 * may pass. Used to fence ingestion (FIELD/FORENSIC/CYBER) and OSINT/cyber
 * toolchains (CYBER) away from Lead Investigators.
 */
export function requireFunctional(allowed: Array<"ADMIN" | "LEAD" | "CYBER" | "FORENSIC" | "FIELD">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const parts = String(req.user.role).split("_");
    const functional = parts[parts.length - 1] as "ADMIN" | "LEAD" | "CYBER" | "FORENSIC" | "FIELD";
    if (!allowed.includes(functional)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Role '${req.user.role}' may not perform ingestion/cyber operations. Restricted to ${allowed.join("/")} personnel.`,
      });
      return;
    }
    next();
  };
}

export async function requireCaseMembership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const caseId = req.params.caseId || req.body.caseId || req.query.caseId;
  if (!caseId) {
    res.status(400).json({ error: "Case ID is required for this operation" });
    return;
  }

  // Dept-scoped admins: bypass membership only within their own tenure.
  // CBI_ADMIN sees CBI cases, POLICE_ADMIN(KA) sees only KARNATAKA cases, etc.
  // Grandfathered joint-task-force seeds (multi-org members) stay accessible.
  if (isAdmin(req.user.role)) {
    const adminTenure = tenureKey(req.user.role, req.user.state);
    let caseObj: any = null;
    try {
      caseObj = await db.cases.findOne(caseId as string);
    } catch {
      caseObj = null;
    }
    const caseOrg = caseObj?.org;
    const caseState = caseObj?.state;
    if (caseOrg && caseOrg !== "UNKNOWN") {
      const caseTenure =
        caseOrg === "POLICE"
          ? `POLICE:${String(caseState || "POLICE").toUpperCase()}`
          : String(caseOrg).toUpperCase();
      if (caseTenure !== adminTenure) {
        res.status(403).json({
          error: "Tenant Isolation",
          message: `Admin tenure '${adminTenure}' may not access case tenure '${caseTenure}'.`,
        });
        return;
      }
    }
    req.caseMemberRole = req.user.role;
    req.caseAccess = "FULL_EDIT";
    next();
    return;
  }

  // Check case membership in database
  const membership = await db.case_members.findOne({
    case_id: caseId,
    user_id: req.user._id,
  });

  if (!membership || membership.status !== "ACTIVE") {
    res.status(403).json({
      error: "Case Access Denied",
      message: `User '${req.user.name}' is not an authorized member of case '${caseId}'. Contact an Administrator for case assignment.`,
    });
    return;
  }

  req.caseMemberRole = membership.role;
  req.caseAccess = membership.access || "FULL_EDIT";
  next();
}

/**
 * Phase 2 — blocks state-changing operations for VIEW_ONLY members
 * (e.g. source department after an inter-department transfer).
 */
export function requireEditAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.caseAccess === "VIEW_ONLY") {
    res.status(403).json({
      error: "Read-only access",
      message: "Your case access is VIEW_ONLY after inter-department transfer. Mutations are disabled.",
    });
    return;
  }
  next();
}

export function requireCopilotAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Allow all case officers & administrators to utilize the copilot
  next();
}
