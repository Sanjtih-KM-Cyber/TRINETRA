import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { stagingApi } from "../../services/api";
import { CaseDataset } from "../../types";
import { IngestTab } from "./IngestTab";
import { ApprovalQueueTab } from "./ApprovalQueueTab";
import { InnocentPoolTab } from "./InnocentPoolTab";
import { TransferTab } from "./TransferTab";
import { Upload, ListChecks, Scale, ArrowRightLeft, Eye } from "lucide-react";

interface StagingHubProps {
  currentCase: CaseDataset;
  readOnly: boolean;
  signal: number;
}

type SubTab = "ingest" | "queue" | "pool" | "transfer";

const LEAD_ROLES = ["ADMIN", "LEAD_INVESTIGATOR", "CBI_OFFICER", "NIA_OFFICER", "ED_OFFICER", "NCB_OFFICER", "IB_OFFICER", "FIU_ANALYST"];

export const StagingHub: React.FC<StagingHubProps> = ({ currentCase, readOnly, signal }) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>("queue");
  const [counts, setCounts] = useState({ pending: 0, pool: 0, transfers: 0, batches: 0 });

  const refresh = useCallback(async () => {
    try {
      const [q, p, t] = await Promise.all([
        stagingApi.getQueue(currentCase.id, { status: "PENDING" }),
        stagingApi.getInnocentPool(currentCase.id),
        stagingApi.getTransfers(currentCase.id),
      ]);
      setCounts({
        pending: q.entities.length + q.links.length,
        pool: p.items.length,
        transfers: t.transfers.filter((x: any) => x.status === "PENDING").length,
        batches: q.batches.length,
      });
    } catch {
      /* hub stays usable */
    }
  }, [currentCase.id]);

  useEffect(() => {
    refresh();
  }, [refresh, signal]);

  const canReview = !!user && LEAD_ROLES.includes(user.role);
  const canPropose = !!user && ["ADMIN", "LEAD_INVESTIGATOR", "CBI_OFFICER", "NIA_OFFICER", "ED_OFFICER", "NCB_OFFICER", "IB_OFFICER"].includes(user.role);
  const canDecide = !!user && ["ADMIN", "LEAD_INVESTIGATOR", "CBI_OFFICER", "NIA_OFFICER", "ED_OFFICER", "NCB_OFFICER", "IB_OFFICER", "FIU_ANALYST", "CERT_ANALYST"].includes(user.role);

  const tabs: Array<{ id: SubTab; label: string; icon: React.ReactNode; badge?: number; dot?: boolean }> = [
    { id: "queue", label: "Approval Queue", icon: <ListChecks className="w-4 h-4" />, badge: counts.pending, dot: counts.pending > 0 },
    { id: "ingest", label: "Ingest", icon: <Upload className="w-4 h-4" />, badge: counts.batches },
    { id: "pool", label: "Innocent Pool", icon: <Scale className="w-4 h-4" />, badge: counts.pool },
    { id: "transfer", label: "Transfer", icon: <ArrowRightLeft className="w-4 h-4" />, badge: counts.transfers, dot: counts.transfers > 0 },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight">Intake & Approval Pipeline</h2>
        <p className="text-[11px] text-slate-400 font-mono">
          Multi-source ingestion → Lead-reviewed staging → main graph · Innocent pool · Inter-department transfer — {currentCase.codeName}
        </p>
        {readOnly && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
            <Eye className="w-3.5 h-3.5" /> VIEW_ONLY — review and mutation controls are locked; the pipeline is read-only for you.
          </div>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
              subTab === t.id
                ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            {t.icon}
            {t.label}
            {typeof t.badge === "number" && (
              <span className="text-[10px] font-mono px-1.5 rounded bg-slate-800 text-slate-300">{t.badge}</span>
            )}
            {t.dot && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />}
          </button>
        ))}
      </div>

      {subTab === "ingest" && <IngestTab caseId={currentCase.id} readOnly={readOnly} onChanged={refresh} />}
      {subTab === "queue" && (
        <ApprovalQueueTab caseId={currentCase.id} readOnly={readOnly} canReview={canReview} signal={signal} onChanged={refresh} />
      )}
      {subTab === "pool" && <InnocentPoolTab caseId={currentCase.id} readOnly={readOnly} signal={signal} onChanged={refresh} />}
      {subTab === "transfer" && (
        <TransferTab
          caseId={currentCase.id}
          caseLeadAgency={currentCase.leadAgency}
          readOnly={readOnly}
          canPropose={canPropose}
          canDecide={canDecide}
          signal={signal}
          onChanged={refresh}
        />
      )}
    </div>
  );
};

export default StagingHub;
