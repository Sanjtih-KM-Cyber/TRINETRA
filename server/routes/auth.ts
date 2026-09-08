import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, DBUser, DBAccessRequest, DBAuditLog } from "../db";
import { generateToken, authenticateToken, AuthenticatedRequest } from "../auth";
import { authLimiter } from "../rateLimits";
import { REQUESTABLE_ROLES, USER_ROLES, isAdmin, tenureKey, sameTenure } from "../../src/data/roles";
import crypto from "crypto";

const router = Router();

// 1-Click Quick Demo Login Profiles (for inspection & quick testing)
router.get("/demo-users", async (req: Request, res: Response) => {
  const users = await db.users.find();
  const sanitized = users.map((u) => ({
    _id: u._id,
    name: u.name,
    official_id: u.official_id,
    email: u.email,
    role: u.role,
    status: u.status,
    agency: u.agency,
    designation: u.designation,
    avatarColor: u.avatarColor,
  }));
  res.json({ users: sanitized });
});

// Wrong-OTP failure counters per account (lockout after threshold).
const otpFailures = new Map<string, number>();
export const OTP_MAX_FAILURES = 5;

// User Sign In — requires tunnel-handshake OTP bound to the VPN session.
// Wrong OTPs are counted: OTP_MAX_FAILURES consecutive failures lock the
// account (SUSPENDED) pending department-Admin reactivation.
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  const { identifier, password, email, otp } = req.body;
  const loginId = identifier || email;

  if (!loginId || !password) {
    res.status(400).json({ error: "Identifier (Email or Official ID) and Password are required" });
    return;
  }
  const vpnSession = (req as any).vpnSession as { otp?: string; otpExpiresAt?: number } | undefined;
  if (!vpnSession) {
    res.status(401).json({
      error: "VPN_REQUIRED",
      message: "VPN tunnel required. Connect via the VPN gateway first.",
      redirect: "/vpn-gateway",
    });
    return;
  }
  if (!otp || !/^\d{6}$/.test(String(otp))) {
    res.status(401).json({
      error: "OTP_REQUIRED",
      message: "6-digit tunnel OTP is required alongside credentials. Copy it from the VPN tunnel screen.",
    });
    return;
  }

  const user = await db.users.findOne({ email: loginId }) || await db.users.findOne({ official_id: loginId });

  if (!user) {
    res.status(401).json({
      error: "Authentication failed",
      message: "No registered credentials match the provided identifier.",
    });
    return;
  }

  const failOtp = async (message: string) => {
    const fails = (otpFailures.get(user._id) || 0) + 1;
    otpFailures.set(user._id, fails);
    const now = new Date().toISOString();
    if (fails >= OTP_MAX_FAILURES) {
      await db.users.updateOne(user._id, { status: "SUSPENDED" });
      otpFailures.delete(user._id);
      await db.audit_logs.insertOne({
        _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: now,
        user_id: user._id,
        user_name: user.name,
        user_role: user.role,
        action: "AUTH_OTP_LOCKED",
        details: `Account locked after ${fails} consecutive wrong tunnel OTPs. Reactivation requires department Admin.`,
        digital_hash: crypto.createHash("sha256").update(`${user._id}:${now}:OTPLOCK`).digest("hex"),
        result: "DENIED",
        ip_address: req.ip || "127.0.0.1",
      });
      res.status(403).json({
        error: "Account Locked",
        status: "LOCKED",
        message: `Account locked after ${OTP_MAX_FAILURES} wrong OTP attempts. Contact your department Admin for reactivation.`,
      });
      return;
    }
    res.status(401).json({
      error: "Authentication failed",
      message: `${message} (${OTP_MAX_FAILURES - fails} attempt(s) left before lockout.)`,
    });
  };

  if (vpnSession.otpExpiresAt && vpnSession.otpExpiresAt < Date.now()) {
    res.status(401).json({ error: "Authentication failed", message: "Tunnel OTP expired. Reconnect the VPN tunnel." });
    return;
  }
  if (!vpnSession.otp || String(otp) !== String(vpnSession.otp)) {
    await failOtp("Invalid tunnel OTP.");
    return;
  }

  // Verify password with bcrypt
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    // Audit failed attempt
    const auditLog: DBAuditLog = {
      _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      user_id: user._id,
      user_name: user.name,
      user_role: user.role,
      action: "AUTH_LOGIN_FAILED",
      details: `Failed authentication attempt for ${user.email} (invalid password hash match).`,
      digital_hash: crypto.createHash("sha256").update(`${user._id}:${Date.now()}:FAILED`).digest("hex"),
      result: "DENIED",
      ip_address: req.ip || "127.0.0.1",
    };
    await db.audit_logs.insertOne(auditLog);

    res.status(401).json({
      error: "Authentication failed",
      message: "Invalid security credentials.",
    });
    return;
  }

  // Check account status
  if (user.status === "PENDING") {
    res.status(403).json({
      error: "Account Pending Approval",
      status: "PENDING",
      message: "Account pending administrator approval. Please wait for an Admin officer to verify your access request.",
    });
    return;
  }

  if (user.status === "SUSPENDED" || user.status === "REJECTED") {
    res.status(403).json({
      error: `Account ${user.status}`,
      status: user.status,
      message: `Your account has been marked as ${user.status.toLowerCase()}. Access restricted.`,
    });
    return;
  }

  // Update last login
  const now = new Date().toISOString();
  otpFailures.delete(user._id);
  await db.users.updateOne(user._id, { last_login: now });

  // Audit successful login
  const auditLog: DBAuditLog = {
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: user._id,
    user_name: user.name,
    user_role: user.role,
    action: "AUTH_LOGIN_SUCCESS",
    details: `Officer ${user.name} (${user.role}) authenticated successfully from agency ${user.agency}.`,
    digital_hash: crypto.createHash("sha256").update(`${user._id}:${now}:SUCCESS`).digest("hex"),
    result: "SUCCESS",
    ip_address: req.ip || "127.0.0.1",
  };
  await db.audit_logs.insertOne(auditLog);

  // Fetch authorized cases for user (dept-scoped admins see only their tenure)
  let authorizedCases: any[] = [];
  const allCasesForAuth = await db.cases.find();
  if (isAdmin(user.role)) {
    const tenure = tenureKey(user.role, user.state);
    authorizedCases = allCasesForAuth.filter((c: any) => {
      if (!c?.org || c.org === "UNKNOWN") return true;
      const ct = c.org === "POLICE" ? `POLICE:${String(c.state || "POLICE").toUpperCase()}` : String(c.org).toUpperCase();
      return ct === tenure;
    });
  } else {
    const memberships = await db.case_members.find({ user_id: user._id });
    const caseIds = memberships.map((m) => m.case_id);
    authorizedCases = allCasesForAuth.filter((c) => caseIds.includes(c.id));
  }

  const token = generateToken(user);

  res.json({
    token,
    user: {
      _id: user._id,
      name: user.name,
      official_id: user.official_id,
      email: user.email,
      agency: user.agency,
      designation: user.designation,
      department: user.department,
      role: user.role,
      state: user.state,
      status: user.status,
      created_at: user.created_at,
      last_login: now,
      avatarColor: user.avatarColor,
    },
    authorized_cases: authorizedCases,
  });
});

