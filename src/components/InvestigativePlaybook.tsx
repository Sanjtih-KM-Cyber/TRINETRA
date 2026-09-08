import React, { useState, useMemo } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
  AuditLogEntry,
} from "../types";
import { generatePlaybook, playbookSummary, InvestigativeStep } from "../services/actionableIntelEngine";
import {
  Gavel,
  CheckCircle2,
  ClipboardCheck,
} from "lucide-react";

interface InvestigativePlaybookProps {
  caseId?: string;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns?: SuspiciousPattern[];
  communities: SyndicateCommunity[];
  cutVertices: string[];
  auditLogs?: AuditLogEntry[];
  onRecordAction?: (step: InvestigativeStep) => void;
}

/**
 * Investigative Playbook — prioritized legal directives with audit-backed
 * completion. (Relocated here from the retired analytics tab; the
 * centrality displays are gone, the action list stays.)
 */
export const InvestigativePlaybook: React.FC<InvestigativePlaybookProps> = ({
  caseId = "case",
  nodes,
  links,
  patterns = [],
  communities,
  cutVertices,
  auditLogs = [],
  onRecordAction,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "IMMEDIATE" | "HIGH" | "MEDIUM" | "LOW">("ALL");

  const playbookSteps = useMemo(
    () =>
      generatePlaybook({
        caseId,
        nodes,
        links,
        patterns,
        communities,
        cutVertices,
        recentAuditLogs: auditLogs,
      }),
    [caseId, nodes, links, patterns, communities, cutVertices, auditLogs]
  );

  const visibleSteps = useMemo(
    () => (priorityFilter === "ALL" ? playbookSteps : playbookSteps.filter((s) => s.priority === priorityFilter)),
    [playbookSteps, priorityFilter]
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
            <Gavel className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              Investigative Playbook — Prioritized Legal Directives
            </h2>
            <p className="text-xs text-slate-400">
              Deterministic rules over graph analytics. {playbookSummary(playbookSteps)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          {(["ALL", "IMMEDIATE", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                priorityFilter === p
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === "ALL" ? "All" : p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {visibleSteps.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
          No playbook steps match this filter. The network shows no actionable gaps under current constraints.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSteps.map((step, idx) => (
            <div
              key={step.id}
              className={`p-4 rounded-xl border space-y-2.5 ${
                step.completed
                  ? "bg-slate-950/60 border-emerald-500/30"
                  : step.priority === "IMMEDIATE"
                  ? "bg-rose-500/5 border-rose-500/30"
                  : step.priority === "HIGH"
                  ? "bg-amber-500/5 border-amber-500/30"
                  : "bg-slate-950 border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${
                    step.completed
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}>
                    {step.completed ? <CheckCircle2 className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-100">
                        {idx + 1}. {step.title}
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        step.priority === "IMMEDIATE" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                        step.priority === "HIGH" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                        step.priority === "MEDIUM" ? "bg-sky-500/20 text-sky-300 border-sky-500/40" :
                        "bg-slate-700/40 text-slate-300 border-slate-600"
                      }`}>
                        {step.priority}
                      </span>
                      {step.completed && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          DONE{step.completedBy ? ` • ${step.completedBy}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{step.description}</p>
                  </div>
                </div>
                {!step.completed && onRecordAction && (
                  <button
                    onClick={() => onRecordAction(step)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors"
                  >
                    Mark Complete
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Legal Basis</div>
                  <div className="font-bold text-slate-200">{step.legalBasis.statute}</div>
                  <div className="text-slate-400 mt-0.5">{step.legalBasis.provision}</div>
                  <div className="text-slate-500 mt-0.5 font-mono text-[10px]">Authority: {step.legalBasis.authority}</div>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Execution</div>
                  <div className="text-slate-300">Responsible: <strong>{step.responsibleRole}</strong></div>
                  <div className="text-slate-300">Deadline: <strong>+{step.deadlineDays} day(s)</strong></div>
                  <div className="text-rose-300 mt-1">Risk if delayed: {step.riskIfDelayed}</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400">
                <strong className="text-slate-300">Evidence to collect:</strong> {step.evidenceToCollect.join(" • ")}
              </div>
              <div className="text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                <strong>Expected outcome:</strong> {step.expectedOutcome}
              </div>
              {step.prerequisites.length > 0 && (
                <div className="text-[10px] text-slate-500">
                  Prerequisites: {step.prerequisites.join(" • ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
