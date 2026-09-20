import React, { useState } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  CDRRecord,
  FinancialRecord,
  FIRRecord,
  IntelRecord,
  SourceSnippet,
  RelationshipEvidence,
  EvidenceFileRecord,
  OSINTPlatform,
  IntelligenceClassification,
  IntelligenceCompartment,
  IntelligenceCaveat,
} from "../types";
import {
  extractEntitiesRuleBased,
  parseCDRCSV,
  parseFinancialCSV,
  generateFileHash,
} from "../services/nlpExtractor";
import { sahayakApi } from "../services/api";
import {
  ingestOSINT,
  validateOSINTUrl,
  previewOSINTEntities,
  OSINTIngestInput,
} from "../services/osintIngest";
import {
  FileText,
  PhoneCall,
  Landmark,
  PlusCircle,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Database,
  Upload,
  Layers,
  ArrowRight,
  Hash,
  Globe,
  Link,
  Eye,
  Loader2,
  Shield,
} from "lucide-react";

interface DataIngestionHubProps {
  onIngestExtractedData: (
    nodes: CrimeNetworkNode[],
    links: CrimeNetworkLink[],
    cdrs?: CDRRecord[],
    financials?: FinancialRecord[],
    evidenceFiles?: EvidenceFileRecord[],
    intels?: IntelRecord[]
  ) => void;
  onSwitchToGraph: () => void;
  onOpenAddEvidence?: () => void;
}

