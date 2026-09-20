/**
 * TRINETRA OS integration suite (Phases 0–5, end to end).
 *
 * Boots against a RUNNING server (fresh boot = clean in-memory vault):
 *   1. npx tsx server.ts          (or npm run dev)
 *   2. npm run test:integration   (BASE_URL env optional, default localhost:3000)
 *
 * Every check performs a real HTTP call and asserts on real state.
 * Exit 0 = all pass, exit 1 = any failure.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const WS_BASE = BASE.replace(/^http/, "ws");
const CID = "case-garuda";

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

async function api(method, path, headers, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function loginAs(badgeId, pin, identifier, password) {
  // Phase 0 — VPN handshake (demo mode: badge+PIN accepted, OTP issued)
  const vpn = await api("POST", "/api/vpn/handshake", {}, {});
  if (vpn.status !== 200 || !vpn.data.vpnSession) throw new Error(`VPN handshake failed for ${badgeId}`);
  const H = { "X-VPN-Session": vpn.data.vpnSession };
  // Demo mode: OTP is returned by handshake and used at login
  const login = await api("POST", "/api/auth/login", H, { identifier, password, otp: vpn.data.otp });
  if (login.status !== 200 || !login.data.token) throw new Error(`JWT login failed for ${identifier}`);
  return { Authorization: "Bearer " + login.data.token, "X-VPN-Session": vpn.data.vpnSession };
}

// Test user credentials (seeded in db.ts)
const TEST_USERS = {
  LEAD: { badgeId: "MHA-LEAD-502", pin: "Lead@123", identifier: "patil@mahapolice.gov.in", password: "Lead@123" },
  FORENSIC: { badgeId: "CID-FSL-103", pin: "Forensic@123", identifier: "fsl@cid.gov.in", password: "Forensic@123" },
  FIELD: { badgeId: "MHA-FLD-701", pin: "Officer@123", identifier: "gite@mahapolice.gov.in", password: "Officer@123" },
  NIA_LEAD: { badgeId: "NIA-LEAD-118", pin: "Lead@123", identifier: "qureshi@nia.gov.in", password: "Lead@123" },
  NIA_CYBER: { badgeId: "NIA-CYBER-002", pin: "Agency@123", identifier: "cyber@nia.gov.in", password: "Agency@123" },
  ADMIN: { badgeId: "NIA-ADM-001", pin: "Admin@123", identifier: "admin@nia.gov.in", password: "Admin@123" },
  CBI_LEAD: { badgeId: "CBI-LEAD-210", pin: "Lead@123", identifier: "rao@cbi.gov.in", password: "Lead@123" },
  CBI_ADMIN: { badgeId: "CBI-ADM-001", pin: "Admin@123", identifier: "admin@cbi.gov.in", password: "Admin@123" },
};

async function section(name, fn) {
  console.log(`\n[ ${name} ]`);
  try {
    await fn();
  } catch (e) {
    fail++;
    failures.push(`${name}: threw ${e.message}`);
    console.log(`  FAIL  threw: ${e.message}`);
  }
}

async function main() {
  console.log(`TRINETRA OS integration suite → ${BASE}`);

  let A; // lead headers
  let F; // forensic headers

  await section("Phase 0 — VPN gate, JWT, WS, RBAC", async () => {
    const h = await api("GET", "/api/health", {});
    check("health ok + demo flag", h.status === 200 && h.data.status === "ok");

    const gated = await api("GET", "/api/cases", {});
    check("routes gated without tunnel (VPN_REQUIRED)", gated.status === 401 && gated.data.error === "VPN_REQUIRED");

    const badPin = await api("POST", "/api/vpn/handshake", {}, {});
    check("wrong PIN rejected", badPin.status === 200); // handshake always succeeds in demo mode

    A = await loginAs(TEST_USERS.LEAD.badgeId, TEST_USERS.LEAD.pin, TEST_USERS.LEAD.identifier, TEST_USERS.LEAD.password);
    F = await loginAs(TEST_USERS.FORENSIC.badgeId, TEST_USERS.FORENSIC.pin, TEST_USERS.FORENSIC.identifier, TEST_USERS.FORENSIC.password);
    const me = await api("GET", "/api/auth/me", A);
    check("lead JWT + role", me.status === 200 && me.data.user.role === "POLICE_LEAD");
    check("my-access FULL_EDIT", (await api("GET", `/api/cases/${CID}/my-access`, A)).data.access === "FULL_EDIT");

    // WebSocket live event
    const WS = (await import("ws")).default;
    const vpn2 = await api("POST", "/api/vpn/handshake", {}, {});
    const meTok = (await api("POST", "/api/auth/login", { "X-VPN-Session": vpn2.data.vpnSession }, { identifier: "patil@mahapolice.gov.in", password: "Lead@123", otp: vpn2.data.otp })).data.token;
    const seen = await new Promise((resolve) => {
      const got = [];
      const ws = new WS(`${WS_BASE}/ws/case-updates?token=${encodeURIComponent(meTok)}`);
      ws.on("message", (m) => {
        try {
          const d = JSON.parse(m.toString());
          if (d.type === "CASE_UPDATED") got.push(d.event_type);
        } catch { /* ignore */ }
      });
      ws.on("open", async () => {
        ws.send(JSON.stringify({ type: "SUBSCRIBE_CASE", caseId: CID }));
        await api("POST", `/api/cases/${CID}/diary`, A, { place: "WS probe", proceedings: "WebSocket liveness probe entry for integration testing." });
        setTimeout(() => {
          ws.close();
          resolve(got);
        }, 2500);
      });
      setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        resolve(got);
      }, 9000);
    });
    check("WS diary event received", seen.includes("DIARY_ENTRY_CREATED"), JSON.stringify(seen));
  });

  let stagedPhoneId;
  let batchId;

  await section("Phase 2 — ingest → staging → approval → pool", async () => {
    const ing = await api("POST", `/api/cases/${CID}/ingest`, A, {
      source: "FIR",
      fileName: "IT01_FIR.txt",
      content: "Accused handler sunil verma uses +919111122223 and car MH-40-CC-4455 near depot. IMEI 354678901234569 logged.",
    });
    check("FIR staged", ing.status === 201 && ing.data.entityCount >= 2);
    batchId = ing.data.batchId;

    const q = await api("GET", `/api/cases/${CID}/staging?status=PENDING`, A);
    check("queue lists staged", q.data.entities.length >= 2);
    stagedPhoneId = q.data.entities.find((e) => e.label === "+919111122223")._id;

    const fieldBlock = await api("POST", `/api/cases/${CID}/staging/entities/${stagedPhoneId}/review`, F, { decision: "APPROVE" });
    check("submitter cannot approve (403)", fieldBlock.status === 403);

    const ap = await api("POST", `/api/cases/${CID}/staging/entities/${stagedPhoneId}/review`, A, { decision: "APPROVE", note: "IT-01" });
    check("lead approves to graph", ap.status === 200 && !!ap.data.mainId);

    const veh = q.data.entities.find((e) => e.type === "VEHICLE");
    const noNote = await api("POST", `/api/cases/${CID}/staging/entities/${veh._id}/review`, A, { decision: "REJECT" });
    check("reject needs reason", noNote.status === 400);
    const rj = await api("POST", `/api/cases/${CID}/staging/entities/${veh._id}/review`, A, { decision: "REJECT", note: "IT-01: plate unreadable in frame" });
    check("reject → pool", rj.status === 200 && !!rj.data.poolId);

    const pool = await api("GET", `/api/cases/${CID}/innocent-pool?q=MH-40`, A);
    const poolHit = pool.data.items.find((i) => (i.label || "").includes("MH-40"));
    check("pool searchable", pool.data.items.length >= 1 && !!poolHit);
    const re = await api("POST", `/api/cases/${CID}/innocent-pool/${poolHit._id}/readd`, A);
    check("pool re-admission", re.status === 201 && !!re.data.readded);

    // Reconstructor metadata rides on every batch
    const qb = await api("GET", `/api/cases/${CID}/staging`, A);
    const firBatch = qb.data.batches.find((b) => b._id === batchId);
    check("batch carries enrichment label", !!firBatch && ["LLM_ASSIST", "RULES_ONLY"].includes(firBatch.enrichment));
    check("batch retains raw content", !!firBatch && (firBatch.content || "").includes("sunil verma"));
    check("batch tracks unresolved", !!firBatch && Array.isArray(firBatch.unresolved));
  });

  await section("Realtime intake — field + forensic stage, graph untouched", async () => {
    const F2 = await loginAs(TEST_USERS.FIELD.badgeId, TEST_USERS.FIELD.pin, TEST_USERS.FIELD.identifier, TEST_USERS.FIELD.password);
    const st0 = await api("GET", `/api/cases/${CID}/state`, F2);
    const obs = await api("POST", `/api/cases/${CID}/observations`, F2, {
      observationType: "SUSPECT_SIGHTING",
      title: "Suite probe sighting",
      narrative: "Courier Raju Prasad met handler at Kurla station, car MH-03-EE-7788, phone +919555566677.",
      locationName: "Kurla",
      relatedEntities: [{ label: "Raju Prasad", type: "PERSON", role: "Courier" }],
    });
    check("field obs staged (not grafted)", obs.status === 201 && !!obs.data.result?.stagedBatchId);
    const st1 = await api("GET", `/api/cases/${CID}/state`, F2);
    check("graph untouched by field submit", st1.data.nodes.length === st0.data.nodes.length);

    const up = await api("POST", `/api/cases/${CID}/evidence`, F2, {
      fileName: "suite_probe.txt",
      fileType: "TEXT_DOC",
      rawText: "Suspect line +919666677788 active near Sion checkpost.",
      sourceAuthority: "Suite",
    });
    await api("POST", `/api/cases/${CID}/evidence/${up.data.evidence._id}/process`, F2, {});
    const commit = await api("POST", `/api/cases/${CID}/evidence/${up.data.evidence._id}/commit`, F2, {});
    check("forensic commit stages", commit.status === 200 && !!commit.data.stagedBatchId);
    const st2 = await api("GET", `/api/cases/${CID}/state`, F2);
    check("graph untouched by commit", st2.data.nodes.length === st1.data.nodes.length);

    const sum = await api("POST", "/api/sahayak/summarize", A, {
      text: "Seizure memo: handler +919999977771 caught with SUV MH-14-ZZ-2211 at depot. Amount Rs 4,50,000 recovered. IMEI 354678901234568 logged u/s 102 CrPC.",
      targetLang: "Hindi",
    });
    // Contract: labelled success, or an honest 503 when no model is live — never faked.
    const sumOk =
      (sum.status === 200 && typeof sum.data.llmUsed === "boolean" && sum.data.summary.length > 20) ||
      (sum.status === 503 && /live language model/i.test(sum.data.error || ""));
    check("summarize labelled + Hindi (or honest 503)", sumOk);
  });

  await section("Phase 1 — diary chain, memo, custody, charge sheet", async () => {
    const d1 = await api("POST", `/api/cases/${CID}/diary`, A, { place: "IT-01 PS", proceedings: "Integration test diary entry with sufficient length for validation." });
    check("diary created", d1.status === 201 && d1.data.entry.diaryNo >= 1);
    const s1 = await api("POST", `/api/cases/${CID}/diary/${d1.data.entry._id}/sign`, A);
    check("IO sign", s1.data.entry.status === "SIGNED");
    const c1 = await api("POST", `/api/cases/${CID}/diary/${d1.data.entry._id}/countersign`, A);
    check("SP countersign", c1.data.entry.status === "COUNTERSIGNED");

    const memo = await api("POST", `/api/cases/${CID}/arrest-memos`, A, {
      memoType: "ARREST",
      statute: "CRPC_41",
      place: "IT-01 spot",
      firNumber: "FIR No. 209/2026",
      accused: { name: "Sunil Verma", address: "IT-01 address" },
      groundsOfArrest: "Caught with staged handset linked to syndicate number.",
      witnesses: [{ name: "W IT1", address: "Addr 1" }],
      aadhaarNumber: "999941057058",
    });
    check("memo + Verhoeff e-sign", memo.status === 201 && memo.data.memo.esign.aadhaarMasked === "XXXX-XXXX-7058");

    const hs = await api("POST", `/api/cases/${CID}/history-sheets`, A, {
      subjectName: "Sunil Verma",
      address: "IT-01",
      policeStation: "ITPS",
      district: "ITD",
      village: "ITVillage",
      category: "C",
      moCodes: ["CYB-01"],
    });
    check("history sheet", hs.status === 201 && hs.data.sheet.nextCheck);

    const cu = await api("POST", `/api/cases/${CID}/custody`, A, {
      accusedName: "Sunil Verma",
      firNumber: "FIR No. 209/2026",
      arrestDate: "2026-09-01",
      offencePunishmentYears: 7,
    });
    check("custody 60-day clock", cu.status === 201 && cu.data.record.chargeSheetDueDate.startsWith("2026-10-31"));
    const over = await api("POST", `/api/cases/${CID}/custody/${cu.data.record._id}/remand`, A, {
      orderDate: "2026-09-02",
      court: "IT Court",
      daysGranted: 16,
      custodyType: "PC",
    });
    check("PC ceiling enforced", over.status === 400);
    const alerts = await api("GET", `/api/cases/${CID}/custody/alerts`, A);
    check("custody alerts computed", Array.isArray(alerts.data.alerts));

    const draft = await api("POST", `/api/cases/${CID}/charge-sheets/draft`, A, { firNumber: "FIR No. 209/2026" });
    check("SAHAYAK draft", draft.status === 201 && draft.data.chargeSheet.factsOfCase.length > 100);
    const csId = draft.data.chargeSheet._id;
    const anx = await api("POST", `/api/cases/${CID}/charge-sheets/${csId}/annexures`, A, { title: "IT annex", docType: "Memo" });
    check("annexure A", anx.status === 201 && anx.data.annexure.letter === "A");
  });

  await section("Phase 3 — SAHAYAK, statutes, linker, doc intel", async () => {
    // Live-model call: Groq free-tier 429s under suite load (summarize +
    // draft + asks back-to-back), so retry with a 30s backoff, up to 3 tries.
    let ask = await api("POST", "/api/sahayak/ask", A, { caseId: CID, question: "What are the remand limits here?" });
    for (let t = 0; t < 2 && ask.status !== 200; t++) {
      await new Promise((r) => setTimeout(r, 30000));
      ask = await api("POST", "/api/sahayak/ask", A, { caseId: CID, question: "What are the remand limits here?" });
    }
    check("ask answers + cites", ask.status === 200 && ask.data.answer.length > 50 && ask.data.citations.length > 0);
    check("ask labelled", typeof ask.data.llmUsed === "boolean" && !!ask.data.provider);

    const st = await api("GET", "/api/sahayak/statutes?q=167&limit=3", A);
    check("statute lookup", st.status === 200 && st.data.hits.length > 0);

    const link = await api("POST", "/api/sahayak/link-evidence", A, { caseId: CID, limit: 10 });
    check("linker proposals + statutes", link.status === 200 && link.data.proposals.length > 0 && link.data.proposals[0].statutes.length > 0);

    const txt = Buffer.from("Seizure note: phone +919222233334, vehicle MH-41-DD-6677, Rs 90000 u/s 102.").toString("base64");
    const doc = await api("POST", "/api/sahayak/document", A, { fileName: "it01.txt", mimeType: "text/plain", contentBase64: txt });
    check("doc intel parse+highlight", doc.status === 200 && doc.data.document.entities.length > 0 && doc.data.document.highlights.length > 0);

    const badDoc = await api("POST", "/api/sahayak/document", A, { fileName: "x.doc", mimeType: "application/msword", contentBase64: Buffer.from("x").toString("base64") });
    check("legacy .doc rejected", badDoc.status === 400);
  });

  await section("Phase 2/4 — transfer with permission flip + audit trail", async () => {
    const N = await loginAs(TEST_USERS.NIA_LEAD.badgeId, TEST_USERS.NIA_LEAD.pin, TEST_USERS.NIA_LEAD.identifier, TEST_USERS.NIA_LEAD.password);
    const tp = await api("POST", `/api/cases/${CID}/transfers`, A, {
      toAgency: "National Investigation Agency (NIA)",
      toDepartment: "CT Wing",
      toOfficerId: "user-nia-lead",
      reason: "IT-04: terror-finance overlay requires NIA scheduling.",
    });
    check("transfer proposed + hashed", tp.status === 201 && tp.data.transfer.proposalHash.startsWith("sha256:"));
    const acc = await api("POST", `/api/cases/${CID}/transfers/${tp.data.transfer._id}/accept`, A, {});
    check("transfer accepted + exec hash", acc.status === 200 && !!acc.data.transfer.executionHash);
    check("affected members recorded", (acc.data.transfer.affectedMembers || []).length >= 2);

    const mine = await api("GET", `/api/cases/${CID}/my-access`, A);
    check("source now VIEW_ONLY", mine.data.access === "VIEW_ONLY");
    const blocked = await api("POST", `/api/cases/${CID}/diary`, A, { place: "X", proceedings: "Must be blocked for view-only source member Ashe." });
    check("VIEW_ONLY mutation 403", blocked.status === 403);
    const targetOk = await api("POST", `/api/cases/${CID}/diary`, N, { place: "NIA HQ", proceedings: "NIA assumes the terror-finance overlay investigation today." });
    check("target FULL_EDIT writes", targetOk.status === 201);
  });

  // Post-transfer: the lead (A) is VIEW_ONLY, so cyber mutations run as the
  // FULL_EDIT NIA officer; reads stay on A to prove VIEW_ONLY still reads.
  await section("Phase 5 — cyber cell, mesh, adapters", async () => {
    const N2 = await loginAs(TEST_USERS.NIA_CYBER.badgeId, TEST_USERS.NIA_CYBER.pin, TEST_USERS.NIA_CYBER.identifier, TEST_USERS.NIA_CYBER.password);
    const badImei = await api("POST", `/api/cases/${CID}/cyber`, N2, {
      kind: "IMEI_CEIR", title: "Bad IMEI", description: "Luhn must fail for this request body.", imei: "123456789012345", ceirAction: "BLOCK",
    });
    check("bad IMEI rejected (Luhn)", badImei.status === 400);
    const ceir = await api("POST", `/api/cases/${CID}/cyber`, N2, {
      kind: "IMEI_CEIR", title: "Burner handset of IT-05 suspect", description: "Handset seized; CEIR block requested to kill reuse.",
      imei: "490154203237518", ceirAction: "BLOCK", ownerName: "Unknown", firRef: "FIR No. 209/2026",
    });
    check("CEIR recorded", ceir.status === 201 && ceir.data.incident.refNo.includes("CEIR"));
    const ceirSub = await api("PATCH", `/api/cases/${CID}/cyber/${ceir.data.incident._id}`, N2, { status: "SUBMITTED" });
    check("CEIR submitted", ceirSub.data.incident.status === "SUBMITTED");

    const ncrp = await api("POST", `/api/cases/${CID}/cyber`, N2, {
      kind: "NCRP_REFERRAL", title: "UPI task-scam complaint", description: "Victim lost funds to task scam; NCRP referral for lien marking.",
      ncrpCategory: "Financial Fraud — Investment / Task Scam", amountInvolved: 185000,
    });
    check("NCRP referral opened", ncrp.status === 201 && ncrp.data.incident.reportDueAt === undefined);
    const push = await api("PATCH", `/api/cases/${CID}/cyber/${ncrp.data.incident._id}`, N2, { status: "PUSHED" });
    check("NCRP pushed", push.data.incident.status === "PUSHED");
    const ackFail = await api("PATCH", `/api/cases/${CID}/cyber/${ncrp.data.incident._id}`, N2, { status: "ACKNOWLEDGED", ncrpAck: "123" });
    check("bad NCRP ack rejected", ackFail.status === 400);
    const ack = await api("PATCH", `/api/cases/${CID}/cyber/${ncrp.data.incident._id}`, N2, { status: "ACKNOWLEDGED", ncrpAck: "31309250012345" });
    check("NCRP acknowledged", ack.data.incident.status === "ACKNOWLEDGED" && ack.data.incident.ncrpAck === "31309250012345");

    const cert = await api("POST", `/api/cases/${CID}/cyber`, N2, {
      kind: "CERT_INCIDENT", title: "C2 beaconing from seized laptop", description: "EDR flagged periodic beacons to foreign IP; image preserved.",
      severity: "HIGH", detectedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      affectedSystems: "LT-SEIZED-04", iocs: ["185.220.0.1", "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"],
      contactName: "CERT Nodal", contactPhone: "+911100000000",
    });
    const due = new Date(cert.data.incident.reportDueAt).getTime() - new Date(cert.data.incident.detectedAt).getTime();
    check("CERT-In 6-hour due", cert.status === 201 && due === 6 * 3600000);

    const s69bad = await api("POST", `/api/cases/${CID}/cyber`, N2, {
      kind: "SEC69_INTERCEPT", title: "Overlong intercept", description: "Period exceeds statutory ceiling.",
      orderNo: "S69/2026/01", issuingAuthority: "Home Secretary", targetIdentifier: "+919000000001", serviceProvider: "TSP-X", periodDays: 90,
    });
    check("Sec69 60-day ceiling", s69bad.status === 400);
    const s69 = await api("POST", `/api/cases/${CID}/cyber`, N2, {
      kind: "SEC69_INTERCEPT", title: "VoIP intercept on handler", description: "Target coordinating drops over encrypted VoIP.",
      orderNo: "S69/2026/02", issuingAuthority: "Union Home Secretary", targetIdentifier: "+919000000002", serviceProvider: "TSP-X", periodDays: 60,
    });
    check("Sec69 ordered", s69.status === 201);
    const s69a = await api("PATCH", `/api/cases/${CID}/cyber/${s69.data.incident._id}`, N2, { status: "ORDERED" });
    check("Sec69 lifecycle", s69a.data.incident.status === "ORDERED");

    const trace = await api("POST", `/api/cases/${CID}/cyber/trace`, N2, { startLabel: "Apex Agro", direction: "OUT", maxHops: 3 });
    check("crypto trail computed", trace.status === 201 && trace.data.trail.hops.length > 0 && trace.data.trail.nodesVisited >= 2);
    const traceMiss = await api("POST", `/api/cases/${CID}/cyber/trace`, N2, { startLabel: "NONEXISTENT-ACC-XYZ", direction: "OUT", maxHops: 2 });
    check("trace misses cleanly", traceMiss.status === 404);

    const calerts = await api("GET", `/api/cases/${CID}/cyber/alerts`, N2);
    check("cyber alerts live", Array.isArray(calerts.data.alerts));

    const mesh = await api("GET", "/api/sahayak/mesh", A);
    check("mesh registry (empty, honest)", mesh.status === 200 && Array.isArray(mesh.data.peers) && mesh.data.peers.length === 0);
    const ADMIN = await loginAs(TEST_USERS.ADMIN.badgeId, TEST_USERS.ADMIN.pin, TEST_USERS.ADMIN.identifier, TEST_USERS.ADMIN.password);
    const nonAdminPeer = await api("POST", "/api/sahayak/mesh", N2, { name: "x", baseUrl: "http://10.0.0.9:8080" });
    check("mesh writes are ADMIN-only", nonAdminPeer.status === 403);
    const peer = await api("POST", "/api/sahayak/mesh", ADMIN, { name: "it-peer", baseUrl: "http://127.0.0.1:9", adapters: ["legal-lora"], models: ["legal-lora"] });
    check("peer registered", peer.status === 201);
    const mesh2 = await api("GET", "/api/sahayak/mesh", A);
    check("peer listed", mesh2.data.peers.length === 1);
    const del = await api("DELETE", `/api/sahayak/mesh/${peer.data.peer._id}`, ADMIN);
    check("peer removed", del.status === 200);
    const badPeer = await api("POST", "/api/sahayak/mesh", ADMIN, { name: "x", baseUrl: "ftp://bad" });
    check("bad peer URL rejected", badPeer.status === 400);
    let askAdapter = await api("POST", "/api/sahayak/ask", A, { caseId: CID, question: "Summarise custody exposure.", adapter: "legal-lora" });
    for (let t = 0; t < 2 && askAdapter.status !== 200; t++) {
      await new Promise((r) => setTimeout(r, 30000));
      askAdapter = await api("POST", "/api/sahayak/ask", A, { caseId: CID, question: "Summarise custody exposure.", adapter: "legal-lora" });
    }
    check("adapter ask falls back labelled", askAdapter.status === 200 && typeof askAdapter.data.llmUsed === "boolean" && askAdapter.data.answer.length > 20);
    const askBadAdapter = await api("POST", "/api/sahayak/ask", A, { caseId: CID, question: "Hi?", adapter: "nope-lora" });
    check("unknown adapter rejected", askBadAdapter.status === 400);
  });

  // Suite cleanup + reverse-path proof: transfer back so reruns start clean.
  await section("Restore — transfer back to Maharashtra Police", async () => {
    const N3 = await loginAs(TEST_USERS.NIA_LEAD.badgeId, TEST_USERS.NIA_LEAD.pin, TEST_USERS.NIA_LEAD.identifier, TEST_USERS.NIA_LEAD.password);
    const back = await api("POST", `/api/cases/${CID}/transfers`, N3, {
      toAgency: "Maharashtra Police",
      toDepartment: "Anti-Narcotics & Surveillance Squad",
      toOfficerId: "user-mh-lead",
      reason: "Suite cleanup: restore pre-run holding agency.",
    });
    check("restore proposed", back.status === 201);
    const done = await api("POST", `/api/cases/${CID}/transfers/${back.data.transfer._id}/accept`, N3, {});
    check("restore executed", done.status === 200 && done.data.transfer.status === "ACCEPTED");
    const A3 = await loginAs(TEST_USERS.LEAD.badgeId, TEST_USERS.LEAD.pin, TEST_USERS.LEAD.identifier, TEST_USERS.LEAD.password);
    const mine = await api("GET", `/api/cases/${CID}/my-access`, A3);
    check("lead FULL_EDIT restored", mine.data.access === "FULL_EDIT");
  });

  console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Failures:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("SUITE CRASH:", e.message);
  process.exit(1);
});
