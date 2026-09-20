import React, { useState } from "react";
import { DataRequestInbox } from "../requisitions/DataRequestInbox";
import { IngestTab } from "../staging/IngestTab";
import { Radar, Upload, AlertCircle } from "lucide-react";

interface CyberHubProps {
  caseId: string;
  readOnly: boolean;
  signal: number;
  onChanged: () => void;
  /** Phase 2 Req9-11 — agency cyber focus line (CBI financial/crypto, NIA dark-web, CID phishing). */
  focusLine?: string;
}

/**
 * Cyber Crime Cell — Ingestion Console only. Officers seal exhibits
 * (CDR dumps, tower logs, OSINT, PDFs, images, audio, video ≤15GB); text is
 * auto-extracted via SAHAYAK into the staging queue for Lead accept/reject.
 */
export const CyberHub: React.FC<CyberHubProps> = ({ caseId, readOnly, signal, onChanged, focusLine }) => {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
          <Radar className="w-5 h-5 text-cyan-400" /> Cyber Crime Cell
        </h2>
        <p className="text-[11px] text-slate-400 font-mono">Ingestion console — seal exhibits for Lead review</p>
        {focusLine && <p className="text-[11px] font-mono text-cyan-300/90 mt-1">{focusLine}</p>}
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-error/10 border border-error/30 text-[11px] text-error flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ---- Ingestion Console (CDR dumps, tower logs, OSINT, files ≤15GB) ---- */}
      <IngestTab
        caseId={caseId}
        readOnly={readOnly}
        onChanged={() => {
          setError(null);
          onChanged();
        }}
      />
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Upload className="w-3.5 h-3.5" />
        <span>Uploads auto-extract text via SAHAYAK into the Intake Pipeline — the Lead accepts or rejects each item.</span>
      </div>

      {/* Phase 4 Req22 — Lead data requisitions assigned to CYBER */}
      <DataRequestInbox caseId={caseId} ownFunctional="CYBER" />
    </div>
  );
};

export default CyberHub;
