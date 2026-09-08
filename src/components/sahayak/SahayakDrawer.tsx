import React, { useState } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
} from "../../types";
import { AskTab } from "./AskTab";
import { DocumentIntelTab } from "./DocumentIntelTab";
import { EvidenceLinksTab } from "./EvidenceLinksTab";
import { StatutesTab } from "./StatutesTab";
import {
  X,
  MessageSquareText,
  FileSearch,
  Link2,
  Scale,
  Sparkles,
} from "lucide-react";

interface SahayakDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseId?: string;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns: SuspiciousPattern[];
  communities: SyndicateCommunity[];
  onSelectNode: (node: CrimeNetworkNode) => void;
  readOnly?: boolean;
  onChanged?: () => void;
}

type SubTab = "ask" | "docs" | "links" | "law";

export const SahayakDrawer: React.FC<SahayakDrawerProps> = ({
  isOpen,
  onClose,
  caseId = "case-garuda",
  nodes,
  links,
  patterns,
  onSelectNode,
  readOnly = false,
  onChanged,
}) => {
  void onSelectNode;
  const [tab, setTab] = useState<SubTab>("ask");

  if (!isOpen) return null;

  const tabs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
    { id: "ask", label: "Ask", icon: <MessageSquareText className="w-3.5 h-3.5" /> },
    { id: "docs", label: "Doc Intel", icon: <FileSearch className="w-3.5 h-3.5" /> },
    { id: "links", label: "Ev. Links", icon: <Link2 className="w-3.5 h-3.5" /> },
    { id: "law", label: "Statutes", icon: <Scale className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[560px] bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/30 text-amber-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-100">SAHAYAK</h2>
                <p className="text-[10px] font-mono text-slate-400">
                  {nodes.length} entities · {links.length} links · {patterns.length} alerts indexed
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-2.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                  tab === t.id
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "ask" && <AskTab caseId={caseId} />}
          {tab === "docs" && <DocumentIntelTab caseId={caseId} readOnly={readOnly} />}
          {tab === "links" && <EvidenceLinksTab caseId={caseId} readOnly={readOnly} onChanged={() => onChanged?.()} />}
          {tab === "law" && <StatutesTab />}
        </div>
      </div>
    </>
  );
};

export default SahayakDrawer;
