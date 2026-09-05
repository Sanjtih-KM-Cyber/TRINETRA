import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, DBUser, DBAccessRequest, DBAuditLog } from "../db";
import { generateToken, authenticateToken, AuthenticatedRequest } from "../auth";
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

// User Sign In
router.post("/login", async (req: Request, res: Response) => {
  const { identifier, password, email } = req.body;
  const loginId = identifier || email;

  if (!loginId || !password) {
    res.status(400).json({ error: "Identifier (Email or Official ID) and Password are required" });
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

  // Fetch authorized cases for user
  let authorizedCases: any[] = [];
  if (user.role === "ADMIN") {
    authorizedCases = await db.cases.find();
  } else {
    const memberships = await db.case_members.find({ user_id: user._id });
    const caseIds = memberships.map((m) => m.case_id);
    const allCases = await db.cases.find();
    authorizedCases = allCases.filter((c) => caseIds.includes(c.id));
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
      status: user.status,
      created_at: user.created_at,
      last_login: now,
      avatarColor: user.avatarColor,
    },
    authorized_cases: authorizedCases,
  });
});

// Request System Access
router.post("/request-access", async (req: Request, res: Response) => {
  const {
    full_name,
    official_id,
    official_email,
    agency,
    designation,
    department,
    requested_role,
    reason_for_access,
    password,
  } = req.body;

  if (!full_name || !official_id || !official_email || !requested_role) {
    res.status(400).json({ error: "All required access fields (Full Name, Official ID, Official Email, Role) must be provided." });
    return;
  }

  if (requested_role !== "LEAD_INVESTIGATOR" && requested_role !== "FORENSIC_INVESTIGATOR") {
    res.status(400).json({ error: "Requested role must be either LEAD_INVESTIGATOR or FORENSIC_INVESTIGATOR." });
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
    status: "PENDING",
    created_at: now,
    avatarColor: requested_role === "LEAD_INVESTIGATOR" ? "#f59e0b" : "#10b981",
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

// Current Authenticated User Profile & Authorized Cases
router.get("/me", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  let authorizedCases: any[] = [];
  if (user.role === "ADMIN") {
    authorizedCases = await db.cases.find();
  } else {
    const memberships = await db.case_members.find({ user_id: user._id });
    const caseIds = memberships.map((m) => m.case_id);
    const allCases = await db.cases.find();
    authorizedCases = allCases.filter((c) => caseIds.includes(c.id));
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
