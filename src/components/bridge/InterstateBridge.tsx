import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi } from "../../services/api";
import { orgOf } from "../../data/roles";
import { KNOWN_STATES } from "../../data/roles";
import { Share2, Inbox, CheckCircle2, AlertTriangle } from "lucide-react";

interface InterstateBridgeProps {
  caseId: string;
  onChanged?: () => void;
}

/**
 * Phase 6 Req26 — cross-state police evidence sharing.
 * A State Police Lead approval flag mirrors exhibits into counter-state Lead
 * views; the inbox surfaces exhibits other states approved for us.
 */
export const InterstateBridge: React.FC<InterstateBridgeProps> = ({ caseId, onChanged }) => {
  const { user } = useAuth();
  const [exhibits, setExhibits] = useState<any[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const police = !!user && orgOf(user.role) === "POLICE";
  const myState = ((user as any)?.state || "").toUpperCase();
  const counterStates = KNOWN_STATES.map((s) => s.code).filter((c) => c !== myState);

  const load = async () => {
    try {
      const [state, box] = await Promise.all([
        caseApi.getCaseState(caseId),
        caseApi.getSharedInbox().catch(() => ({ evidence: [] })),
      ]);
      setExhibits(state.evidenceFiles || []);
      setInbox(box.evidence || []);
    } catch {
      /* bridge degrades silently */
    }
  };

  useEffect(() => {
    if (police) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, police]);

  if (!police) return null;

  const share = async (evidenceId: string) => {
    const target = targets[evidenceId];
    if (!target || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await caseApi.shareEvidence(caseId, evidenceId, [target]);
      setMsg({ ok: true, text: `Exhibit approved for joint use by ${target}.` });
      await load();
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Sharing failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Share2 className="w-4 h-4 text-amber-400" /> Interstate Visibility Bridge
        </h3>
        <p className="text-xs text-slate-400">
          Approve field-team exhibits for joint-jurisdiction use across state boundaries ({myState || "—"}).
        </p>
      </div>

      {msg && (
        <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {exhibits.length === 0 && (
          <p className="text-[11px] text-slate-500 text-center py-2">No exhibits on this case yet.</p>
        )}
        {exhibits.map((ev: any) => (
          <div key={ev.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-[11px]">
            <div className="min-w-0">
              <div className="text-slate-200 truncate font-mono">{ev.fileName}</div>
              {(ev.sharedTo || []).length > 0 && (
                <div className="text-[10px] font-mono text-emerald-300">shared → {(ev.sharedTo || []).join(", ")}</div>
              )}
            </div>
            <span className="flex gap-1.5 shrink-0 items-center">
              <select
                value={targets[ev.id] || ""}
                onChange={(e) => setTargets((t) => ({ ...t, [ev.id]: e.target.value }))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] text-slate-200"
              >
                <option value="">Share with…</option>
                {counterStates.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={() => share(ev.id)}
                disabled={busy || !targets[ev.id]}
                className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-40"
              >
                Approve
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-slate-800 space-y-1.5">
        <h4 className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
          <Inbox className="w-3.5 h-3.5 text-cyan-400" /> Shared with {myState} ({inbox.length})
        </h4>
        {inbox.length === 0 ? (
          <p className="text-[11px] text-slate-500">No counter-state exhibits mirrored to your view.</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {inbox.map((e: any) => (
              <div key={e.id} className="rounded-lg bg-slate-950 border border-cyan-500/20 px-3 py-2 text-[11px] space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-100 font-mono font-bold truncate">{e.fileName}</span>
                  <span className="font-mono text-cyan-300 shrink-0">{e.originTenure}</span>
                </div>
                <div className="text-slate-400 truncate">{e.summary || e.caseCode}</div>
                {e.rawText && (
                  <details className="text-slate-300">
                    <summary className="cursor-pointer text-cyan-300 font-mono text-[10px]">READ FULL TEXT</summary>
                    <pre className="mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">{e.rawText}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InterstateBridge;
