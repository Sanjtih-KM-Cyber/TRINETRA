import React, { useState, useEffect, useCallback } from "react";
import { CaseDataset } from "../../types";
import { proceedingsApi } from "../../services/api";
import { CaseDiaryTab } from "./CaseDiaryTab";
import { ArrestMemoTab } from "./ArrestMemoTab";
import { HistorySheetTab } from "./HistorySheetTab";
import { CustodyTab } from "./CustodyTab";
import { ChargeSheetTab } from "./ChargeSheetTab";
import { BookOpen, Gavel, ScrollText, Timer, FileText } from "lucide-react";

interface ProceedingsHubProps {
  currentCase: CaseDataset;
  readOnly?: boolean;
}

type SubTab = "diary" | "memo" | "history" | "custody" | "chargesheet";

export const ProceedingsHub: React.FC<ProceedingsHubProps> = ({ currentCase, readOnly = false }) => {
  const [subTab, setSubTab] = useState<SubTab>("diary");
  const [alertCount, setAlertCount] = useState(0);
  const [counts, setCounts] = useState({ diary: 0, memo: 0, history: 0, custody: 0, cs: 0 });

  const refreshCounts = useCallback(async () => {
    try {
      const [d, m, h, c, cs, a] = await Promise.all([
        proceedingsApi.getDiary(currentCase.id),
        proceedingsApi.getMemos(currentCase.id),
        proceedingsApi.getHistorySheets(currentCase.id),
        proceedingsApi.getCustody(currentCase.id),
        proceedingsApi.getChargeSheets(currentCase.id),
        proceedingsApi.getCustodyAlerts(currentCase.id),
      ]);
      setCounts({
        diary: d.entries.length,
        memo: m.memos.length,
        history: h.sheets.length,
        custody: c.records.length,
        cs: cs.chargeSheets.length,
      });
      setAlertCount(a.alerts.length);
    } catch {
      /* hub stays usable offline of counts */
    }
  }, [currentCase.id]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const caseMeta = {
    name: currentCase.name,
    codeName: currentCase.codeName,
    leadAgency: currentCase.leadAgency,
  };

  const tabs: Array<{ id: SubTab; label: string; icon: React.ReactNode; badge?: number; alert?: boolean }> = [
    { id: "diary", label: "Sec 172 Diary", icon: <BookOpen className="w-4 h-4" />, badge: counts.diary },
    { id: "memo", label: "Arrest / Seizure", icon: <Gavel className="w-4 h-4" />, badge: counts.memo },
    { id: "history", label: "History Sheet", icon: <ScrollText className="w-4 h-4" />, badge: counts.history },
    { id: "custody", label: "Custody Tracker", icon: <Timer className="w-4 h-4" />, badge: counts.custody, alert: alertCount > 0 },
    { id: "chargesheet", label: "Charge Sheet", icon: <FileText className="w-4 h-4" />, badge: counts.cs },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight">Core Investigation Engine</h2>
        <p className="text-[11px] text-slate-400 font-mono">
          Sec 172 diary · Sec 41/102 memos · History sheets · 15/60/90-day custody clock · Sec 173 charge sheets — {currentCase.codeName}
        </p>
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
            {t.alert && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" title={`${alertCount} custody alerts`} />}
          </button>
        ))}
      </div>

      {readOnly && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
          VIEW_ONLY — proceedings are read-only for you (mutations return 403).
        </div>
      )}

      {subTab === "diary" && <CaseDiaryTab caseId={currentCase.id} caseMeta={caseMeta} onChanged={refreshCounts} readOnly={readOnly} />}
      {subTab === "memo" && <ArrestMemoTab caseId={currentCase.id} caseMeta={caseMeta} onChanged={refreshCounts} readOnly={readOnly} />}
      {subTab === "history" && <HistorySheetTab caseId={currentCase.id} caseMeta={caseMeta} onChanged={refreshCounts} readOnly={readOnly} />}
      {subTab === "custody" && <CustodyTab caseId={currentCase.id} onChanged={refreshCounts} readOnly={readOnly} />}
      {subTab === "chargesheet" && <ChargeSheetTab caseId={currentCase.id} caseMeta={caseMeta} onChanged={refreshCounts} readOnly={readOnly} />}
    </div>
  );
};

export default ProceedingsHub;
