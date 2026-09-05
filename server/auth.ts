import { Request, Response, NextFunction } from "express";
import jsonwebtoken from "jsonwebtoken";
import { db, DBUser } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "crim-intel-national-security-vault-key-2026";

export interface AuthenticatedRequest extends Request {
  user?: DBUser;
  caseMemberRole?: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR" | "INSPECTOR" | "ADMIN";
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

export function requireRole(allowedRoles: Array<"ADMIN" | "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR" | "INSPECTOR">) {
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

  // Admins have global audit & oversight access to all cases
  if (req.user.role === "ADMIN") {
    req.caseMemberRole = "ADMIN";
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
