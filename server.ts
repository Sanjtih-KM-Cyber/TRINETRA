import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import dotenv from "dotenv";
import { initDatabase, db, isMongoBackend } from "./server/db";
import { vpnAuthLimiter, apiLimiter } from "./server/rateLimits";
import { initWebSocketServer } from "./server/realtime";
import authRouter from "./server/routes/auth";
import adminRouter from "./server/routes/admin";
import casesRouter from "./server/routes/cases";
import copilotRouter from "./server/routes/copilot";
import investigatorRouter from "./server/routes/investigator";
import proceedingsRouter from "./server/routes/proceedings";
import stagingRouter from "./server/routes/staging";
import sahayakRouter from "./server/routes/sahayak";
import cyberRouter from "./server/routes/cyber";
import migrationRouter from "./server/routes/migration";
import { authenticateToken as chunkAuth, type AuthenticatedRequest as ChunkReq } from "./server/auth";
import { extractEntitiesUniversal, extractEntitiesRuleBased } from "./src/services/nlpExtractor";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";

// Production environment validation — fail fast on unsafe defaults.
function validateProdEnv(): void {
  if (!IS_PROD) return;
  const secret = process.env.JWT_SECRET || "";
  if (!secret || secret === "trinetra-os-national-security-vault-key-2026") {
    console.error("[SECURITY] Refusing to boot: JWT_SECRET must be set to a unique value in production.");
    process.exit(1);
  }
  if ((process.env.CCTNS_DEMO_MODE ?? "true") === "true" && process.env.ALLOW_DEMO_IN_PROD !== "true") {
    console.error("[SECURITY] Refusing to boot: CCTNS_DEMO_MODE=true in production. Set CCTNS_DEMO_MODE=false (or ALLOW_DEMO_IN_PROD=true to override).");
    process.exit(1);
  }
  if (!process.env.MONGO_URL) {
    console.warn("[SECURITY] No MONGO_URL — production will run on the ephemeral memory vault (data resets on restart).");
  }
}
validateProdEnv();

// NOTE: Helmet removed by operator decision (it blocked legitimate map/CDN
// traffic). Rate limiting below stays as the active edge guard. Revisit
// security headers once tile/CDN allow-lists are proven in staging.
app.use("/api/", apiLimiter);

// ---------------------------------------------------------------------------
// Phase 0 — VPN Gate Mount + Demo Mode
// CCTNS_DEMO_MODE=true  -> demo gateway mount: seeded officers may pass with
//                          badge + PIN, mTLS optional, OTP optional.
// CCTNS_DEMO_MODE=false -> production: badge + PIN + 6-digit OTP + mTLS client
//                          certificate required, sessions bound + expiring.
// ---------------------------------------------------------------------------
export const CCTNS_DEMO_MODE = (process.env.CCTNS_DEMO_MODE ?? "true") === "true";
const VPN_GATEWAY_ID = process.env.VPN_GATEWAY_ID ?? "CCTNS-GW-MH-01";
const VPN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface VpnSession {
  token: string;
  gateway: string;
  createdAt: number;
  expiresAt: number;
  mtls: boolean;
  demo: boolean;
  /** Tunnel-handshake OTP bound to this session; required at JWT login. */
  otp: string;
  otpExpiresAt: number;
}

const vpnSessions = new Map<string, VpnSession>();

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function getVpnSession(req: express.Request): VpnSession | null {
  const headerToken = (req.headers["x-vpn-session"] as string | undefined)?.trim();
  const cookies = parseCookies(req.headers.cookie);
  const token = headerToken || cookies["vpn_session"];
  if (!token) return null;
  const sess = vpnSessions.get(token);
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) {
    vpnSessions.delete(token);
    return null;
  }
  return sess;
}

// Prune expired VPN sessions every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of vpnSessions) {
    if (sess.expiresAt < now) vpnSessions.delete(token);
  }
}, 15 * 60 * 1000).unref?.();

