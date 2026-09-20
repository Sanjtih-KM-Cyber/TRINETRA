import React, { useState } from "react";
import { AskTab } from "./AskTab";
import { DocumentIntelTab } from "./DocumentIntelTab";
import { EvidenceLinksTab } from "./EvidenceLinksTab";
import { StatutesTab } from "./StatutesTab";
import { MessageSquareText, FileSearch, Link2, Scale, Sparkles } from "lucide-react";

interface SahayakPanelProps {
  caseId: string;
  readOnly?: boolean;
  onChanged?: () => void;
}

type SubTab = "ask" | "links";

/**
 * Phase 4 Req19 — full-page SAHAYAK AI for the Lead Investigator workstation.
 * Replaces the Evidence Ingestion tab: conversational investigative chat with
 * case-grounded RAG (evidence dates, link graph, penal statutes).
 */
export const SahayakPanel: React.FC<SahayakPanelProps> = ({ caseId, readOnly = false, onChanged }) => {
  const [tab, setTab] = useState<SubTab>("ask");

  const tabs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
    { id: "ask", label: "Ask", icon: <MessageSquareText className="w-3.5 h-3.5" /> },
    { id: "links", label: "Ev. Links", icon: <Link2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" /> SAHAYAK AI
        </h2>
        <p className="text-[11px] text-slate-400 font-mono">
          Investigative chat · grounded in case evidence, link graph & penal statutes
        </p>
      </div>

      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-bold border transition-all ${tab === t.id
                ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
        {tab === "ask" && <AskTab caseId={caseId} />}
        {tab === "links" && <EvidenceLinksTab caseId={caseId} readOnly={readOnly} onChanged={() => onChanged?.()} />}
      </div>
    </div>
  );
};

export default SahayakPanel;
