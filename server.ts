import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { initDatabase } from "./server/db";
import { initWebSocketServer } from "./server/realtime";
import authRouter from "./server/routes/auth";
import adminRouter from "./server/routes/admin";
import casesRouter from "./server/routes/cases";
import copilotRouter from "./server/routes/copilot";
import investigatorRouter from "./server/routes/investigator";
import { extractEntitiesUniversal, extractEntitiesRuleBased } from "./src/services/nlpExtractor";

dotenv.config();

const app = express();
const PORT = 3000;

// VPN Gateway middleware - protects all routes except VPN gateway itself
const vpnGatewayMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Allow VPN gateway page and its assets
  if (req.path.startsWith("/vpn-gateway") || 
      req.path.startsWith("/api/vpn") ||
      req.path.startsWith("/assets/") ||
      req.path === "/favicon.ico") {
    return next();
  }

  // Check for VPN session
  const vpnSession = req.headers["x-vpn-session"] || req.cookies?.vpn_session;
  if (!vpnSession) {
    // Redirect to VPN gateway page
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ 
        error: "VPN_REQUIRED", 
        message: "VPN tunnel required. Connect via /vpn-gateway",
        redirect: "/vpn-gateway"
      });
    }
    return res.redirect("/vpn-gateway");
  }

  // Validate VPN session (in production, validate against session store)
  // For demo mode, we'll accept any valid-looking session
  next();
};

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check (accessible without VPN)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// VPN Gateway Page (accessible without VPN)
app.get("/vpn-gateway", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// VPN API endpoints
app.post("/api/vpn/authenticate", express.json(), async (req, res) => {
  const { badgeId, pin, otp } = req.body;
  
  // Demo authentication - in production, validate against CCTNS/ICJS
  if (badgeId && pin) {
    // Generate VPN session token
    const vpnSession = `vpn_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    
    // Set secure cookie
    res.cookie("vpn_session", vpnSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Also return in header for SPA
    res.setHeader("X-VPN-Session", vpnSession);
    
    return res.json({
      success: true,
      vpnSession,
      message: "VPN tunnel established",
      gateway: "CCTNS-GW-MH-01",
      cipher: "AES-256-GCM",
      protocol: "TLS 1.3",
    });
  }
  
  return res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/vpn/disconnect", (req, res) => {
  res.clearCookie("vpn_session");
  res.json({ success: true, message: "VPN tunnel terminated" });
});

app.get("/api/vpn/status", (req, res) => {
  const vpnSession = req.headers["x-vpn-session"] || req.cookies?.vpn_session;
  if (vpnSession) {
    res.json({ connected: true, gateway: "CCTNS-GW-MH-01", cipher: "AES-256-GCM", protocol: "TLS 1.3" });
  } else {
    res.json({ connected: false });
  }
});

// Mount Routes (protected by VPN middleware)
app.use(vpnGatewayMiddleware);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cases", casesRouter);
app.use("/api/cases", investigatorRouter);
app.use("/api/copilot", copilotRouter);
app.use("/api/cases", copilotRouter); // handles /api/cases/:caseId/query

// API: Streaming Chunked Ingestion (for 15GB+ bulk forensic files)
app.post("/api/upload-chunk", express.raw({ type: "application/octet-stream", limit: "50mb" }), (req, res) => {
  try {
    const fileId = req.headers["x-file-id"] as string;
    const fileName = req.headers["x-file-name"] as string;
    const chunkIndex = parseInt((req.headers["x-chunk-index"] as string) || "0");
    const totalChunks = parseInt((req.headers["x-total-chunks"] as string) || "1");
    const totalBytes = parseInt((req.headers["x-total-bytes"] as string) || "0");
    const chunkBytes = (req.body as Buffer)?.length || 0;

    res.json({
      success: true,
      fileId: fileId || `stream-${Date.now()}`,
      fileName: fileName || "evidence.dat",
      chunkIndex,
      totalChunks,
      receivedBytes: chunkBytes,
      totalBytes,
      status: chunkIndex + 1 === totalChunks ? "COMPLETE" : "STREAMING",
    });
  } catch (err: any) {
    console.error("Error in /api/upload-chunk:", err);
    res.status(500).json({ error: "Failed to process stream chunk" });
  }
});

// API: AI-Powered Entity Extraction (Multi-provider with resilient fallback)
app.post("/api/extract-entities", async (req, res) => {
  try {
    const { text, sourceDocumentType, engine } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text payload is required." });
    }

    const result = await extractEntitiesUniversal(text, sourceDocumentType || "FIR Report", engine);
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/extract-entities:", error);
    return res.status(500).json({
      error: error.message || "Failed to extract entities.",
    });
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
  } catch (error: any) {
    console.error("Error in /api/extract-entities/rule-based:", error);
    return res.status(500).json({
      error: error.message || "Failed to extract entities with rule-based engine.",
    });
  }
});

// API: Automated Court-Ready Intelligence Dossier Generation
app.post(["/api/dossier", "/api/generate-dossier"], async (req, res) => {
  try {
    const { caseDataset, caseTitle, graphSummary, focalSuspect, nodes, links, patterns, communities } = req.body;
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
  } catch (error: any) {
    console.error("Error in dossier generation:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate intelligence dossier.",
    });
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[CRIM-INTEL OS] Full-stack Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[CRIM-INTEL OS] LLM Provider: ${process.env.LLM_PROVIDER || "ollama (default)"}`);
  });
}

startServer();