export const DataIngestionHub: React.FC<DataIngestionHubProps> = ({
  onIngestExtractedData,
  onSwitchToGraph,
  onOpenAddEvidence,
}) => {
  const [activeTab, setActiveTab] = useState<"fir" | "cdr" | "financial" | "manual" | "osint" | "intel">("fir");

  // FIR Text State
  const [firText, setFirText] = useState<string>(
    `SPECIAL INTELLIGENCE INTERCEPT REPORT - CRIME BRANCH
Case Ref: FIR No. 209/2026 under IPC 302, 120B and NDPS Act Sec 21.

On 14th August 2026, intelligence sources confirmed that prime accused Farooq 'Chacha' Merchant (Contact: +919820011442, Handset IMEI: 864219038472911) held secret communications with wanted kingpin Vikramaditya Singhania operating out of Dubai (+971508821990).
Financial transactions indicate ₹48,00,000 was wired to Hawala banker Rameshwar 'Munshi' Joshi (VPA: munshi.trade@oksbi).
Subsequently, logistics coordinator Karan 'Rider' Saluja deployed container truck MH-04-AZ-8890 escorted by Toyota Fortuner GA-03-K-4411 driven by armed enforcer Shankar 'Chhota' Gaikwad towards the Anjuna Beach safehouse in Goa.`
  );

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionSummary, setExtractionSummary] = useState<string | null>(null);
  const [extractedNodes, setExtractedNodes] = useState<CrimeNetworkNode[]>([]);
  const [extractedLinks, setExtractedLinks] = useState<CrimeNetworkLink[]>([]);
  const [detectedSignals, setDetectedSignals] = useState<string[]>([]);

  // CDR CSV State
  const [cdrCSV, setCdrCSV] = useState<string>(
    `A_Party,B_Party,IMEI_A,IMEI_B,Timestamp,Duration_Sec,Call_Type,Tower_ID,Tower_Location,Lat,Lng
+919820011442,+971508821990,864219038472911,359871098234123,2026-08-14T23:10:00Z,340,VOICE_CALL,TOW-DONGRI-01,Dongri South Mumbai,18.9614,72.8373
+919820011442,+919811099881,864219038472911,354110982371900,2026-08-15T00:15:30Z,180,VOICE_CALL,TOW-VASHI-02,Navi Mumbai Vashi,19.033,73.0297
+919820099011,+919890123456,864219038472911,358992019283711,2026-08-15T01:10:05Z,95,VOICE_CALL,TOW-JNPT-01,Nhava Sheva Port,18.953,72.956
+919820099022,+919765432100,864219038472911,357712093847111,2026-08-15T02:05:40Z,210,VOICE_CALL,TOW-CALANGUTE-01,Calangute Goa,15.543,73.7554`
  );

  // Financial CSV State
  const [finCSV, setFinCSV] = useState<string>(
    `Sender_Acc,Sender_Name,Receiver_Acc,Receiver_Name,Amount,Timestamp,Mode,UTR,Bank,Smurfing_Flag
50200049281923,Apex Agro Exports,30918274619,Mahesh Rathod (Mule),980000,2026-08-14T11:20:00Z,RTGS,HDFC99281,HDFC Bank,true
30918274619,Mahesh Rathod,munshi.trade@oksbi,Rameshwar Joshi,950000,2026-08-14T13:45:00Z,UPI,SBIN18274,SBI UPI,true
munshi.trade@oksbi,Rameshwar Joshi,49201928371,Goa Safehouse Logistics,450000,2026-08-14T15:10:00Z,IMPS,SBIN49201,SBI,true`
  );

  // Manual Form State
  const [manualLabel, setManualLabel] = useState("");
  const [manualType, setManualType] = useState<any>("PERSON");
  const [manualRole, setManualRole] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualRisk, setManualRisk] = useState(70);

  // OSINT State
  const [osintUrl, setOsintUrl] = useState("");
  const [osintPlatform, setOsintPlatform] = useState<OSINTPlatform>("TWITTER");
  const [osintAuthorHandle, setOsintAuthorHandle] = useState("");
  const [osintAuthorName, setOsintAuthorName] = useState("");
  const [osintContent, setOsintContent] = useState("");
  const [osintPostedAt, setOsintPostedAt] = useState(new Date().toISOString().slice(0, 16));
  const [osintGeoLat, setOsintGeoLat] = useState("");
  const [osintGeoLng, setOsintGeoLng] = useState("");
  const [osintGeoPlace, setOsintGeoPlace] = useState("");
  const [osintEngagementLikes, setOsintEngagementLikes] = useState(0);
  const [osintEngagementShares, setOsintEngagementShares] = useState(0);
  const [osintEngagementComments, setOsintEngagementComments] = useState(0);
  const [osintPreview, setOsintPreview] = useState<{ entities: string[]; summary: string } | null>(null);
  const [osintValidating, setOsintValidating] = useState(false);
  const [osintValid, setOsintValid] = useState<{ valid: boolean; handle?: string } | null>(null);
  const [isOsintIngesting, setIsOsintIngesting] = useState(false);
  const [osintResult, setOsintResult] = useState<{ success: boolean; nodes: CrimeNetworkNode[]; links: CrimeNetworkLink[]; error?: string } | null>(null);

  // Intel Report State
  const [intelSourceType, setIntelSourceType] = useState<IntelRecord["sourceType"]>("FIELD_AGENT");
  const [intelLocation, setIntelLocation] = useState("");
  const [intelLat, setIntelLat] = useState("");
  const [intelLng, setIntelLng] = useState("");
  const [intelVehiclePlate, setIntelVehiclePlate] = useState("");
  const [intelSuspects, setIntelSuspects] = useState("");
  const [intelDescription, setIntelDescription] = useState("");
  const [intelReliability, setIntelReliability] = useState(3);
  const [intelClassification, setIntelClassification] = useState<IntelligenceClassification>("CONFIDENTIAL");
  const [intelCompartment, setIntelCompartment] = useState<IntelligenceCompartment>("GENERAL");
  const [intelCaveats, setIntelCaveats] = useState<IntelligenceCaveat[]>([]);
  const [intelSourceAgency, setIntelSourceAgency] = useState<IntelRecord["sourceAgency"]>("STATE_IB");
  const [intelSanitized, setIntelSanitized] = useState("");
  const [intelDeclassification, setIntelDeclassification] = useState("");
  const [intelPreview, setIntelPreview] = useState<{ entities: string[]; summary: string } | null>(null);
  const [isIntelIngesting, setIsIntelIngesting] = useState(false);
  const [intelResult, setIntelResult] = useState<{ success: boolean; nodes: CrimeNetworkNode[]; links: CrimeNetworkLink[]; error?: string } | null>(null);

  // Handlers for FIR Extraction — SAHAYAK model extraction (Groq-backed).
  // Tabular CDR/financial dumps keep their deterministic parsers; narrative
  // text goes to the live model with honest errors (no mock entities).
  const [extractEngine, setExtractEngine] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const stamp = (res: { nodes: CrimeNetworkNode[]; links: CrimeNetworkLink[] }, docHash: string, file: string) => {
    const stampedNodes = res.nodes.map((node) => ({
      ...node,
      sourceDocumentIds: [docHash],
      sourceSnippets: node.sourceSnippets?.map((s) => ({ ...s, docId: docHash })) || [],
    }));
    const stampedLinks = res.links.map((link) => ({
      ...link,
      sourceDocumentId: docHash,
      evidenceDetail: link.evidenceDetail ? { ...link.evidenceDetail, sourceDocumentId: docHash } : undefined,
    }));
    return { stampedNodes, stampedLinks };
  };

  const handleExtractWithAI = async () => {
    if (!firText.trim()) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const res = await sahayakApi.extract(firText, "FIR Police Report");
      setExtractEngine(`SAHAYAK · ${res.provider}/${res.model}`);
      // Stamp the hash into all extracted nodes and links
      const docHash = generateFileHash(firText, "FIR_209_SpecialCell_CrimeBranch.pdf");
      const { stampedNodes, stampedLinks } = stamp(res, docHash, firText);
      setExtractedNodes(stampedNodes);
      setExtractedLinks(stampedLinks);
      setExtractionSummary(res.summary);
      setDetectedSignals(res.suspiciousSignals || []);
    } catch (e: any) {
      setExtractError(e.message || "SAHAYAK extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleCommitExtraction = () => {
    onIngestExtractedData(extractedNodes, extractedLinks);
    onSwitchToGraph();
  };

  const handleCommitCDR = () => {
    const cdrs = parseCDRCSV(cdrCSV);
    const docHash = generateFileHash(cdrCSV, "CDR_Dump_Dongri_SouthMumbai.csv");
    const newNodes: CrimeNetworkNode[] = [];
    const newLinks: CrimeNetworkLink[] = [];

    cdrs.forEach((c) => {
      newNodes.push({
        id: `phone-${c.aParty.replace(/[^0-9]/g, "").slice(-10)}`,
        label: c.aParty,
        type: "PHONE",
        role: "Caller Line",
        riskScore: 70,
        confidence: 0.95,
        details: { phone: c.aParty, imei: c.imeiA, geo: { lat: c.lat, lng: c.lng, name: c.towerLocation } },
        sourceDocumentIds: [docHash],
        sourceSnippets: [{
          docId: docHash,
          docName: "CDR_Dump_Dongri_SouthMumbai.csv",
          row: cdrs.indexOf(c) + 1,
          locator: `CDR Row #${cdrs.indexOf(c) + 1}`,
          snippet: `${c.aParty} → ${c.bParty} (${c.durationSec}s) at ${c.towerLocation}`,
          confidence: 0.95,
        }],
      });
      newNodes.push({
        id: `phone-${c.bParty.replace(/[^0-9]/g, "").slice(-10)}`,
        label: c.bParty,
        type: "PHONE",
        role: "Recipient Line",
        riskScore: 70,
        confidence: 0.95,
        details: { phone: c.bParty, imei: c.imeiB },
        sourceDocumentIds: [docHash],
        sourceSnippets: [{
          docId: docHash,
          docName: "CDR_Dump_Dongri_SouthMumbai.csv",
          row: cdrs.indexOf(c) + 1,
          locator: `CDR Row #${cdrs.indexOf(c) + 1}`,
          snippet: `${c.aParty} → ${c.bParty} (${c.durationSec}s) at ${c.towerLocation}`,
          confidence: 0.95,
        }],
      });
      newLinks.push({
        id: `link-cdr-${c.id}`,
        source: `phone-${c.aParty.replace(/[^0-9]/g, "").slice(-10)}`,
        target: `phone-${c.bParty.replace(/[^0-9]/g, "").slice(-10)}`,
        relationType: "CALLS",
        weight: 2,
        durationSec: c.durationSec,
        timestamp: c.timestamp,
        details: `CDR Call Duration: ${c.durationSec}s at tower ${c.towerLocation}`,
        flags: c.imeiA === "864219038472911" ? ["SHARED_IMEI"] : undefined,
        sourceDocumentId: docHash,
        evidenceDetail: {
          sourceDocumentId: docHash,
          sourceDocumentName: "CDR_Dump_Dongri_SouthMumbai.csv",
          locator: `CDR Row #${cdrs.indexOf(c) + 1}`,
          excerpt: `${c.aParty} called ${c.bParty} for ${c.durationSec}s via tower ${c.towerLocation}`,
          confidence: 0.95,
          basis: "CDR Triangulation",
        },
      });
    });

    onIngestExtractedData(newNodes, newLinks, cdrs);
    onSwitchToGraph();
  };

  const handleCommitFinancials = () => {
    const fins = parseFinancialCSV(finCSV);
    const docHash = generateFileHash(finCSV, "Banking_Hawala_Ledger_Operation_Garuda.csv");
    const newNodes: CrimeNetworkNode[] = [];
    const newLinks: CrimeNetworkLink[] = [];

    fins.forEach((f) => {
      newNodes.push({
        id: `acc-${f.senderAcc.slice(-6)}`,
        label: `${f.senderName} (${f.senderAcc.slice(-4)})`,
        type: "FINANCIAL",
        role: "Remitter Account",
        riskScore: 75,
        confidence: 0.9,
        details: { accountNumber: f.senderAcc, bankName: f.bankName },
        sourceDocumentIds: [docHash],
        sourceSnippets: [{
          docId: docHash,
          docName: "Banking_Hawala_Ledger_Operation_Garuda.csv",
          row: fins.indexOf(f) + 1,
          locator: `Ledger Row #${fins.indexOf(f) + 1}`,
          snippet: `₹${(f.amount / 100000).toFixed(2)}L ${f.senderName} → ${f.receiverName} via ${f.mode} [UTR: ${f.utrNumber}]`,
          confidence: 0.9,
        }],
      });
      newNodes.push({
        id: `acc-${f.receiverAcc.slice(-6)}`,
        label: `${f.receiverName} (${f.receiverAcc.slice(-4)})`,
        type: "FINANCIAL",
        role: "Beneficiary Account",
        riskScore: 80,
        confidence: 0.9,
        details: { accountNumber: f.receiverAcc },
        sourceDocumentIds: [docHash],
        sourceSnippets: [{
          docId: docHash,
          docName: "Banking_Hawala_Ledger_Operation_Garuda.csv",
          row: fins.indexOf(f) + 1,
          locator: `Ledger Row #${fins.indexOf(f) + 1}`,
          snippet: `₹${(f.amount / 100000).toFixed(2)}L ${f.senderName} → ${f.receiverName} via ${f.mode} [UTR: ${f.utrNumber}]`,
          confidence: 0.9,
        }],
      });
      newLinks.push({
        id: `link-fin-${f.id}`,
        source: `acc-${f.senderAcc.slice(-6)}`,
        target: `acc-${f.receiverAcc.slice(-6)}`,
        relationType: "FUNDS_TRANSFER",
        weight: 3,
        amount: f.amount,
        timestamp: f.timestamp,
        details: `₹${(f.amount / 100000).toFixed(2)}L transfer via ${f.mode} [UTR: ${f.utrNumber}]`,
        flags: f.isSmurfingFlag ? ["SMURFING_CHAIN", "SUSPICIOUS_HAWALA"] : undefined,
        sourceDocumentId: docHash,
        evidenceDetail: {
          sourceDocumentId: docHash,
          sourceDocumentName: "Banking_Hawala_Ledger_Operation_Garuda.csv",
          locator: `Ledger Row #${fins.indexOf(f) + 1}`,
          excerpt: `₹${(f.amount / 100000).toFixed(2)}L ${f.senderName} → ${f.receiverName} via ${f.mode} [UTR: ${f.utrNumber}]`,
          confidence: 0.9,
          basis: "Financial Ledger / BSA 65B",
        },
      });
    });

    onIngestExtractedData(newNodes, newLinks, undefined, fins);
    onSwitchToGraph();
  };

  const handleCreateManualNode = () => {
    if (!manualLabel.trim()) return;
    const docHash = generateFileHash(manualLabel, `Manual_Entry_${Date.now()}.txt`);
    const newNode: CrimeNetworkNode = {
      id: `manual-${Date.now()}`,
      label: manualLabel,
      type: manualType,
      role: manualRole || "Field Lead",
      riskScore: manualRisk,
      confidence: 1.0,
      details: {
        phone: manualPhone,
        notes: "Manually registered by field investigator",
      },
      sourceDocumentIds: [docHash],
      sourceSnippets: [{
        docId: docHash,
        docName: `Manual_Entry_${Date.now()}.txt`,
        locator: "Manual Entry",
        snippet: manualLabel,
        confidence: 1.0,
      }],
    };
    onIngestExtractedData([newNode], []);
    setManualLabel("");
    setManualRole("");
    setManualPhone("");
    onSwitchToGraph();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Multi-Source Intelligence Ingestion Hub
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingest unstructured FIR narratives, CDR spreadsheets, banking ledgers, and field intelligence into the dynamic Knowledge Graph.
            </p>
          </div>
        </div>

        {/* Evidence Ingestion Bulk Modal Trigger */}
        {onOpenAddEvidence && (
          <button
            onClick={onOpenAddEvidence}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold text-xs transition-all shadow-lg shadow-amber-500/20 active:scale-95 shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span>+ Ingest Evidence (15GB Max)</span>
          </button>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("fir")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "fir"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 bg-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>FIR & Intelligence Text (NLP)</span>
        </button>

        <button
          onClick={() => setActiveTab("cdr")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "cdr"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 bg-slate-900"
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>Call Detail Records (CDR Logs)</span>
        </button>

        <button
          onClick={() => setActiveTab("financial")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "financial"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 bg-slate-900"
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Banking & Hawala Transactions</span>
        </button>

        <button
          onClick={() => setActiveTab("manual")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "manual"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 bg-slate-900"
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Manual Field Entry</span>
        </button>

        <button
          onClick={() => setActiveTab("osint")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "osint"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 bg-slate-900"
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>OSINT / Social Media</span>
        </button>

        <button
          onClick={() => setActiveTab("intel")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "intel"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 bg-slate-900"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Intel Reports (Classified)</span>
        </button>
      </div>

      {/* Tab 1: FIR & Unstructured Text Ingestion */}
      {activeTab === "fir" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                Raw Police FIR / Case Diary Narrative:
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Supports Indian Penal Code, NDPS, BNS, IMEIs & VPAs
              </span>
            </div>

            <textarea
              rows={9}
              value={firText}
              onChange={(e) => setFirText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none leading-relaxed"
              placeholder="Paste raw police FIR narrative or surveillance statement..."
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExtractWithAI}
                disabled={isExtracting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>{isExtracting ? "Extracting with SAHAYAK…" : "Extract with SAHAYAK"}</span>
              </button>
              {extractEngine && (
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1">
                  {extractEngine}
                </span>
              )}
            </div>
            {extractError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300">
                {extractError}
              </div>
            )}
          </div>

          {/* Extraction Preview & Merge Box */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Extracted Graph Entities & Links Preview
              </h3>

              {extractionSummary ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300">
                    <strong className="text-amber-400 block mb-1">Synopsis:</strong>
                    {extractionSummary}
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Discovered Entities ({extractedNodes.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                      {extractedNodes.map((n) => (
                        <span
                          key={n.id}
                          className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-300"
                        >
                          {n.label} <strong className="text-amber-400">[{n.type}]</strong>
                        </span>
                      ))}
                    </div>
                  </div>

                  {detectedSignals.length > 0 && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[11px] text-rose-300 space-y-1">
                      <strong className="block font-bold">Suspicious Identifiers:</strong>
                      {detectedSignals.map((s, idx) => (
                        <div key={idx}>• {s}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-48 border border-dashed border-slate-800 rounded-lg">
                  <Upload className="w-6 h-6 text-slate-600 mb-2" />
                  <p>Click "Extract with SAHAYAK" to parse the narrative above with the live model.</p>
                </div>
              )}
            </div>

            {extractedNodes.length > 0 && (
              <button
                onClick={handleCommitExtraction}
                className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow"
              >
                <span>Commit & Inject to Active Graph ({extractedNodes.length} Nodes)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: CDR Logs */}
      {activeTab === "cdr" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-sky-400" />
              Call Detail Records (CDR) CSV Ingestion Matrix:
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Columns: A_Party, B_Party, IMEI_A, IMEI_B, Timestamp, Duration, Call_Type, Tower_ID, Location, Lat, Lng
            </span>
          </div>

          <textarea
            rows={8}
            value={cdrCSV}
            onChange={(e) => setCdrCSV(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none"
          />

          <button
            onClick={handleCommitCDR}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
          >
            <span>Parse & Ingest CDR Network</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab 3: Financial & Hawala Ledger */}
      {activeTab === "financial" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-400" />
              Banking, UPI & Hawala Ledger CSV Ingestion:
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Columns: Sender_Acc, Sender_Name, Receiver_Acc, Receiver_Name, Amount, Timestamp, Mode, UTR, Bank, Smurfing_Flag
            </span>
          </div>

          <textarea
            rows={8}
            value={finCSV}
            onChange={(e) => setFinCSV(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none"
          />

          <button
            onClick={handleCommitFinancials}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
          >
            <span>Parse & Ingest Hawala Flow Graph</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab 4: Manual Field Entry */}
      {activeTab === "manual" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg max-w-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-amber-400" />
            Field Operative Manual Entity Registration
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Entity Name / Identifier:</label>
              <input
                type="text"
                placeholder="e.g. Ramesh 'Kabadi' Patel"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Entity Type:</label>
              <select
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                <option value="PERSON">PERSON (Suspect / Associate)</option>
                <option value="PHONE">PHONE / SIM CARD</option>
                <option value="FINANCIAL">FINANCIAL (Bank / UPI / Hawala)</option>
                <option value="LOCATION">LOCATION (Safehouse / Port)</option>
                <option value="VEHICLE">VEHICLE (Getaway / Container)</option>
                <option value="INCIDENT">INCIDENT (FIR / Incident)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Role / Function:</label>
              <input
                type="text"
                placeholder="e.g. Hawala Courier / Armorer"
                value={manualRole}
                onChange={(e) => setManualRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Phone / MSISDN:</label>
              <input
                type="text"
                placeholder="+91 98XXXXXXXX"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Investigative Risk Score ({manualRisk}/100):
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={manualRisk}
              onChange={(e) => setManualRisk(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500"
            />
          </div>

          <button
            onClick={handleCreateManualNode}
            disabled={!manualLabel.trim()}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
          >
            <span>Register & Add to Case Graph</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab 5: OSINT / Social Media Intelligence */}
      {activeTab === "osint" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              OSINT / Social Media Intelligence Ingestion
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Supports: Twitter/X, Facebook, Instagram, Telegram Public, YouTube, LinkedIn
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Platform:</label>
              <select
                value={osintPlatform}
                onChange={(e) => setOsintPlatform(e.target.value as OSINTPlatform)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                <option value="TWITTER">Twitter / X</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="TELEGRAM_PUBLIC">Telegram Public Channel</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="LINKEDIN">LinkedIn</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Post URL:</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://twitter.com/user/status/1234567890"
                  value={osintUrl}
                  onChange={(e) => setOsintUrl(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <button
                  onClick={async () => {
                    setOsintValidating(true);
                    const result = validateOSINTUrl(osintPlatform, osintUrl);
                    setOsintValid(result);
                    if (result.handle) setOsintAuthorHandle(result.handle);
                    setOsintValidating(false);
                  }}
                  disabled={osintValidating || !osintUrl}
                  className="px-3 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-2"
                >
                  {osintValidating ? <> <Loader2 className="w-4 h-4 animate-spin" /> <span>Validating...</span> </> : <> <Link className="w-4 h-4" /> <span>Validate</span> </>}
                </button>
              </div>
              {osintValid && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {osintValid.valid ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Valid URL • Handle: @{osintValid.handle}
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Invalid URL for {osintPlatform}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Author Handle:</label>
              <input
                type="text"
                placeholder="@username"
                value={osintAuthorHandle}
                onChange={(e) => setOsintAuthorHandle(e.target.value.replace(/^@/, "").toLowerCase())}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Author Name (Optional):</label>
              <input
                type="text"
                placeholder="Display Name"
                value={osintAuthorName}
                onChange={(e) => setOsintAuthorName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Post Content:</label>
              <textarea
                rows={6}
                placeholder="Paste the full text content of the social media post..."
                value={osintContent}
                onChange={(e) => setOsintContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Posted At:</label>
              <input
                type="datetime-local"
                value={osintPostedAt}
                onChange={(e) => setOsintPostedAt(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Geo-Location (Optional):</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Latitude"
                  value={osintGeoLat}
                  onChange={(e) => setOsintGeoLat(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Longitude"
                  value={osintGeoLng}
                  onChange={(e) => setOsintGeoLng(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Place Name"
                  value={osintGeoPlace}
                  onChange={(e) => setOsintGeoPlace(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Engagement Metrics (Optional):</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Likes</label>
                  <input
                    type="number"
                    min="0"
                    value={osintEngagementLikes}
                    onChange={(e) => setOsintEngagementLikes(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Shares</label>
                  <input
                    type="number"
                    min="0"
                    value={osintEngagementShares}
                    onChange={(e) => setOsintEngagementShares(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Comments</label>
                  <input
                    type="number"
                    min="0"
                    value={osintEngagementComments}
                    onChange={(e) => setOsintEngagementComments(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                if (!osintUrl || !osintContent.trim()) return;
                setIsOsintIngesting(true);
                try {
                  const preview = await previewOSINTEntities({
                    platform: osintPlatform,
                    sourceUrl: osintUrl,
                    authorHandle: osintAuthorHandle,
                    authorName: osintAuthorName,
                    content: osintContent,
                    postedAt: osintPostedAt,
                    geoTag: osintGeoLat && osintGeoLng ? { lat: parseFloat(osintGeoLat), lng: parseFloat(osintGeoLng), placeName: osintGeoPlace } : undefined,
                    engagement: { likes: osintEngagementLikes, shares: osintEngagementShares, comments: osintEngagementComments },
                    caseId: "preview",
                    ingestedBy: { id: "preview", name: "Preview", role: "PREVIEW", badge: "PREVIEW" },
                  });
                  setOsintPreview(preview);
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsOsintIngesting(false);
                }
              }}
              disabled={isOsintIngesting || !osintContent.trim() || !osintUrl}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
            >
              <Eye className="w-4 h-4" />
              <span>{isOsintIngesting ? "Previewing..." : "Preview Entities"}</span>
            </button>

            <button
              onClick={async () => {
                if (!osintUrl || !osintContent.trim()) return;
                setIsOsintIngesting(true);
                try {
                  const result = await ingestOSINT({
                    platform: osintPlatform,
                    sourceUrl: osintUrl,
                    authorHandle: osintAuthorHandle,
                    authorName: osintAuthorName,
                    content: osintContent,
                    postedAt: osintPostedAt,
                    geoTag: osintGeoLat && osintGeoLng ? { lat: parseFloat(osintGeoLat), lng: parseFloat(osintGeoLng), placeName: osintGeoPlace } : undefined,
                    engagement: { likes: osintEngagementLikes, shares: osintEngagementShares, comments: osintEngagementComments },
                    caseId: "current-case",
                    ingestedBy: { id: "current-user", name: "Investigator", role: "INVESTIGATOR", badge: "BADGE-001" },
                  });
                  setOsintResult(result);
                  if (result.success) {
                    onIngestExtractedData(result.nodes, result.links);
                    onSwitchToGraph();
                  }
                } catch (e) {
                  console.error(e);
                  setOsintResult({ success: false, nodes: [], links: [], error: String(e) });
                } finally {
                  setIsOsintIngesting(false);
                }
              }}
              disabled={isOsintIngesting || !osintContent.trim() || !osintUrl}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
            >
              <Loader2 className="w-4 h-4" />
              <span>{isOsintIngesting ? "Ingesting..." : "Ingest OSINT to Graph"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {osintPreview && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="text-xs font-bold text-cyan-400">Preview Results:</div>
              <div className="text-[11px] text-slate-300">{osintPreview.summary}</div>
              <div className="text-[10px] font-mono text-slate-400">
                Entities: {osintPreview.entities.join(", ")}
              </div>
            </div>
          )}

          {osintResult && (
            <div className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              osintResult.success
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}>
              <div className="flex items-center gap-2.5">
                {osintResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{osintResult.success ? `Successfully ingested ${osintResult.nodes.length} entities, ${osintResult.links.length} links` : osintResult.error || "Ingestion failed"}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Intel Reports (Classified) */}
      {activeTab === "intel" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              Intelligence Report Ingestion (Classified)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Supports: IB, RAW, State IB, FIU-IND, NCB, ED, DRI, Customs
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Source Type:</label>
              <select
                value={intelSourceType}
                onChange={(e) => setIntelSourceType(e.target.value as IntelRecord["sourceType"])}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                <option value="FIELD_AGENT">Field Agent</option>
                <option value="HUMINT">HUMINT</option>
                <option value="TECHNICAL_SURVEILLANCE">Technical Surveillance</option>
                <option value="INTERCEPT">Intercept</option>
                <option value="INFORMANTS">Informants</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Source Agency:</label>
              <select
                value={intelSourceAgency}
                onChange={(e) => setIntelSourceAgency(e.target.value as IntelRecord["sourceAgency"])}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                <option value="IB">Intelligence Bureau (IB)</option>
                <option value="RAW">R&AW</option>
                <option value="STATE_IB">State IB</option>
                <option value="FIU_IND">FIU-IND</option>
                <option value="NCB">NCB</option>
                <option value="ED">Enforcement Directorate</option>
                <option value="DRI">DRI</option>
                <option value="CUSTOMS">Customs</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Classification:</label>
              <select
                value={intelClassification}
                onChange={(e) => setIntelClassification(e.target.value as IntelligenceClassification)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                <option value="RESTRICTED">RESTRICTED</option>
                <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                <option value="SECRET">SECRET</option>
                <option value="TOP_SECRET">TOP SECRET</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Compartment:</label>
              <select
                value={intelCompartment}
                onChange={(e) => setIntelCompartment(e.target.value as IntelligenceCompartment)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                <option value="GENERAL">GENERAL</option>
                <option value="NARCOTICS">NARCOTICS</option>
                <option value="TERRORISM">TERRORISM</option>
                <option value="CYBER">CYBER</option>
                <option value="ECONOMIC">ECONOMIC</option>
                <option value="ORGANIZED_CRIME">ORGANIZED_CRIME</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Handling Caveats:</label>
              <div className="flex flex-wrap gap-2">
                {["NOFORN", "ORCON", "PROPIN", "REL_TO_IND", "EYES_ONLY"].map((caveat) => (
                  <label key={caveat} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={intelCaveats.includes(caveat as IntelligenceCaveat)}
                      onChange={(e) => setIntelCaveats(
                        e.target.checked 
                          ? [...intelCaveats, caveat as IntelligenceCaveat] 
                          : intelCaveats.filter(c => c !== caveat)
                      )}
                      className="w-3.5 h-3.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-[10px] font-mono text-slate-300">{caveat}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Location:</label>
              <input
                type="text"
                placeholder="e.g. Mumbai, Maharashtra"
                value={intelLocation}
                onChange={(e) => setIntelLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Latitude:</label>
              <input
                type="text"
                placeholder="18.9614"
                value={intelLat}
                onChange={(e) => setIntelLat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Longitude:</label>
              <input
                type="text"
                placeholder="72.8373"
                value={intelLng}
                onChange={(e) => setIntelLng(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Vehicle Plate (Optional):</label>
              <input
                type="text"
                placeholder="MH-04-AZ-8890"
                value={intelVehiclePlate}
                onChange={(e) => setIntelVehiclePlate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Suspects Observed (comma-separated):</label>
              <input
                type="text"
                placeholder="Farooq Merchant, Rameshwar Joshi"
                value={intelSuspects}
                onChange={(e) => setIntelSuspects(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Intelligence Description:</label>
              <textarea
                rows={6}
                placeholder="Detailed intelligence report content..."
                value={intelDescription}
                onChange={(e) => setIntelDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Reliability Score (1-5):</label>
              <input
                type="range"
                min="1"
                max="5"
                value={intelReliability}
                onChange={(e) => setIntelReliability(parseInt(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Unreliable (1)</span>
                <span>Reliable (5)</span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sanitized Version (for lower clearance):</label>
              <textarea
                rows={3}
                placeholder="Redacted version for CONFIDENTIAL/RESTRICTED users..."
                value={intelSanitized}
                onChange={(e) => setIntelSanitized(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Declassification Date (Optional):</label>
              <input
                type="date"
                value={intelDeclassification}
                onChange={(e) => setIntelDeclassification(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                if (!intelDescription.trim()) return;
                setIsIntelIngesting(true);
                try {
                  // SAHAYAK model extraction (Groq-backed)
                  const res = await sahayakApi.extract(intelDescription, "Intelligence Report");
                  const docHash = generateFileHash(intelDescription, `Intel_Report_${Date.now()}.txt`);
                  const stampedNodes = res.nodes.map(node => ({
                    ...node,
                    sourceDocumentIds: [docHash],
                    sourceSnippets: node.sourceSnippets?.map(s => ({ ...s, docId: docHash })) || [],
                  }));
                  const stampedLinks = res.links.map(link => ({
                    ...link,
                    sourceDocumentId: docHash,
                    evidenceDetail: link.evidenceDetail ? { ...link.evidenceDetail, sourceDocumentId: docHash } : undefined,
                  }));
                  setIntelPreview({
                    entities: stampedNodes.map(n => `${n.label} [${n.type}]`),
                    summary: res.summary,
                  });
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsIntelIngesting(false);
                }
              }}
              disabled={isIntelIngesting || !intelDescription.trim()}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
            >
              <Eye className="w-4 h-4" />
              <span>{isIntelIngesting ? "Previewing..." : "Preview Entities"}</span>
            </button>

            <button
              onClick={async () => {
                if (!intelDescription.trim()) return;
                setIsIntelIngesting(true);
                try {
                  const res = await sahayakApi.extract(intelDescription, "Intelligence Report");
                  const docHash = generateFileHash(intelDescription, `Intel_Report_${Date.now()}.txt`);
                  const stampedNodes = res.nodes.map(node => ({
                    ...node,
                    sourceDocumentIds: [docHash],
                    sourceSnippets: node.sourceSnippets?.map(s => ({ ...s, docId: docHash })) || [],
                    category: "EVIDENCE" as const,
                    details: { ...node.details, intelClassification, intelCompartment, intelCaveats, intelSourceAgency, intelSanitized: intelSanitized || undefined },
                  }));
                  const stampedLinks = res.links.map(link => ({
                    ...link,
                    sourceDocumentId: docHash,
                    evidenceDetail: link.evidenceDetail ? { ...link.evidenceDetail, sourceDocumentId: docHash } : undefined,
                    provenance: "FIELD_OBSERVATION" as const,
                  }));
                  const intelRecord: IntelRecord = {
                    id: `intel-${Date.now()}`,
                    date: new Date().toISOString(),
                    sourceType: intelSourceType,
                    location: intelLocation || "Undisclosed",
                    lat: parseFloat(intelLat) || 0,
                    lng: parseFloat(intelLng) || 0,
                    vehiclePlate: intelVehiclePlate || undefined,
                    suspectsObserved: intelSuspects.split(",").map((s) => s.trim()).filter(Boolean),
                    description: intelDescription,
                    reliabilityScore: intelReliability,
                    classification: intelClassification,
                    compartment: intelCompartment,
                    caveats: intelCaveats,
                    sourceAgency: intelSourceAgency,
                    sanitizedVersion: intelSanitized || undefined,
                    declassificationDate: intelDeclassification || undefined,
                  };
                  setIntelResult({ success: true, nodes: stampedNodes, links: stampedLinks });
                  onIngestExtractedData(stampedNodes, stampedLinks, undefined, undefined, undefined, [intelRecord]);
                  onSwitchToGraph();
                } catch (e) {
                  console.error(e);
                  setIntelResult({ success: false, nodes: [], links: [], error: String(e) });
                } finally {
                  setIsIntelIngesting(false);
                }
              }}
              disabled={isIntelIngesting || !intelDescription.trim()}
              className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow"
            >
              <Loader2 className="w-4 h-4" />
              <span>{isIntelIngesting ? "Ingesting..." : "Ingest Intel Report to Graph"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {intelPreview && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="text-xs font-bold text-cyan-400">Preview Results:</div>
              <div className="text-[11px] text-slate-300">Classification: {intelClassification} // {intelCompartment} {intelCaveats.length > 0 ? "// " + intelCaveats.join(" ") : ""}</div>
              <div className="text-[11px] text-slate-300">Source: {intelSourceType} • Agency: {intelSourceAgency} • Reliability: {intelReliability}/5</div>
              <div className="text-[11px] text-slate-300">{intelPreview.summary}</div>
              <div className="text-[10px] font-mono text-slate-400">
                Entities: {intelPreview.entities.join(", ")}
              </div>
            </div>
          )}

          {intelResult && (
            <div className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              intelResult.success
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}>
              <div className="flex items-center gap-2.5">
                {intelResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{intelResult.success ? `Successfully ingested ${intelResult.nodes.length} entities, ${intelResult.links.length} links [${intelClassification}//${intelCompartment}]` : intelResult.error || "Ingestion failed"}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
