import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi, sahayakApi } from "../../services/api";
import { apiUrl } from "../../services/apiBase";
import { fileToText } from "../../services/exhibitUpload";
import { uploadExhibitFile } from "../../services/exhibitUpload";
import { matrixFor } from "../../data/roleMatrices";
import { orgOf } from "../../data/roles";
import { departmentForUser } from "../../services/roleRouting";
import { DataRequestInbox } from "../requisitions/DataRequestInbox";
import {
  Shield,
  MapPin,
  Camera,
  FileText,
  UserCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  FolderGit2,
  Calendar,
  Link2,
} from "lucide-react";

export const InvestigatorPortal: React.FC<{ initialCaseId?: string }> = ({ initialCaseId }) => {
  const { user, logout, authorizedCases, realtimeNotification, clearNotification } = useAuth();

  // Changes.md Field portal ("Police Login"): sighting form · reports · upload ledger · directives.
  const [activeTab, setActiveTab] = useState<"submit_observation" | "observations_log" | "field_reports">("submit_observation");
  // Open the case picked in My Workspace — fall back to the first authorized case.
  const [currentCaseId, setCurrentCaseId] = useState<string>(
    initialCaseId || authorizedCases[0]?.id || "case-garuda"
  );

  useEffect(() => {
    if (initialCaseId && initialCaseId !== currentCaseId) setCurrentCaseId(initialCaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCaseId]);

  const [isLoading, setIsLoading] = useState(true);
  const [caseState, setCaseState] = useState<any>(null);
  const [observations, setObservations] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);

  // Submission Form States
  const [observationType, setObservationType] = useState<
    "SUSPECT_SIGHTING" | "LOCATION_SURVEILLANCE" | "VEHICLE_TRACKING" | "FIELD_INTEL_NOTE" | "RELATIONSHIP_OBSERVED"
  >("SUSPECT_SIGHTING");
  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  const [locationName, setLocationName] = useState("");
  // GPS telemetry tagged to the observation (Phase: on-scene GPS coordinates).
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [newEntityType, setNewEntityType] = useState("PERSON");
  const [newEntityRole, setNewEntityRole] = useState("Investigative Subject");

  // Related Link / Relationship Builder
  const [relationSourceId, setRelationSourceId] = useState("");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("ASSOCIATED_WITH");
  const [relationNotes, setRelationNotes] = useState("");

  // Attachments — Phase 4 Req21: real device capture (camera / voice notes / scans).
  const [attachmentList, setAttachmentList] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordChunksRef = React.useRef<Blob[]>([]);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const audioInputRef = React.useRef<HTMLInputElement>(null);
  const docInputRef = React.useRef<HTMLInputElement>(null);

  // UI status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // SAHAYAK auto-fill: candidates extracted from an uploaded file. Tapping a
  // chip fills the subject-tagging field; known case targets auto-link below.
  const [extractedHints, setExtractedHints] = useState<Array<{ label: string; type: string }>>([]);
  const [autoFillMsg, setAutoFillMsg] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);

  const normType = (t: string) =>
    ["PERSON", "VEHICLE", "LOCATION", "PHONE"].includes(String(t || "").toUpperCase())
      ? String(t).toUpperCase()
      : "PERSON";

  const autoFillFromFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setAutoFilling(true);
    setAutoFillMsg(null);
    try {
      let filled = 0;
      for (const f of arr) {
        let converted: { text: string; via: string } | null = null;
        try {
          converted = await fileToText(f);
        } catch {
          converted = null;
        }
        if (!converted?.text.trim()) continue;
        const snippet = converted.text.slice(0, 8000);
        setNarrative((prev) =>
          prev.includes(snippet.slice(0, 60))
            ? prev
            : `${prev}${prev.trim() ? "\n\n" : ""}[Auto-extracted from ${f.name}]\n${snippet}`
        );
        filled++;
        // Entity candidates → subject-tagging suggestions + known-target links.
        try {
          const res = await sahayakApi.extract(converted.text.slice(0, 12000), f.name);
          const cands = (res.nodes || [])
            .filter((n: any) => n?.label)
            .slice(0, 6)
            .map((n: any) => ({ label: String(n.label), type: normType(n.type) }));
          if (cands.length > 0) {
            setExtractedHints((prev) => {
              const seen = new Set(prev.map((p) => p.label.toLowerCase()));
              return [...prev, ...cands.filter((c: { label: string }) => !seen.has(c.label.toLowerCase()))].slice(0, 12);
            });
            const first = cands[0];
            setNewEntityLabel((prev) => prev || first.label);
            setNewEntityType((prev) => (prev === "PERSON" && first.type !== "PERSON" ? first.type : prev));
            const matched = cands
              .map((c: { label: string }) => entities.find((e) => String(e.label || "").toLowerCase() === c.label.toLowerCase()))
              .filter(Boolean);
            if (matched.length > 0) {
              setRelationSourceId((prev) => prev || matched[0].id);
              if (matched.length > 1) setRelationTargetId((prev) => prev || matched[1].id);
            }
          }
        } catch {
          /* extraction is best-effort; the narrative text is already filled */
        }
      }
      setAutoFillMsg(
        filled > 0
          ? `Narrative + subject tags auto-filled from ${filled} file(s) — review before submitting.`
          : "Photo/audio attached — describe what it shows in the narrative; text files auto-fill this form."
      );
    } finally {
      setAutoFilling(false);
    }
  };

  const handlePickedFiles = (files: FileList | null | File[], mediaCategory: "PHOTO" | "AUDIO" | "DOCUMENT" | "VIDEO") => {
    if (!files) return;
    pushFiles(files, mediaCategory);
    void autoFillFromFiles(files);
  };

  // Field Report Form State
  const [reportTitle, setReportTitle] = useState("");
  const [reportType, setReportType] = useState("FIELD_INTERDICTION_MEMO");
  const [reportText, setReportText] = useState("");

  const loadCaseData = async (caseIdToLoad: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await caseApi.getCaseState(caseIdToLoad);
      setCaseState(data);
      setObservations(data.observations || []);
      setEntities(data.nodes || []);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load case data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentCaseId) {
      loadCaseData(currentCaseId);
    }
  }, [currentCaseId]);

  const pushFiles = (files: FileList | File[], mediaCategory: "PHOTO" | "AUDIO" | "DOCUMENT" | "VIDEO") => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const mapped = arr.map((f) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      fileName: f.name || `${mediaCategory.toLowerCase()}-${Date.now()}`,
      fileType: f.type || "application/octet-stream",
      fileSize: f.size,
      fileSizeFormatted: formatBytesLocal(f.size),
      mediaCategory,
      capturedAt: new Date().toISOString(),
    }));
    setAttachmentList((prev) => [...prev, ...mapped]);
  };

  const toggleVoiceNote = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      audioInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: rec.mimeType || "audio/webm" });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type });
        pushFiles([file], "AUDIO");
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch {
      audioInputRef.current?.click();
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachmentList((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmitObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !narrative.trim()) {
      setErrorMessage("Please enter an Observation Title and Detailed Narrative.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Build related entities list
    const relatedEntities: any[] = [];
    if (selectedEntityId) {
      const matched = entities.find((e) => e.id === selectedEntityId);
      if (matched) {
        relatedEntities.push({
          id: matched.id,
          label: matched.label,
          type: matched.type,
          role: matched.role || "Investigative Subject",
        });
      }
    }
    if (newEntityLabel.trim()) {
      relatedEntities.push({
        id: `field-ent-${Date.now()}`,
        label: newEntityLabel.trim(),
        type: newEntityType,
        role: newEntityRole,
      });
    }

    // Build observed relationships
    const observedRelationships: any[] = [];
    if (relationSourceId && relationTargetId) {
      observedRelationships.push({
        sourceId: relationSourceId,
        targetId: relationTargetId,
        relationType,
        notes: relationNotes || "Field observed interaction",
      });
    }

    // Seal attached case files as exhibits first (PDF/DOC/images/audio/video):
    // text-bearing files are converted to text via SAHAYAK so the Lead's
    // Extracted-data queue fills. A file failure never blocks the observation.
    const sealedAttachments: any[] = [];
    const fileWarnings: string[] = [];
    for (const att of attachmentList) {
      if (!att.file) continue;
      try {
        const up = await uploadExhibitFile(currentCaseId, att.file as File);
        sealedAttachments.push({
          id: att.id,
          fileName: att.fileName,
          fileType: att.fileType,
          fileSize: att.fileSize,
          fileSizeFormatted: att.fileSizeFormatted,
          mediaCategory: att.mediaCategory,
          capturedAt: att.capturedAt,
          exhibitId: up.id,
          exhibitKind: up.kind,
          textConverted: up.withText,
        });
      } catch (err: any) {
        fileWarnings.push(`${att.fileName}: ${err.message || "seal failed"}`);
        sealedAttachments.push({
          id: att.id,
          fileName: att.fileName,
          fileType: att.fileType,
          fileSize: att.fileSize,
          fileSizeFormatted: att.fileSizeFormatted,
          mediaCategory: att.mediaCategory,
          capturedAt: att.capturedAt,
        });
      }
    }

    try {
      const token = localStorage.getItem("crim_intel_token");
      let vpn: string | null = null;
      try {
        vpn = sessionStorage.getItem("crim_intel_vpn");
      } catch {
        vpn = null;
      }
      const res = await fetch(apiUrl(`/api/cases/${currentCaseId}/observations`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(vpn ? { "X-VPN-Session": vpn } : {}),
        },
        body: JSON.stringify({
          observationType,
          title: title.trim(),
          narrative: narrative.trim(),
          locationName: locationName.trim() || "Field Location",
          lat: gps?.lat,
          lng: gps?.lng,
          relatedEntities,
          observedRelationships,
          attachments: sealedAttachments,
          tags: [observationType, "FIELD_COLLECTION"],
          confidenceScore: 0.95,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit observation");

      const sealed = sealedAttachments.filter((a) => a.exhibitId).length;
      setSuccessMessage(
        `Field observation recorded and staged for Lead review — it appears in the Intake Pipeline in real time. Nothing reaches the graph before approval.` +
        (sealed > 0 ? ` ${sealed} file(s) sealed as exhibits${fileWarnings.length ? "" : " with text conversion"}.` : "") +
        (fileWarnings.length > 0 ? ` File warnings: ${fileWarnings.join("; ")}` : "")
      );
      setTitle("");
      setNarrative("");
      setLocationName("");
      setGps(null);
      setSelectedEntityId("");
      setNewEntityLabel("");
      setRelationSourceId("");
      setRelationTargetId("");
      setRelationNotes("");
      setAttachmentList([]);

      // Reload
      await loadCaseData(currentCaseId);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit observation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitFieldReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim() || !reportText.trim()) {
      setErrorMessage("Report Title and Content are required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem("crim_intel_token");
      let vpnReport: string | null = null;
      try {
        vpnReport = sessionStorage.getItem("crim_intel_vpn");
      } catch {
        vpnReport = null;
      }
      const res = await fetch(apiUrl(`/api/cases/${currentCaseId}/field-report`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(vpnReport ? { "X-VPN-Session": vpnReport } : {}),
        },
        body: JSON.stringify({
          title: reportTitle.trim(),
          reportType,
          textContent: reportText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit report");

      setSuccessMessage("Field report staged for Lead review with cryptographic SHA-256 fingerprint — watch the Intake Pipeline for approval.");
      setReportTitle("");
      setReportText("");

      await loadCaseData(currentCaseId);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit field report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-slate-950">
      {/* Real-time Notification */}
      {realtimeNotification && (
        <div className="fixed top-4 right-4 z-50 p-4 rounded-2xl bg-slate-900/95 border border-blue-500/50 shadow-2xl backdrop-blur-md max-w-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <strong className="text-xs font-bold text-blue-300 uppercase font-mono">
                {realtimeNotification.type}
              </strong>
            </div>
            <button onClick={clearNotification} className="text-slate-400 hover:text-slate-200 text-xs font-mono">
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-200 mt-1.5">{realtimeNotification.details || realtimeNotification.message}</p>
          <div className="mt-2 text-[10px] font-mono text-slate-400">
            By: {(realtimeNotification as any).actor_name || (realtimeNotification as any).user_name || "Unknown"} ({(realtimeNotification as any).actor_role || (realtimeNotification as any).user_role || "System"})
          </div>
        </div>
      )}

      {/* 1. TOP HEADER & OFFICER DUTY STATUS */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-100 font-mono">
                TRINETRA OS
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">
                FIELD INVESTIGATOR PORTAL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {user ? matrixFor(orgOf(user.role)).field.mandate : "Field Information Collection, Suspect Sightings & Sighting Interdiction Terminal"}
            </p>
            {user && (
              <p className="text-[10px] font-mono text-blue-300/80 mt-0.5">
                {matrixFor(orgOf(user.role)).field.title} · staff: {matrixFor(orgOf(user.role)).field.staffingPrefix}* ·{" "}
                {departmentForUser(user.role, user.agency || "", user.official_id || "").fullName}
              </p>
            )}
          </div>
        </div>

        {/* User Identity & Case Selector */}
        <div className="flex items-center gap-3">
          {/* Case Selector */}
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <FolderGit2 className="w-4 h-4 text-blue-400" />
            <select
              value={currentCaseId}
              onChange={(e) => setCurrentCaseId(e.target.value)}
              className="bg-transparent text-xs font-mono font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              {authorizedCases.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                  {c.codeName} • {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Officer Badge Profile */}
          <div className="flex items-center gap-2.5 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300 font-mono">
              {user?.name?.slice(0, 2).toUpperCase() || "IO"}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-xs font-semibold text-slate-200 block leading-tight">{user?.name}</span>
              <span className="text-[10px] font-mono text-slate-400 block leading-tight">{user?.official_id}</span>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 border border-slate-700 text-slate-400 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="bg-slate-900/50 border-b border-slate-800/80 px-4 sm:px-8 py-2 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("submit_observation")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "submit_observation"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Log Field Sighting / Observation</span>
        </button>

        <button
          onClick={() => setActiveTab("observations_log")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "observations_log"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Sightings & Observations Ledger ({observations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("field_reports")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "field_reports"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Field Intelligence Reports</span>
        </button>

      </div>

      {/* Active Incident Brief (Changes.md Field portal) */}
      {(() => {
        const brief = authorizedCases.find((c: any) => c.id === currentCaseId);
        if (!brief) return null;
        return (
          <div className="px-4 sm:px-8 pt-4">
            <div className="max-w-7xl mx-auto rounded-2xl bg-blue-600/10 border border-blue-500/30 p-4">
              <div className="text-[10px] font-mono font-bold text-blue-300 uppercase tracking-widest">Active Incident Brief</div>
              <div className="text-sm font-bold text-slate-100 mt-0.5">{brief.codeName} · {brief.name}</div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{brief.description}</p>
            </div>
          </div>
        );
      })()}

      {/* 3. MAIN CONTENT CONTAINER */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Status Alerts */}
        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200 font-bold">
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: SUBMIT FIELD OBSERVATION */}
        {activeTab === "submit_observation" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: The Observation Intake Form */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">Log Field Sighting & Surveillance Intel</h2>
                    <p className="text-xs text-slate-400">Structured by the Reconstructor and staged for Lead review — never writes the graph directly</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 font-semibold">
                  SECTION 65B COMPLIANT
                </span>
              </div>

              <form onSubmit={handleSubmitObservation} className="space-y-4">
                {/* 1. Observation Type Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Observation Classification <span className="text-blue-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: "SUSPECT_SIGHTING", label: "Suspect Sighting", icon: UserCheck },
                      { id: "LOCATION_SURVEILLANCE", label: "Location Stakeout", icon: MapPin },
                      { id: "VEHICLE_TRACKING", label: "Vehicle / Convoy", icon: Camera },
                      { id: "FIELD_INTEL_NOTE", label: "Informer Intel", icon: FileText },
                      { id: "RELATIONSHIP_OBSERVED", label: "Observed Handshake", icon: Link2 },
                    ].map((t) => {
                      const Icon = t.icon;
                      const isSelected = observationType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setObservationType(t.id as any)}
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2 text-xs font-medium transition-all ${isSelected
                            ? "bg-blue-600 border-blue-500 text-white shadow"
                            : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                            }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Title & Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Observation Title / Headline <span className="text-blue-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Sighting: White Fortuner escorting container truck at Vashi"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Sighting Location / Sector <span className="text-blue-400">*</span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        required
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        placeholder="e.g. Vashi Toll Plaza / Panvel Junction"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!navigator.geolocation) {
                            setErrorMessage("GPS is unavailable on this device.");
                            return;
                          }
                          setGpsBusy(true);
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
                              setGpsBusy(false);
                            },
                            () => {
                              setErrorMessage("Could not acquire GPS fix. Enter the location manually.");
                              setGpsBusy(false);
                            },
                            { enableHighAccuracy: true, timeout: 15000 }
                          );
                        }}
                        disabled={gpsBusy}
                        className="px-2.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-200 text-xs font-semibold shrink-0 disabled:opacity-50"
                        title="Tag current GPS coordinates to this observation"
                      >
                        {gpsBusy ? "…" : gps ? `GPS ${gps.lat.toFixed(4)},${gps.lng.toFixed(4)}` : "Tag GPS"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Detailed Narrative */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Detailed Field Narrative & Context <span className="text-blue-400">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    placeholder="Provide chronological details, subject behaviors, descriptions, vehicle plates, escort patterns, package handovers... (auto-fills when you attach a text/PDF/Word file)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {(autoFilling || autoFillMsg) && (
                    <p className="text-[11px] font-mono text-blue-300/90 mt-1">
                      {autoFilling ? "SAHAYAK is reading the attached file…" : autoFillMsg}
                    </p>
                  )}
                </div>

                {/* 4. Subject Association / Entity Resolution */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Entity Resolution & Subject Tagging</span>
                  </div>

                  {extractedHints.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {extractedHints.map((h) => (
                        <button
                          key={h.label}
                          type="button"
                          onClick={() => {
                            setNewEntityLabel(h.label);
                            setNewEntityType(h.type);
                          }}
                          title={`Fill subject field with ${h.label}`}
                          className="px-2 py-1 rounded-lg bg-blue-600/15 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 text-[11px] font-mono transition-colors"
                        >
                          ✦ {h.label} <span className="text-blue-400/70">· {h.type}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Select Known Case Target
                      </label>
                      <select
                        value={selectedEntityId}
                        onChange={(e) => setSelectedEntityId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">-- Associate Existing Target --</option>
                        {entities.map((ent) => (
                          <option key={ent.id} value={ent.id}>
                            {ent.label} ({ent.type}) - Risk: {ent.riskScore}%
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Or Add New Sighted Target / Vehicle Plate
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newEntityLabel}
                          onChange={(e) => setNewEntityLabel(e.target.value)}
                          placeholder="e.g. MH-04-AZ-8890"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <select
                          value={newEntityType}
                          onChange={(e) => setNewEntityType(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                        >
                          <option value="PERSON">PERSON</option>
                          <option value="VEHICLE">VEHICLE</option>
                          <option value="LOCATION">LOCATION</option>
                          <option value="PHONE">PHONE</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Relationship Extraction Builder */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Observed Interpersonal Link / Vehicle Association</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Subject A (Source)</label>
                      <select
                        value={relationSourceId}
                        onChange={(e) => setRelationSourceId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        <option value="">-- Source Entity --</option>
                        {entities.filter((ent) => (ent.reviewState || "NEEDS_REVIEW") !== "NEEDS_REVIEW").map((ent) => (
                          <option key={ent.id} value={ent.id}>{ent.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Interaction Type</label>
                      <select
                        value={relationType}
                        onChange={(e) => setRelationType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        <option value="ASSOCIATED_WITH">ASSOCIATED_WITH</option>
                        <option value="MEETS_WITH">MEETS_WITH (Physical)</option>
                        <option value="OWNS">OWNS / DRIVES (Vehicle)</option>
                        <option value="TRAVELS_TO">TRAVELS_TO (Location)</option>
                        <option value="RECEIVES_PACKAGE">RECEIVES_PACKAGE</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Subject B (Target)</label>
                      <select
                        value={relationTargetId}
                        onChange={(e) => setRelationTargetId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        <option value="">-- Target Entity --</option>
                        {entities.filter((ent) => (ent.reviewState || "NEEDS_REVIEW") !== "NEEDS_REVIEW").map((ent) => (
                          <option key={ent.id} value={ent.id}>{ent.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 6. Field capture: live camera, voice notes, FIR scans, dossier files */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Field Capture · Camera / Audio / FIR / Dossier</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Files ≤15GB · sealed + text-converted server-side</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-200 border border-blue-500/40 text-xs font-semibold"
                    >
                      📷 Camera / Photo
                    </button>
                    <button
                      type="button"
                      onClick={toggleVoiceNote}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border ${isRecording
                        ? "bg-rose-500/20 text-rose-200 border-rose-500/50 animate-pulse"
                        : "bg-blue-600/20 hover:bg-blue-600/40 text-blue-200 border-blue-500/40"
                        }`}
                    >
                      {isRecording ? "⏹ Stop voice note" : "🎙 Witness voice note"}
                    </button>
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-200 border border-blue-500/40 text-xs font-semibold"
                    >
                      📄 FIR scan / Dossier
                    </button>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*,video/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handlePickedFiles(e.target.files, "PHOTO");
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handlePickedFiles(e.target.files, "AUDIO");
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.log,.csv,image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handlePickedFiles(e.target.files, "DOCUMENT");
                      e.target.value = "";
                    }}
                  />

                  {attachmentList.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      {attachmentList.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Camera className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-slate-200 font-mono text-[11px]">{att.fileName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({att.fileSizeFormatted})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="text-rose-400 hover:text-rose-200 font-bold text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Ingesting through Canonical Pipeline...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Commit Field Observation to Case Graph</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right 1 Col: Quick Case Briefing & Field Guidelines */}
            <div className="space-y-5">
              {/* Active Duty Status Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                  <Shield className="w-4 h-4 text-blue-400" />
                  <span>Field Authorization Status</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Assigned Workspace</span>
                    <span className="font-mono font-bold text-blue-400">{caseState?.case?.codeName || currentCaseId}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Clearance Level</span>
                    <span className="font-mono font-bold text-slate-200">{user?.role}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Total Sighted Targets</span>
                    <span className="font-mono font-bold text-slate-200">{entities.length} Nodes</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Integrated Field Logs</span>
                    <span className="font-mono font-bold text-emerald-400">{observations.length} Records</span>
                  </div>
                </div>
              </div>

              {/* Field Sighting Protocols */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs text-slate-400">
                <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider font-mono">
                  Sighting Protocols
                </h3>
                <ul className="space-y-2 list-disc list-inside leading-relaxed text-[11px]">
                  <li>All observations are normalized and deduplicated server-side against existing case entities.</li>
                  <li>Photos and surveillance logs are hashed with SHA-256 for Section 65B court submission.</li>
                  <li>Observed relationships immediately trigger real-time updates for Lead Investigators.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OBSERVATIONS LEDGER */}
        {activeTab === "observations_log" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Case Field Observations Ledger</h2>
                <p className="text-xs text-slate-400">Chronological custody record of all field sightings and intel notes</p>
              </div>
              <button
                onClick={() => loadCaseData(currentCaseId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {observations.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No field observations logged yet for this case workspace.
              </div>
            ) : (
              <div className="space-y-3">
                {observations.map((obs) => (
                  <div
                    key={obs._id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {obs.observation_type}
                          </span>
                          <h3 className="text-xs font-bold text-slate-100">{obs.title}</h3>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-rose-400" />
                          <span>{obs.location_name}</span>
                          <span>•</span>
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span className="font-mono">{new Date(obs.timestamp).toLocaleString()}</span>
                        </p>
                      </div>

                      <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {obs.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60 font-mono">
                      {obs.narrative}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900 text-[11px] text-slate-500 font-mono">
                      <div>
                        Submitted By: <span className="text-slate-300 font-semibold">{obs.officer_name}</span> ({obs.officer_badge})
                      </div>
                      {obs.attachments && obs.attachments.length > 0 && (
                        <div className="flex items-center gap-1.5 text-blue-400">
                          <Camera className="w-3.5 h-3.5" />
                          <span>{obs.attachments.length} Evidence Attachments</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FIELD REPORTS & FIRs */}
        {activeTab === "field_reports" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                <FileText className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-slate-100">Submit Formal Field Report / Informer Memo</h2>
              </div>

              <form onSubmit={handleSubmitFieldReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Report Title / Ref ID <span className="text-blue-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    placeholder="e.g. Surat Hawala Courier Interception Memo"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Document Category
                  </label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    {(user ? matrixFor(orgOf(user.role)).field.logTypes : ["FIELD_INTEL_NOTE"]).map((lt) => (
                      <option key={lt} value={lt}>
                        {lt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Report Transcript / Text Content <span className="text-blue-400">*</span>
                  </label>
                  <textarea
                    rows={8}
                    required
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Paste report text, officer statements, seizure records, license plate matches, or informant transcripts..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                >
                  {isSubmitting ? "Ingesting..." : "Ingest & Extract Entities"}
                </button>
              </form>
            </div>

            {/* Phase 4 Req22 — Lead data requisitions assigned to FIELD */}
            <DataRequestInbox caseId={currentCaseId} ownFunctional="FIELD" />
          </div>
        )}
      </main>

      {/* Persistent Mobile Field-Intelligence Action Bar / FAB */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={() => {
            setActiveTab("submit_observation");
            photoInputRef.current?.click();
          }}
          className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.5)] border border-blue-400 active:scale-95 transition-transform"
        >
          <Camera className="w-6 h-6" />
        </button>
      </div>

    </div>
  );
};

function formatBytesLocal(n: number): string {
  if (!n || Number.isNaN(n)) return "0 B";
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
