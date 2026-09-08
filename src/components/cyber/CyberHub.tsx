import React, { useState } from "react";
import { cyberApi } from "../../services/api";
import { DataRequestInbox } from "../requisitions/DataRequestInbox";
import { validateImei, validateNcrpAck } from "../../services/imei";
import { NCRP_CATEGORIES } from "../../data/cyberMasters";
import { DictationField } from "../proceedings/DictationField";
import {
  Radar, ShieldAlert, FileWarning, Scale, Fingerprint, Coins, Smartphone,
  Plus, Loader2, AlertCircle, AlertTriangle, ChevronDown,
} from "lucide-react";

interface CyberHubProps {
  caseId: string;
  readOnly: boolean;
  signal: number;
  onChanged: () => void;
  /** Phase 2 Req9-11 — agency cyber focus line (CBI financial/crypto, NIA dark-web, CID phishing). */
  focusLine?: string;
}

type SubTab = "ncrp" | "cert" | "sec69" | "trace" | "ceir" | "corr";

const KIND_OF: Record<Exclude<SubTab, "corr">, string> = {
  ncrp: "NCRP_REFERRAL",
  cert: "CERT_INCIDENT",
  sec69: "SEC69_INTERCEPT",
  trace: "CRYPTO_TRAIL",
  ceir: "IMEI_CEIR",
};