// VPN Gateway middleware — protects all routes except the gateway itself.
// Static assets (Vite dev modules, bundled files, images, CSS) must ALWAYS
// pass through, otherwise the gateway page itself can never load its JS.
const vpnGatewayMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    req.path.startsWith("/vpn-gateway") ||
    req.path.startsWith("/api/vpn") ||
    req.path.startsWith("/assets/") ||
    req.path === "/favicon.ico" ||
    req.path.startsWith("/src/") ||
    req.path.startsWith("/@vite/") ||
    req.path.startsWith("/@react-refresh") ||
    req.path.startsWith("/node_modules/") ||
    (!req.path.startsWith("/api/") && /\.[a-zA-Z0-9]+$/.test(req.path))
  ) {
    return next();
  }

  const sess = getVpnSession(req);
  if (!sess) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({
        error: "VPN_REQUIRED",
        message: "VPN tunnel required. Connect via /vpn-gateway",
        redirect: "/vpn-gateway",
      });
    }
    return res.redirect("/vpn-gateway");
  }

  (req as express.Request & { vpnSession?: VpnSession }).vpnSession = sess;
  next();
};

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check (accessible without VPN)
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    demoMode: CCTNS_DEMO_MODE,
    gateway: VPN_GATEWAY_ID,
    backend: isMongoBackend ? "mongodb" : "memory",
    uptimeSec: Math.floor(process.uptime()),
  });
});

// Dev Vite instance (set during startServer in non-production).
let viteDevServer: ViteDevServer | null = null;

// VPN Gateway Page (accessible without VPN).
// In dev the HTML MUST go through Vite's transformIndexHtml so the React
// Fast Refresh preamble is injected — serving index.html raw whitescreens
// with "@vitejs/plugin-react can't detect preamble".
app.get("/vpn-gateway", async (req, res, next) => {
  try {
    if (viteDevServer) {
      const template = await viteDevServer.transformIndexHtml(
        req.originalUrl,
        fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8")
      );
      return res.status(200).set({ "Content-Type": "text/html" }).end(template);
    }
    return res.sendFile(path.join(process.cwd(), "index.html"));
  } catch (err) {
    next(err);
  }
});

