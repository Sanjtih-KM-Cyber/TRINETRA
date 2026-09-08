/**
 * SAHAYAK eval harness — measures answer quality, not just uptime.
 *
 *   1. npx tsx server.ts            (fresh boot = seeded case-garuda)
 *   2. npm run test:eval            (BASE_URL env optional)
 *
 * Scores every golden case on citation recall + keyword coverage +
 * confidence floor, prints a table, writes a JSON report, and exits 1
 * when the pass rate falls below the golden threshold.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3000";
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, "eval-golden.json"), "utf8"));

async function api(method, urlPath, headers, body, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + urlPath, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function hitLabel(t) {
  return Array.isArray(t) ? t.join("/") : String(t);
}

function matches(hay, t) {
  const alts = Array.isArray(t) ? t : [t];
  return alts.some((a) => hay.includes(String(a).toLowerCase()));
}

function scoreCase(g, answer) {
  const hay = `${answer.answer || ""}\n${(answer.citations || []).join("\n")}`.toLowerCase();
  const citeHits = (g.mustCite || []).filter((t) => matches(hay, t)).map(hitLabel);
  const citeRecall = (g.mustCite || []).length === 0 ? 1 : citeHits.length / g.mustCite.length;
  const kwHits = (g.mustMention || []).filter((t) => matches(hay, t)).map(hitLabel);
  const coverage = (g.mustMention || []).length === 0 ? 1 : kwHits.length / g.mustMention.length;
  const confOk = (answer.confidence ?? 0) >= (g.minConfidence ?? 0.5);
  const pass = citeRecall >= 0.5 && coverage >= 0.5 && confOk;
  return {
    id: g.id,
    pass,
    citeRecall: +citeRecall.toFixed(2),
    citeHits,
    citeMiss: (g.mustCite || []).filter((t) => !matches(hay, t)).map(hitLabel),
    coverage: +coverage.toFixed(2),
    kwMiss: (g.mustMention || []).filter((t) => !matches(hay, t)).map(hitLabel),
    confOk,
    confidence: answer.confidence,
    llmUsed: !!answer.llmUsed,
    provider: answer.provider,
  };
}

async function main() {
  console.log(`SAHAYAK eval → ${BASE} (${GOLDEN.cases.length} golden cases, threshold ${GOLDEN.passThreshold})`);

  const vpn = await api("POST", "/api/vpn/authenticate", {}, { badgeId: "NCRB-ADM-001", pin: "Admin@123" });
  if (vpn.status !== 200) throw new Error("VPN auth failed");
  const H = { "X-VPN-Session": vpn.data.vpnSession };
  const login = await api("POST", "/api/auth/login", H, { identifier: "admin@ncrb.gov.in", password: "Admin@123" });
  if (login.status !== 200) throw new Error("admin login failed");
  const A = { Authorization: "Bearer " + login.data.token, "X-VPN-Session": vpn.data.vpnSession };

  const results = [];
  for (const g of GOLDEN.cases) {
    const t0 = Date.now();
    let row;
    try {
      const r = await api("POST", "/api/sahayak/ask", A, { caseId: GOLDEN.caseId, question: g.question });
      if (r.status !== 200) {
        row = { id: g.id, pass: false, error: r.data.error || `HTTP ${r.status}`, latencyMs: Date.now() - t0 };
      } else {
        row = {
          ...scoreCase(g, r.data),
          latencyMs: Date.now() - t0,
          answerExcerpt: String(r.data.answer || "").slice(0, 300),
        };
      }
    } catch (e) {
      row = { id: g.id, pass: false, error: String(e.message || e), latencyMs: Date.now() - t0 };
    }
    results.push(row);
    const flag = row.pass ? "PASS" : "FAIL";
    console.log(
      `  ${flag}  ${row.id}  cite=${row.citeRecall ?? "-"} cov=${row.coverage ?? "-"} ` +
      `llm=${row.llmUsed ?? "-"} ${row.latencyMs}ms` +
      (row.pass ? "" : `  miss=[${[...(row.citeMiss || []), ...(row.kwMiss || [])].join(", ")}]${row.error ? " err=" + row.error : ""}`)
    );
  }

  const passed = results.filter((r) => r.pass).length;
  const passRate = passed / results.length;
  const llmRate = results.filter((r) => r.llmUsed).length / results.length;
  const avgCite = results.reduce((s, r) => s + (r.citeRecall || 0), 0) / results.length;
  const avgCov = results.reduce((s, r) => s + (r.coverage || 0), 0) / results.length;
  const avgLat = Math.round(results.reduce((s, r) => s + (r.latencyMs || 0), 0) / results.length);

  console.log(`\nEVAL: ${passed}/${results.length} passed (rate ${passRate.toFixed(2)}, need ≥ ${GOLDEN.passThreshold})`);
  console.log(`  citation recall ${avgCite.toFixed(2)} · keyword coverage ${avgCov.toFixed(2)} · llm share ${llmRate.toFixed(2)} · avg latency ${avgLat}ms`);

  const report = {
    at: new Date().toISOString(),
    passRate: +passRate.toFixed(2),
    threshold: GOLDEN.passThreshold,
    aggregates: { avgCite: +avgCite.toFixed(2), avgCoverage: +avgCov.toFixed(2), llmRate: +llmRate.toFixed(2), avgLatencyMs: avgLat },
    results,
  };
  const outDir = "C:/Users/Sanji/AppData/Local/Temp/opencode";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/sahayak-eval-report.json`, JSON.stringify(report, null, 2));
  console.log(`  report: ${outDir}/sahayak-eval-report.json`);

  if (passRate < GOLDEN.passThreshold) {
    console.log("EVAL FAILED — below threshold.");
    process.exit(1);
  }
  console.log("EVAL PASSED.");
}

main().catch((e) => {
  console.error("EVAL CRASH:", e.message);
  process.exit(1);
});