export const CyberHub: React.FC<CyberHubProps> = ({ caseId, readOnly, signal, onChanged, focusLine }) => {
  const [subTab, setSubTab] = useState<SubTab>("ncrp");
  const [incidents, setIncidents] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [burnerCount, setBurnerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [form, setForm] = useState<any>({});
  const [traceForm, setTraceForm] = useState({ startLabel: "", direction: "BOTH", maxHops: "3" });
  const [traceResult, setTraceResult] = useState<any | null>(null);
  const [ackFor, setAckFor] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (subTab === "corr") {
        const [corr, al] = await Promise.all([
          cyberApi.correlate(caseId),
          cyberApi.alerts(caseId),
        ]);
        setClusters(corr.clusters || []);
        setBurnerCount(corr.burnerCount || 0);
        setAlerts(al.alerts || []);
      } else {
        const [list, al] = await Promise.all([
          cyberApi.list(caseId, KIND_OF[subTab]),
          cyberApi.alerts(caseId),
        ]);
        setIncidents(list.incidents || []);
        setAlerts(al.alerts || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load cyber cell.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, subTab, signal]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Operation failed.");
    } finally {
      setBusy(null);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (subTab === "corr" || subTab === "trace") return;
    run("create", async () => {
      await cyberApi.create(caseId, { kind: KIND_OF[subTab], ...form });
      setShowForm(false);
      setForm({});
    });
  };

  const advance = (id: string, status: string, extra: any = {}) =>
    run(id + status, () => cyberApi.setStatus(caseId, id, { status, ...extra }).then(() => undefined));

  const runTrace = (e: React.FormEvent) => {
    e.preventDefault();
    run("trace", async () => {
      const res = await cyberApi.trace(caseId, {
        startLabel: traceForm.startLabel,
        direction: traceForm.direction as "IN" | "OUT" | "BOTH",
        maxHops: Number(traceForm.maxHops) || 3,
      });
      setTraceResult(res.trail);
      await load();
    });
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const tabs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
    { id: "ncrp", label: "NCRP Push", icon: <FileWarning className="w-4 h-4" /> },
    { id: "cert", label: "CERT-In 6Hr", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "sec69", label: "Sec 69 Intercept", icon: <Scale className="w-4 h-4" /> },
    { id: "trace", label: "Crypto Trace", icon: <Coins className="w-4 h-4" /> },
    { id: "ceir", label: "IMEI / CEIR", icon: <Fingerprint className="w-4 h-4" /> },
    { id: "corr", label: "Burner Correlator", icon: <Smartphone className="w-4 h-4" /> },
  ];

  const nextStatuses = (inc: any): string[] => {
    const flows: Record<string, string[]> = {
      NCRP_REFERRAL: ["DRAFT", "PUSHED", "ACKNOWLEDGED", "CLOSED"],
      CERT_INCIDENT: ["OPEN", "REPORTED", "MITIGATING", "CLOSED"],
      SEC69_INTERCEPT: ["DRAFT", "ORDERED", "ACTIVE", "EXPIRED", "REVOKED"],
      IMEI_CEIR: ["DRAFT", "SUBMITTED", "BLOCKED", "UNBLOCKED"],
      CRYPTO_TRAIL: ["COMPUTED", "SHARED", "CLOSED"],
    };
    const flow = flows[inc.kind] || [];
    const i = flow.indexOf(inc.status);
    if (i < 0 || i >= flow.length - 1) return [];
    if (inc.kind === "IMEI_CEIR" && inc.status === "BLOCKED") return ["UNBLOCKED"];
    return [flow[i + 1]];
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
          <Radar className="w-5 h-5 text-cyan-400" /> Cyber Crime Cell
        </h2>
        <p className="text-[11px] text-slate-400 font-mono">NCRP referrals · CERT-In 6-hour reports · Sec 69 intercepts · fund trails · CEIR · burner correlator</p>
        {focusLine && <p className="text-[11px] font-mono text-cyan-300/90 mt-1">{focusLine}</p>}
      </div>

      {alerts.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Cyber clocks ({alerts.length})
          </div>
          <div className="space-y-1.5">
            {alerts.map((a: any, i: number) => (
              <div key={i} className={`text-[11px] rounded-lg border px-2.5 py-2 ${a.severity === "CRITICAL" ? "bg-rose-500/10 border-rose-500/40 text-rose-200" : a.severity === "HIGH" ? "bg-amber-500/10 border-amber-500/40 text-amber-200" : "bg-slate-800/50 border-slate-700 text-slate-300"}`}>
                <b className="font-mono">[{a.severity}]</b> {a.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setShowForm(false); setTraceResult(null); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
              subTab === t.id ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40" : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        {!readOnly && subTab !== "trace" && subTab !== "corr" && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary !py-2 ml-auto whitespace-nowrap">
            <Plus className="w-4 h-4" /> {showForm ? "Close" : "New Record"}
          </button>
        )}
      </div>

      {/* ---- Burner Swap Correlator ---- */}
      {subTab === "corr" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400" /> Shared-IMEI hardware ({burnerCount} burner handsets)
            </h3>
            <span className="text-[10px] font-mono text-slate-500">≥2 MSISDNs on one handset</span>
          </div>
          {loading ? (
            <p className="text-[11px] font-mono text-slate-500">Correlating telecom logs…</p>
          ) : clusters.length === 0 ? (
            <p className="text-[11px] text-slate-500">No IMEI hardware footprints in this case's CDR set.</p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {clusters.map((c) => (
                <div key={c.imei} className={`rounded-xl border p-3 ${c.burner ? "bg-amber-500/5 border-amber-500/40" : "bg-slate-950 border-slate-800"}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-100">IMEI {c.imei}</span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${c.burner ? "bg-rose-500/15 text-rose-300 border-rose-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                      {c.burner ? `BURNER · ${c.msisdnCount} SIMs` : `${c.msisdnCount} SIM`}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] font-mono text-slate-300 break-all">{c.msisdns.join(" · ")}</div>
                  <div className="mt-1 text-[10px] font-mono text-slate-500">
                    {c.rows} rows · {(c.towers || []).slice(0, 4).join(" / ")}{(c.towers || []).length > 4 ? ` +${c.towers.length - 4} sectors` : ""} · {String(c.firstSeen || "").slice(0, 10)} → {String(c.lastSeen || "").slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ---- Trace runner ---- */}
      {subTab === "trace" && (
        <form onSubmit={runTrace} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input required value={traceForm.startLabel} onChange={(e) => setTraceForm({ ...traceForm, startLabel: e.target.value })}
              placeholder="Start account / VPA / address *" disabled={readOnly} className={`${inputCls} font-mono sm:col-span-2`} />
            <select value={traceForm.direction} onChange={(e) => setTraceForm({ ...traceForm, direction: e.target.value })} disabled={readOnly} className={inputCls}>
              <option value="BOTH">Both directions</option>
              <option value="OUT">Outflows only</option>
              <option value="IN">Inflows only</option>
            </select>
            <select value={traceForm.maxHops} onChange={(e) => setTraceForm({ ...traceForm, maxHops: e.target.value })} disabled={readOnly} className={inputCls}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>≤ {n} hops</option>)}
            </select>
          </div>
          <button type="submit" disabled={busy === "trace" || readOnly} className="btn-primary w-full disabled:opacity-50">
            {busy === "trace" ? <><Loader2 className="w-4 h-4 animate-spin" /> Tracing fund graph…</> : <><Coins className="w-4 h-4" /> Trace & Persist Trail Record</>}
          </button>
          {traceResult && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-[11px] space-y-1.5">
              <div className="font-mono text-slate-300">
                {traceResult.nodesVisited} accounts · {traceResult.hops.length} transfers · In ₹{(traceResult.totalIn || 0).toLocaleString("en-IN")} · Out ₹{(traceResult.totalOut || 0).toLocaleString("en-IN")}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {(traceResult.hops || []).map((h: any, i: number) => (
                  <div key={i} className="font-mono text-slate-400 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
                    <span className="text-cyan-300">H{h.hop}</span> {h.fromLabel} → {h.toLabel}
                    {h.amount ? <span className="text-amber-300"> · ₹{Number(h.amount).toLocaleString("en-IN")}</span> : null}
                    {h.frequency ? <span> · ×{h.frequency}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      )}

      {/* ---- Create form ---- */}
      {showForm && subTab !== "trace" && subTab !== "corr" && (
        <form onSubmit={create} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input required value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Title *" className={inputCls} />
            {subTab === "ncrp" && (
              <>
                <select required value={form.ncrpCategory || ""} onChange={(e) => set("ncrpCategory", e.target.value)} className={inputCls}>
                  <option value="">NCRP category *</option>
                  {NCRP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={form.amountInvolved || ""} onChange={(e) => set("amountInvolved", e.target.value)} placeholder="Amount involved ₹ (optional)" inputMode="numeric" className={inputCls} />
                <input value={form.ncrpAck || ""} onChange={(e) => set("ncrpAck", e.target.value)}
                  placeholder="NCRP ack (14 digits, if received)" className={`${inputCls} font-mono`}
                  title="14 digits starting with 3" />
              </>
            )}
            {subTab === "cert" && (
              <>
                <select required value={form.severity || ""} onChange={(e) => set("severity", e.target.value)} className={inputCls}>
                  <option value="">Severity *</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
                <input required type="datetime-local" value={form.detectedAt || ""} onChange={(e) => set("detectedAt", e.target.value)} className={inputCls} title="Detection time — 6-hour clock starts here" />
                <input value={form.affectedSystems || ""} onChange={(e) => set("affectedSystems", e.target.value)} placeholder="Affected systems" className={inputCls} />
                <input value={form.contactName || ""} onChange={(e) => set("contactName", e.target.value)} placeholder="Contact person" className={inputCls} />
                <input value={form.iocs || ""} onChange={(e) => set("iocs", e.target.value)} placeholder="IOCs (comma separated IPs/hashes/URLs)" className={`${inputCls} font-mono`} />
                <input value={form.contactPhone || ""} onChange={(e) => set("contactPhone", e.target.value)} placeholder="Contact phone" className={`${inputCls} font-mono`} />
              </>
            )}
            {subTab === "sec69" && (
              <>
                <input required value={form.orderNo || ""} onChange={(e) => set("orderNo", e.target.value)} placeholder="Order No. *" className={`${inputCls} font-mono`} />
                <input required value={form.issuingAuthority || ""} onChange={(e) => set("issuingAuthority", e.target.value)} placeholder="Issuing authority (Home Secretary) *" className={inputCls} />
                <input required value={form.targetIdentifier || ""} onChange={(e) => set("targetIdentifier", e.target.value)} placeholder="Target (phone/email/IP) *" className={`${inputCls} font-mono`} />
                <input required value={form.serviceProvider || ""} onChange={(e) => set("serviceProvider", e.target.value)} placeholder="Service provider / TSP *" className={inputCls} />
                <input required value={form.periodDays || ""} onChange={(e) => set("periodDays", e.target.value)} placeholder="Period days (1–60) *" inputMode="numeric" className={inputCls} />
              </>
            )}
            {subTab === "ceir" && (
              <>
                <select required value={form.ceirAction || ""} onChange={(e) => set("ceirAction", e.target.value)} className={inputCls}>
                  <option value="">CEIR action *</option>
                  <option value="BLOCK">Block (lost/stolen)</option>
                  <option value="UNBLOCK">Unblock (recovered)</option>
                  <option value="TRACK">Track (surveillance)</option>
                </select>
                <input required value={form.imei || ""} onChange={(e) => set("imei", e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="15-digit IMEI (Luhn-checked) *" inputMode="numeric" className={`${inputCls} font-mono tracking-widest`} />
                <input value={form.ownerName || ""} onChange={(e) => set("ownerName", e.target.value)} placeholder="Owner name" className={inputCls} />
                <input value={form.firRef || ""} onChange={(e) => set("firRef", e.target.value)} placeholder="FIR ref" className={`${inputCls} font-mono`} />
              </>
            )}
          </div>
          <DictationField label="Description" value={form.description || ""} onChange={(v) => set("description", v)} rows={3} required
            placeholder="Full particulars — what, where, systems, loss…" />
          {subTab === "ceir" && form.imei && (
            <div className={`text-[11px] font-mono ${validateImei(form.imei).ok ? "text-emerald-300" : "text-rose-300"}`}>
              {validateImei(form.imei).ok ? "✓" : "✗"} {validateImei(form.imei).reason}
            </div>
          )}
          {subTab === "ncrp" && form.ncrpAck && (
            <div className={`text-[11px] font-mono ${validateNcrpAck(form.ncrpAck).ok ? "text-emerald-300" : "text-rose-300"}`}>
              {validateNcrpAck(form.ncrpAck).ok ? "✓" : "✗"} {validateNcrpAck(form.ncrpAck).reason}
            </div>
          )}
          <button type="submit" disabled={busy === "create"} className="btn-primary w-full">
            {busy === "create" ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording…</> : <><Plus className="w-4 h-4" /> Record (server-validated)</>}
          </button>
        </form>
      )}

      {/* ---- Records ---- */}
      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading cyber records…</div>
      ) : incidents.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">No {KIND_OF[subTab].replace(/_/g, " ")} records yet.</div>
      ) : (
        <div className="space-y-2.5">
          {incidents.map((inc: any) => (
            <div key={inc._id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-100 font-mono">{inc.refNo}</span>
                <span className="text-xs text-slate-300">{inc.title}</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-700 ml-auto">{inc.status}</span>
                <button onClick={() => setExpanded(expanded === inc._id ? null : inc._id)} className="btn-ghost !p-1">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded === inc._id ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 whitespace-pre-wrap">{inc.description}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] font-mono text-slate-500">
                {inc.ncrpCategory && <span>NCRP: {inc.ncrpCategory}</span>}
                {inc.ncrpAck && <span>Ack: {inc.ncrpAck}</span>}
                {inc.amountInvolved !== undefined && <span>₹{Number(inc.amountInvolved).toLocaleString("en-IN")}</span>}
                {inc.severity && <span>Severity: {inc.severity}</span>}
                {inc.reportDueAt && <span className="text-amber-300">Report due: {String(inc.reportDueAt).slice(0, 16).replace("T", " ")}</span>}
                {inc.orderNo && <span>Order: {inc.orderNo} · {inc.targetIdentifier} · {inc.periodDays}d</span>}
                {inc.imei && <span>IMEI: {inc.imei} · {inc.ceirAction}</span>}
                {inc.trailResult && <span>Trail: {inc.trailResult.hops.length} hops · {inc.trailResult.nodesVisited} accounts</span>}
              </div>
              {expanded === inc._id && inc.trailResult && (
                <div className="mt-2 rounded-xl bg-slate-950 border border-slate-800 p-3 max-h-56 overflow-y-auto space-y-1">
                  {(inc.trailResult.hops || []).map((h: any, i: number) => (
                    <div key={i} className="text-[11px] font-mono text-slate-400">
                      <span className="text-cyan-300">H{h.hop}</span> {h.fromLabel} → {h.toLabel}
                      {h.amount ? <span className="text-amber-300"> · ₹{Number(h.amount).toLocaleString("en-IN")}</span> : null}
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && nextStatuses(inc).length > 0 && (
                <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                  {inc.kind === "NCRP_REFERRAL" && inc.status === "PUSHED" && (
                    <input
                      value={ackFor[inc._id] || ""}
                      onChange={(e) => setAckFor({ ...ackFor, [inc._id]: e.target.value.replace(/\D/g, "").slice(0, 14) })}
                      placeholder="NCRP ack (14 digits)"
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 w-44"
                    />
                  )}
                  {nextStatuses(inc).map((s) => (
                    <button
                      key={s}
                      onClick={() => advance(inc._id, s, s === "ACKNOWLEDGED" ? { ncrpAck: ackFor[inc._id] } : {})}
                      disabled={busy === inc._id + s}
                      className="btn-secondary !py-1.5 disabled:opacity-50"
                    >
                      {busy === inc._id + s ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} → {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Phase 4 Req22 — Lead data requisitions assigned to CYBER */}
      <DataRequestInbox caseId={caseId} ownFunctional="CYBER" />
    </div>
  );
};

export default CyberHub;
