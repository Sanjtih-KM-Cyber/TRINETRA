import React, { useState, useEffect } from "react";
import { caseApi } from "../../services/api";
import { Send, CheckCircle2, AlertTriangle } from "lucide-react";

interface DataRequestInboxProps {
  caseId: string;
  /** Assignee's functional (CYBER/FORENSIC/FIELD) — inbox filters to it. Null = show all. */
  ownFunctional?: "CYBER" | "FORENSIC" | "FIELD" | null;
  /** Leads/Admins may issue new data requisitions from here. */
  canIssue?: boolean;
  onChanged?: () => void;
}

/**
 * Phase 4 Req22 — structured data/evidence requisition pipeline.
 * Leads issue formal requests to assigned personnel; assignees fulfill after upload.
 */
export const DataRequestInbox: React.FC<DataRequestInboxProps> = ({
  caseId,
  ownFunctional = null,
  canIssue = false,
  onChanged,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [target, setTarget] = useState("FORENSIC");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isOverdue = (r: any) =>
    r.status === "PENDING" && r.deadline && new Date(r.deadline).getTime() < Date.now() - 86400000;

  const load = async () => {
    try {
      const res = await caseApi.getDataRequests(caseId);
      setItems(res.requisitions || []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
    // Live directive feed: assignees see new Lead requisitions without refresh.
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 15000);
    const onFocus = () => {
      load().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const visible = ownFunctional ? items.filter((r) => r.targetFunctional === ownFunctional || r.status !== "PENDING") : items;

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await caseApi.createDataRequest(caseId, { targetFunctional: target, title, details, deadline: deadline || undefined });
      setTitle("");
      setDetails("");
      setDeadline("");
      setMsg({ ok: true, text: `Requisition issued to ${target}.` });
      await load();
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Issue failed." });
    } finally {
      setBusy(false);
    }
  };

  const fulfill = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await caseApi.fulfillDataRequest(caseId, id, "Fulfilled via portal upload pipeline.");
      setMsg({ ok: true, text: "Marked fulfilled." });
      await load();
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Fulfill failed." });
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = items.filter((r) => r.status === "PENDING" && (!ownFunctional || r.targetFunctional === ownFunctional)).length;

  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-2.5">
      <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
        <Send className="w-3.5 h-3.5 text-amber-400" />
        Data requisitions {ownFunctional ? `· ${ownFunctional} inbox` : "· Lead pipeline"}
        {pendingCount > 0 && (
          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950">
            {pendingCount} new
          </span>
        )}
      </h4>

      {msg && (
        <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {canIssue && (
        <form onSubmit={issue} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200">
              <option value="FORENSIC">→ FORENSIC</option>
              <option value="CYBER">→ CYBER</option>
              <option value="FIELD">→ FIELD</option>
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short title (min 5 chars)"
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500"
            />
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Instructions: what data/evidence is required (min 10 chars)…"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-500"
          />
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-400">Deadline</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
            />
          </label>
          <button
            type="submit"
            disabled={busy || title.trim().length < 5 || details.trim().length < 10}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40"
          >
            Issue requisition
          </button>
        </form>
      )}

      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {visible.length === 0 && (
          <p className="text-[11px] text-slate-500 text-center py-2">No data requisitions.</p>
        )}
        {visible.map((r) => (
          <div key={r._id} className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-200 truncate">{r.title}</span>
              <span className={`font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${r.status === "PENDING" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : r.status === "FULFILLED" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                {r.status}
              </span>
            </div>
            <p className="text-slate-400 truncate">→ {r.targetFunctional} · {r.justification}</p>
            {r.deadline && (
              <p className={`text-[10px] font-mono ${isOverdue(r) ? "text-rose-300 font-bold" : "text-slate-500"}`}>
                ⏰ due {String(r.deadline).slice(0, 10)}{isOverdue(r) ? " · OVERDUE" : ""}
              </p>
            )}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>by {r.requested_by}</span>
              {r.status === "PENDING" && (!ownFunctional || r.targetFunctional === ownFunctional) && (
                <button onClick={() => fulfill(r._id)} disabled={busy} className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold disabled:opacity-40">
                  Mark fulfilled
                </button>
              )}
              {r.status === "FULFILLED" && r.fulfilled_by && <span>✓ {r.fulfilled_by}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataRequestInbox;