// Request System Access
router.post("/request-access", authLimiter, async (req: Request, res: Response) => {
  const {
    full_name,
    official_id,
    official_email,
    agency,
    designation,
    department,
    requested_role,
    state,
    reason_for_access,
    password,
  } = req.body;

  if (!full_name || !official_id || !official_email || !requested_role) {
    res.status(400).json({ error: "All required access fields (Full Name, Official ID, Official Email, Role) must be provided." });
    return;
  }

  const ALLOWED_REQUEST_ROLES: string[] = [...REQUESTABLE_ROLES];
  if (!ALLOWED_REQUEST_ROLES.includes(requested_role)) {
    res.status(400).json({ error: `Requested role must be one of: ${ALLOWED_REQUEST_ROLES.join(", ")}.` });
    return;
  }
  if (String(requested_role).startsWith("POLICE_") && !state) {
    res.status(400).json({ error: "State jurisdiction is required for State Police roles (MAHARASHTRA/KARNATAKA)." });
    return;
  }

  // Check if existing user with email or official_id
  const existingUser = await db.users.findOne({ email: official_email }) || await db.users.findOne({ official_id });
  if (existingUser) {
    res.status(409).json({
      error: "Account Exists",
      message: "An account or access request with this Official Email or ID already exists.",
    });
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const rawPass = password || crypto.randomBytes(16).toString("hex");
  const password_hash = await bcrypt.hash(rawPass, salt);
  const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const reqId = `REQ-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const now = new Date().toISOString();

  // Create User with status PENDING
  const newUser: DBUser = {
    _id: userId,
    name: full_name,
    official_id,
    email: official_email,
    password_hash,
    agency: agency || "Law Enforcement / Intelligence Agency",
    designation: designation || "Investigative Officer",
    department: department || "Special Operations",
    role: requested_role,
    state: state ? String(state).toUpperCase() : undefined,
    status: "PENDING",
    created_at: now,
    avatarColor:
      String(requested_role).endsWith("_LEAD")
        ? "#f59e0b"
        : String(requested_role).endsWith("_FORENSIC")
        ? "#10b981"
        : String(requested_role).endsWith("_CYBER")
        ? "#06b6d4"
        : String(requested_role).endsWith("_ADMIN")
        ? "#6366f1"
        : "#3b82f6",
  };

  await db.users.insertOne(newUser);

  // Create Access Request record
  const newReq: DBAccessRequest = {
    _id: reqId,
    full_name,
    official_id,
    official_email,
    agency: agency || "Law Enforcement / Intelligence Agency",
    designation: designation || "Investigative Officer",
    department: department || "Special Operations",
    requested_role,
    state: state ? String(state).toUpperCase() : undefined,
    reason_for_access: reason_for_access || "Intelligence case analysis and operational clearance.",
    status: "PENDING",
    submitted_at: now,
  };

  await db.access_requests.insertOne(newReq);

  // Audit log
  await db.audit_logs.insertOne({
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_name: full_name,
    user_role: requested_role,
    action: "ACCESS_REQUEST_SUBMITTED",
    details: `New access request submitted by ${full_name} (${official_id}, ${agency}) for role ${requested_role}.`,
    digital_hash: crypto.createHash("sha256").update(`${reqId}:${now}:SUBMIT`).digest("hex"),
    result: "SUCCESS",
  });

  res.status(201).json({
    success: true,
    message: "Access request submitted successfully. It will be reviewed by an Administrator.",
    request_id: reqId,
  });
});

// Phase 3 Req15/17 — same-tenure directory: ACTIVE users sharing the caller's
// tenure (powers Lead team-add, POC nomination, requisition targeting).
router.get("/tenure-users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!;
  const all = await db.users.find();
  const users = all
    .filter((u) => u.status === "ACTIVE" && sameTenure(me.role, me.state, u.role, u.state))
    .map((u) => ({
      _id: u._id,
      name: u.name,
      official_id: u.official_id,
      email: u.email,
      agency: u.agency,
      designation: u.designation,
      department: u.department,
      role: u.role,
      state: u.state,
      avatarColor: u.avatarColor,
    }));
  res.json({ users, tenure: tenureKey(me.role, me.state) });
});

// Current Authenticated User Profile & Authorized Cases
router.get("/me", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  let authorizedCases: any[] = [];
  const allCasesForMe = await db.cases.find();
  if (isAdmin(user.role)) {
    const tenure = tenureKey(user.role, user.state);
    authorizedCases = allCasesForMe.filter((c: any) => {
      if (!c?.org || c.org === "UNKNOWN") return true;
      const ct = c.org === "POLICE" ? `POLICE:${String(c.state || "POLICE").toUpperCase()}` : String(c.org).toUpperCase();
      return ct === tenure;
    });
  } else {
    const memberships = await db.case_members.find({ user_id: user._id });
    const caseIds = memberships.map((m) => m.case_id);
    authorizedCases = allCasesForMe.filter((c) => caseIds.includes(c.id));
  }

  res.json({
    user: {
      _id: user._id,
      name: user.name,
      official_id: user.official_id,
      email: user.email,
      agency: user.agency,
      designation: user.designation,
      department: user.department,
      role: user.role,
      state: user.state,
      status: user.status,
      created_at: user.created_at,
      last_login: user.last_login,
      avatarColor: user.avatarColor,
    },
    authorized_cases: authorizedCases,
  });
});

// Logout
router.post("/logout", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user) {
    await db.audit_logs.insertOne({
      _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      user_id: req.user._id,
      user_name: req.user.name,
      user_role: req.user.role,
      action: "AUTH_LOGOUT",
      details: `Officer ${req.user.name} logged out securely.`,
      digital_hash: crypto.createHash("sha256").update(`${req.user._id}:${Date.now()}:LOGOUT`).digest("hex"),
      result: "SUCCESS",
    });
  }
  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
