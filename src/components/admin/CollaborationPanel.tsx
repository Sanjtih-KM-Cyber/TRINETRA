import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { adminApi, collabApi } from "../../services/api";
import { KNOWN_STATES } from "../../data/roles";
import { Handshake, Inbox, Send, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Item 1 — state-to-state collaboration.
 * This state's Admin requests joint work; the counter-state Admin approves and
 * attaches one of their Leads. Approval seats the Lead on the roster and
 * mirrors every current exhibit across the bridge.
 */
export const CollaborationPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { user } = useAuth();
  const myState = String((user as any)?.state || "").toUpperCase();
  const [cases, setCases] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [outbox, setOutbox] = useState<any[]>([]);

  const [caseId, setCaseId] = useState("");
  const [toState, setToState] = useState("");
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const [c, ib, ob, u] = await Promise.all([
        adminApi.getCases(),
        collabApi.inbox().catch(() => ({ requests: [] })),
        collabApi.outbox().catch(() => ({ requests: [] })),
        adminApi.getUsers().catch(() => ({ users: [] })),
      ]);
      setCases(c.cases || []);
      setInbox(ib.requests || []);
      setOutbox(ob.requests || []);
      setLeads((u.users || []).filter((x: any) => String(x.role).endsWith("_LEAD") && x.status === "ACTIVE"));
    } catch {
      /* panel degrades */
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await collabApi.request({ caseId, toState, message });
      setMsg({ ok: true, text: `Collaboration requested from ${toState} Admin.` });
      setCaseId("");
      setToState("");
      setMessage("");
      await load();
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Request failed." });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, approve: boolean) => {
    if (busy) return;
    if (approve && !attach[id]) {
      setMsg({ ok: false, text: "Pick one of your Leads to attach before approving." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (approve) {
        const res = await collabApi.approve(id, attach[id]);
        setMsg({ ok: true, text: `${res.attachedLead} seated on the roster; ${res.exhibitsShared} exhibits mirrored.` });
      } else {
        await collabApi.reject(id);
        setMsg({ ok: true, text: "Collaboration request rejected." });
      }
      await load();
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Decision failed." });
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
          <Handshake className="w-5 h-5 text-amber-400" /> State Collaboration ({myState})
        </h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Request joint work from another state. Their Admin approves and attaches a Lead — both Leads then share the case files.
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <form onSubmit={send} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5 text-amber-400" /> Request collaboration
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">My state's case</span>
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)} required className={inputCls}>
              <option value="">Select case…</option>
              {cases.map((c: any) => (
                <option key={c.id} value={c.id}>{c.codeName} · {c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">Counter-state</span>
            <select value={toState} onChange={(e) => setToState(e.target.value)} required className={inputCls}>
              <option value="">Select state…</option>
              {KNOWN_STATES.filter((s) => s.code !== myState).map((s) => (
                <option key={s.code} value={s.code}>{s.label} ({s.code})</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-400">Joint-operation note</span>
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Why joint jurisdiction is needed…" className={inputCls} />
        </label>
        <button type="submit" disabled={busy || !caseId || !toState} className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40">
          Send request
        </button>
      </form>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Inbox className="w-3.5 h-3.5 text-cyan-400" /> Inbox — requests to {myState} ({inbox.filter((r) => r.status === "PENDING").length} pending)
        </h3>
        {inbox.length === 0 ? (
          <p className="text-xs text-slate-500">No incoming collaboration requests.</p>
        ) : (
          <div className="space-y-2.5">
            {inbox.map((r) => (
              <div key={r._id} className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono font-bold text-amber-300">{r.case_code}</span>
                  <span className="text-slate-300">from {r.from_state} · {r.requested_by}</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded border ${r.status === "PENDING" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : r.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-rose-500/15 text-rose-300 border-rose-500/40"}`}>
                    {r.status}
                  </span>
                </div>
                {r.message && <p className="text-[11px] text-slate-400">{r.message}</p>}
                {r.attached_lead_name && <p className="text-[11px] font-mono text-emerald-300">Attached Lead: {r.attached_lead_name}</p>}
                {r.status === "PENDING" && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={attach[r._id] || ""}
                      onChange={(e) => setAttach((a) => ({ ...a, [r._id]: e.target.value }))}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">Attach one of my Leads…</option>
                      {leads.map((l: any) => (
                        <option key={l._id} value={l._id}>{l.name} ({l.official_id})</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => decide(r._id, true)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold disabled:opacity-40">Approve + Attach</button>
                      <button onClick={() => decide(r._id, false)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 disabled:opacity-40">Reject</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {outbox.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Sent ({outbox.length})</h3>
          {outbox.map((r) => (
            <div key={r._id} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
              <span className="text-slate-300 font-mono">{r.case_code} → {r.to_state}</span>
              <span className="font-mono text-slate-400">{r.status}{r.attached_lead_name ? ` · ${r.attached_lead_name}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CollaborationPanel;