// VPN handshake — anonymous tunnel establishment (no identity on this screen).
// The officer runs the TLS handshake, the gateway issues a session-bound
// 6-digit OTP, and identity (badge + PIN + OTP) is proven on the NEXT screen
// (Officer Sign-In → POST /api/auth/login).
app.post("/api/vpn/handshake", vpnAuthLimiter, async (req, res) => {
  try {
    const { clientCertPem } = req.body as {
      clientCertPem?: string;
    };

    // mTLS still required in production.
    if (!CCTNS_DEMO_MODE) {
      if (!clientCertPem || !clientCertPem.includes("BEGIN CERTIFICATE")) {
        return res.status(401).json({ error: "mTLS required", message: "Officer client certificate (.pem) required in production mode." });
      }
    }

    const token = `vpn_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`;
    const now = Date.now();
    // Session-bound 6-digit OTP issued at handshake time. Demo gateway
    // displays it on screen; production pushes via SMS/secure channel.
    // Identity binds later, at Officer Sign-In.
    const handshakeOtp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    vpnSessions.set(token, {
      token,
      gateway: VPN_GATEWAY_ID,
      createdAt: now,
      expiresAt: now + VPN_SESSION_TTL_MS,
      mtls: !!clientCertPem,
      demo: CCTNS_DEMO_MODE,
      otp: handshakeOtp,
      otpExpiresAt: now + 10 * 60 * 1000,
    });

    res.cookie("vpn_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: VPN_SESSION_TTL_MS,
    });
    res.setHeader("X-VPN-Session", token);

    await db.audit_logs.insertOne({
      _id: `aud-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
      timestamp: new Date().toISOString(),
      user_name: "anonymous-handshake",
      action: "VPN_TUNNEL_ESTABLISHED",
      details: `Anonymous TLS tunnel established via ${VPN_GATEWAY_ID}${CCTNS_DEMO_MODE ? " (demo gateway)" : ""}${clientCertPem ? " with mTLS" : ""}; handshake OTP issued.`,
      digital_hash: crypto.createHash("sha256").update(`${token}:${now}:VPN`).digest("hex"),
      result: "SUCCESS",
      ip_address: req.ip || "127.0.0.1",
    });

    return res.json({
      success: true,
      vpnSession: token,
      message: "VPN tunnel established",
      gateway: VPN_GATEWAY_ID,
      cipher: "AES-256-GCM",
      protocol: "TLS 1.3",
      demo: CCTNS_DEMO_MODE,
      mtls: !!clientCertPem,
      // Handshake OTP (displayed on the tunnel screen; required at sign-in).
      otp: handshakeOtp,
      otpExpiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/vpn/handshake:", err);
    return res.status(500).json({ error: "VPN handshake service error" });
  }
});

app.post("/api/vpn/disconnect", (req, res) => {
  const sess = getVpnSession(req);
  if (sess) vpnSessions.delete(sess.token);
  res.clearCookie("vpn_session");
  res.json({ success: true, message: "VPN tunnel terminated" });
});

app.get("/api/vpn/status", (req, res) => {
  const sess = getVpnSession(req);
  if (sess) {
    res.json({
      connected: true,
      gateway: sess.gateway,
      cipher: "AES-256-GCM",
      protocol: "TLS 1.3",
      demo: sess.demo,
      mtls: sess.mtls,
      expiresAt: new Date(sess.expiresAt).toISOString(),
    });
  } else {
    res.json({ connected: false });
  }
});

// Mount Routes (protected by VPN middleware)
app.use(vpnGatewayMiddleware);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/migration", migrationRouter);
app.use("/api/cases", casesRouter);
app.use("/api/cases", investigatorRouter);
app.use("/api/cases", proceedingsRouter);
app.use("/api/cases", stagingRouter);
app.use("/api/cases", cyberRouter);
app.use("/api/copilot", copilotRouter);
app.use("/api/cases", copilotRouter); // handles /api/cases/:caseId/query
app.use("/api/sahayak", sahayakRouter);

// API: Streaming Chunked Ingestion (50MB segments, up to 15GB per file).
// Chunks persist to disk under ./uploads, reassemble in order, and the
// completed file is SHA-256 fingerprinted for chain-of-custody. Requires
// VPN tunnel + JWT (mounted after the gateway middleware + auth below).
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const UPLOAD_PARTS = path.join(UPLOAD_ROOT, "chunks");
const UPLOAD_DONE = path.join(UPLOAD_ROOT, "complete");
for (const d of [UPLOAD_ROOT, UPLOAD_PARTS, UPLOAD_DONE]) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {
    /* exists */
  }
}
function safeFileId(v: unknown): string {
  return String(v || `stream-${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || `stream-${Date.now()}`;
}
app.post(
  "/api/upload-chunk",
  express.raw({ type: "application/octet-stream", limit: "55mb" }),
  chunkAuth,
  (req: ChunkReq, res) => {
    try {
      const fileId = safeFileId(req.headers["x-file-id"]);
      const fileName = String(req.headers["x-file-name"] || "evidence.dat").slice(0, 180);
      const chunkIndex = parseInt((req.headers["x-chunk-index"] as string) || "0");
      const totalChunks = parseInt((req.headers["x-total-chunks"] as string) || "1");
      const totalBytes = parseInt((req.headers["x-total-bytes"] as string) || "0");
      const chunk = (req.body as Buffer) || Buffer.alloc(0);
      if (totalBytes > 15 * 1024 * 1024 * 1024) {
        return res.status(413).json({ error: "File exceeds the 15GB exhibit limit." });
      }

      const partPath = path.join(UPLOAD_PARTS, `${fileId}.part`);
      if (chunkIndex === 0) {
        try {
          fs.unlinkSync(partPath);
        } catch {
          /* fresh stream */
        }
      }
      fs.appendFileSync(partPath, chunk);
      const storedBytes = fs.statSync(partPath).size;
      const last = chunkIndex + 1 >= totalChunks;

      if (!last) {
        return res.json({
          success: true,
          fileId,
          fileName,
          chunkIndex,
          totalChunks,
          receivedBytes: chunk.length,
          storedBytes,
          totalBytes,
          status: "STREAMING",
        });
      }

      if (totalBytes > 0 && storedBytes !== totalBytes) {
        return res.status(409).json({
          error: "Reassembly mismatch: stored bytes differ from declared total. Re-stream the file.",
          storedBytes,
          totalBytes,
        });
      }
      const sha256 = crypto.createHash("sha256").update(fs.readFileSync(partPath)).digest("hex");
      const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
      const finalPath = path.join(UPLOAD_DONE, `${fileId}-${safeName}`);
      fs.renameSync(partPath, finalPath);
      return res.json({
        success: true,
        fileId,
        fileName,
        chunkIndex,
        totalChunks,
        receivedBytes: chunk.length,
        storedBytes,
        totalBytes: storedBytes,
        sha256: `sha256:${sha256}`,
        storedPath: finalPath,
        status: "COMPLETE",
      });
    } catch (err) {
      console.error("Error in /api/upload-chunk:", err);
      return res.status(500).json({ error: "Failed to process stream chunk." });
    }
  }
);

// API: AI-Powered Entity Extraction (Multi-provider with resilient fallback)
app.post("/api/extract-entities", async (req, res) => {
  try {
    const { text, sourceDocumentType, engine } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text payload is required." });
    }

    const result = await extractEntitiesUniversal(text, sourceDocumentType || "FIR Report", engine);
    return res.json(result);
  } catch (error: unknown) {
    console.error("Error in /api/extract-entities:", error);
    const msg = error instanceof Error ? error.message : "Failed to extract entities.";
    return res.status(500).json({ error: msg });
  }
});

// API: Rule-Based Entity Extraction (Explicit offline endpoint)
app.post("/api/extract-entities/rule-based", async (req, res) => {
  try {
    const { text, sourceDocumentType } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text payload is required." });
    }

    const docId = `DOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const result = extractEntitiesRuleBased(text, docId, sourceDocumentType || "FIR Report");
    return res.json({ ...result, fallback: true, engine: "LOCAL_OFFLINE" });
  } catch (error: unknown) {
    console.error("Error in /api/extract-entities/rule-based:", error);
    const msg = error instanceof Error ? error.message : "Failed to extract entities with rule-based engine.";
    return res.status(500).json({ error: msg });
  }
});

// API: Automated Court-Ready Intelligence Dossier Generation
app.post(["/api/dossier", "/api/generate-dossier"], async (req, res) => {
  try {
    const { caseDataset, caseTitle, nodes, links, patterns, communities } = req.body;
    const effectiveCase = caseDataset || {
      name: caseTitle || "Syndicate Interdiction",
      codeName: "OP-GARUDA-2026",
      nodes: nodes || [],
      links: links || [],
      firs: [],
      cdrs: [],
      financials: [],
      intels: [],
    };

    // Import dynamically to avoid circular dependency
    const { generateDossierWithGemini } = await import("./src/services/nlpExtractor");

    const dossierText = await generateDossierWithGemini(
      effectiveCase,
      effectiveCase.nodes || [],
      effectiveCase.links || [],
      patterns || [],
      communities || []
    );
    return res.json({ dossier: dossierText, dossierText });
  } catch (error: unknown) {
    console.error("Error in dossier generation:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate intelligence dossier.";
    return res.status(500).json({ error: msg });
  }
});

// Server Initialization
async function startServer() {
  // Initialize Database
  await initDatabase();

  const server = http.createServer(app);

  // Initialize Real-time WebSocket Server
  initWebSocketServer(server);

  if (process.env.NODE_ENV !== "production") {
    viteDevServer = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteDevServer.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[TRINETRA OS] Full-stack Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[TRINETRA OS] VPN gateway mount: ${VPN_GATEWAY_ID} · CCTNS_DEMO_MODE=${CCTNS_DEMO_MODE ? "ON (demo gateway, mTLS optional)" : "OFF (production mTLS enforced)"}`);
    console.log(`[TRINETRA OS] LLM Provider: ${process.env.LLM_PROVIDER || "ollama (default)"}`);
  });
}

startServer();
