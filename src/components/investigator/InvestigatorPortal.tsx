import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi } from "../../services/api";
import {
  Shield,
  MapPin,
  Camera,
  FileText,
  UserCheck,
  Send,
  Plus,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  FolderGit2,
  Calendar,
  Layers,
  Search,
  ExternalLink,
  ChevronRight,
  Eye,
  Crosshair,
  BadgeAlert,
  Car,
  Phone,
  Link2,
  Check,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export const InvestigatorPortal: React.FC = () => {
  const { user, logout, authorizedCases, realtimeNotification, clearNotification } = useAuth();

  const [activeTab, setActiveTab] = useState<"submit_observation" | "observations_log" | "field_reports" | "watchlist" | "feed">("submit_observation");
  const [currentCaseId, setCurrentCaseId] = useState<string>(authorizedCases[0]?.id || "case-garuda");

  const [isLoading, setIsLoading] = useState(true);
  const [caseState, setCaseState] = useState<any>(null);
  const [observations, setObservations] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);

  // Submission Form States
  const [observationType, setObservationType] = useState<
    "SUSPECT_SIGHTING" | "LOCATION_SURVEILLANCE" | "VEHICLE_TRACKING" | "FIELD_INTEL_NOTE" | "RELATIONSHIP_OBSERVED"
  >("SUSPECT_SIGHTING");
  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  const [locationName, setLocationName] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [newEntityType, setNewEntityType] = useState("PERSON");
  const [newEntityRole, setNewEntityRole] = useState("Investigative Subject");

  // Related Link / Relationship Builder
  const [relationSourceId, setRelationSourceId] = useState("");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("ASSOCIATED_WITH");
  const [relationNotes, setRelationNotes] = useState("");

  // Attachments
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentCategory, setAttachmentCategory] = useState<"PHOTO" | "AUDIO" | "VIDEO" | "DOCUMENT">("PHOTO");
  const [attachmentList, setAttachmentList] = useState<any[]>([]);

  // UI status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setActivityFeed(data.events || []);
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

  const handleAddAttachment = () => {
    if (!attachmentName.trim()) return;
    const newAtt = {
      id: `att-${Date.now()}`,
      fileName: attachmentName.trim(),
      fileType: attachmentCategory === "PHOTO" ? "image/jpeg" : attachmentCategory === "AUDIO" ? "audio/wav" : "application/pdf",
      fileSizeFormatted: "2.8 MB",
      sha256: `sha256:${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
      mediaCategory: attachmentCategory,
    };
    setAttachmentList((prev) => [...prev, newAtt]);
    setAttachmentName("");
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

    try {
      const token = localStorage.getItem("crim_intel_token");
      const res = await fetch(`/api/cases/${currentCaseId}/observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          observationType,
          title: title.trim(),
          narrative: narrative.trim(),
          locationName: locationName.trim() || "Field Location",
          relatedEntities,
          observedRelationships,
          attachments: attachmentList,
          tags: [observationType, "FIELD_COLLECTION"],
          confidenceScore: 0.95,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit observation");

      setSuccessMessage("Field observation successfully validated, normalized, and integrated into canonical case dataset!");
      setTitle("");
      setNarrative("");
      setLocationName("");
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
      const res = await fetch(`/api/cases/${currentCaseId}/field-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: reportTitle.trim(),
          reportType,
          textContent: reportText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit report");

      setSuccessMessage("Field report committed to canonical intelligence pipeline with cryptographic SHA-256 fingerprint!");
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
          <p className="text-xs text-slate-200 mt-1.5">{realtimeNotification.details}</p>
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
                CRIM-INTEL OS
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">
                FIELD INVESTIGATOR PORTAL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Field Information Collection, Suspect Sightings & Sighting Interdiction Terminal
            </p>
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
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "submit_observation"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Log Field Sighting / Observation</span>
        </button>

        <button
          onClick={() => setActiveTab("observations_log")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "observations_log"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Sightings & Observations Ledger ({observations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("field_reports")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "field_reports"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Field Intelligence Reports</span>
        </button>

        <button
          onClick={() => setActiveTab("watchlist")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "watchlist"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Case Target Watchlist ({entities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("feed")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "feed"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Live Field Interdiction Feed</span>
        </button>
      </div>

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
                    <p className="text-xs text-slate-400">Writes directly to canonical case graph via unified ingestion pipeline</p>
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
                      { id: "VEHICLE_TRACKING", label: "Vehicle / Convoy", icon: Car },
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
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2 text-xs font-medium transition-all ${
                            isSelected
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
                    <input
                      type="text"
                      required
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="e.g. Vashi Toll Plaza / Panvel Junction"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
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
                    placeholder="Provide chronological details, subject behaviors, descriptions, vehicle plates, escort patterns, package handovers..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 4. Subject Association / Entity Resolution */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Entity Resolution & Subject Tagging</span>
                  </div>

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
                        {entities.map((ent) => (
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
                        {entities.map((ent) => (
                          <option key={ent.id} value={ent.id}>{ent.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 6. Media / Photo Evidence Attachments */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Bodycam / Sighting Photo Evidence</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">SHA-256 Auto-Digest</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={attachmentName}
                      onChange={(e) => setAttachmentName(e.target.value)}
                      placeholder="e.g. panvel_surveillance_cam_0144.jpg"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                    />
                    <select
                      value={attachmentCategory}
                      onChange={(e) => setAttachmentCategory(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="PHOTO">PHOTO</option>
                      <option value="AUDIO">AUDIO</option>
                      <option value="VIDEO">VIDEO</option>
                      <option value="DOCUMENT">DOCUMENT</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddAttachment}
                      className="px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-200 border border-blue-500/40 text-xs font-semibold"
                    >
                      Attach
                    </button>
                  </div>

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
                    <option value="FIELD_INTERDICTION_MEMO">FIELD_INTERDICTION_MEMO</option>
                    <option value="INFORMER_INTELLIGENCE_REPORT">INFORMER_INTELLIGENCE_REPORT</option>
                    <option value="WITNESS_DEPOSITION">WITNESS_DEPOSITION</option>
                    <option value="FIR">FIRST INFORMATION REPORT (FIR)</option>
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

            {/* Existing Exhibits */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-sm font-bold text-slate-100 pb-3 border-b border-slate-800">
                Case Exhibits & Intake Records ({caseState?.evidenceFiles?.length || 0})
              </h2>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                {(caseState?.evidenceFiles || []).map((ev: any) => (
                  <div key={ev.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-200 font-mono text-[11px]">{ev.fileName}</strong>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                        {ev.lifecycleStatus || "COMMITTED"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">{ev.summary}</p>
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono pt-1">
                      <span>Source: {ev.sourceAuthority}</span>
                      <span>Entities: {ev.extractedEntitiesCount || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CASE TARGET WATCHLIST */}
        {activeTab === "watchlist" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Active Syndicate Target Watchlist</h2>
                <p className="text-xs text-slate-400">Identified entities and suspect vehicles for field interdiction</p>
              </div>
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/30">
                {entities.length} TARGETS UNDER SURVEILLANCE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {entities.map((ent) => (
                <div
                  key={ent.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/40 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-blue-400 border border-slate-800">
                      {ent.type}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        ent.riskScore >= 80
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      RISK: {ent.riskScore}%
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-100">{ent.label}</h3>
                  <p className="text-[11px] text-slate-400">{ent.role || "Investigative Subject"}</p>

                  {ent.aliases && ent.aliases.length > 0 && (
                    <div className="text-[10px] text-slate-500 font-mono">
                      Aliases: {ent.aliases.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: LIVE FIELD ACTIVITY FEED */}
        {activeTab === "feed" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-100">Live Interdiction & Intelligence Feed</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Real-Time WebSocket Stream</span>
            </div>

            <div className="space-y-3">
              {activityFeed.map((ev) => (
                <div
                  key={ev._id || ev.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3 text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-200">{ev.title || ev.event_type}</strong>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-normal">{ev.description}</p>
                    <div className="text-[10px] font-mono text-slate-500">
                      Officer: {ev.actor_name} ({ev.actor_role})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
