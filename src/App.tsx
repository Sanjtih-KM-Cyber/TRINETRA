import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  CaseDataset,
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
  ShortestPathResult,
  CDRRecord,
  FinancialRecord,
  FIRRecord,
  IntelRecord,
  ReviewState,
  EvidenceFileRecord,
  InvestigatorProfile,
  AuditLogEntry,
  WorkstationTab,
} from "./types";
import {
  SAMPLE_CASES,
  GARUDA_SYNDICATE_NODES,
  GARUDA_SYNDICATE_LINKS,
  GARUDA_FIRS,
  GARUDA_CDRS,
  GARUDA_FINANCIALS,
  GARUDA_INTEL,
  SHADOWVAULT_NODES,
  SHADOWVAULT_LINKS,
  INITIAL_AUDIT_LOGS,
} from "./data/mockDatasets";
import { computeGraphAnalytics, detectSuspiciousPatterns, findShortestPath } from "./services/graphEngine";
import { generateFileHash } from "./services/nlpExtractor";
import { InvestigativeStep } from "./services/actionableIntelEngine";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import { LoginView } from "./components/auth/LoginView";
import { ForceChangePasswordView } from "./components/auth/ForceChangePasswordView";
import { AdminPortal } from "./components/admin/AdminPortal";
import { ForensicPortal } from "./components/forensic/ForensicPortal";
import { InvestigatorPortal } from "./components/investigator/InvestigatorPortal";
import { MyCasesView } from "./components/cases/MyCasesView";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { GraphCanvas } from "./components/GraphCanvas";
import { PatternAlerts } from "./components/PatternAlerts";
import { GeoTimelineView } from "./components/GeoTimelineView";
import { DataIngestionHub } from "./components/DataIngestionHub";
import { InvestigatorRbacHub } from "./components/InvestigatorRbacHub";
import { EntityDetailDrawer } from "./components/EntityDetailDrawer";
import { RelationshipDetailDrawer } from "./components/RelationshipDetailDrawer";
import { AddEvidenceModal } from "./components/AddEvidenceModal";
import { SahayakDrawer } from "./components/sahayak/SahayakDrawer";
import { DossierModal } from "./components/DossierModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CreateCaseModal } from "./components/CreateCaseModal";
import { CaseArchiveManager } from "./components/CaseArchiveManager";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { Shield, Radio, Eye } from "lucide-react";
import { VPNGatewayPage } from "./components/VPNGatewayPage";
import { ProceedingsHub } from "./components/proceedings/ProceedingsHub";
import { StagingHub } from "./components/staging/StagingHub";
import { CyberHub } from "./components/cyber/CyberHub";
import { stagingApi, caseApi, removeStoredToken } from "./services/api";
import { apiUrl } from "./services/apiBase";
import { dbEntityToNode, dbRelationshipToLink, mergeNodes, mergeLinks } from "./services/graphSync";
import { AgencyDashboard } from "./components/departments/AgencyDashboard";
import { departmentForUser, landingForRole } from "./services/roleRouting";
import { isAdmin, isForensic, isField, isLead, isCyber, orgOf } from "./data/roles";
import { matrixFor } from "./data/roleMatrices";
import { SahayakPanel } from "./components/sahayak/SahayakPanel";
import { applyDepartmentTheme } from "./services/theme";
import { vpnApi } from "./services/vpn";

function WorkstationApp() {
  const { user, isAuthenticated, isLoading, logout, realtimeNotification, clearNotification, refreshUser, mustChangePassword, clearMustChangePassword } = useAuth();

  // Phase 0 — VPN gate mount: no workstation renders until the TLS tunnel exists.
  const [vpnChecked, setVpnChecked] = useState(false);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [showAgencyHome, setShowAgencyHome] = useState(true);
  // Per-officer language persistence: bind the store to the signed-in
  // officer so their choice survives logout/login on a shared workstation.
  const { setOwnerId } = useLanguage();
  useEffect(() => {
    setOwnerId(user?._id ?? null);
  }, [user?._id, setOwnerId]);

  // Phase 2 — per-case access level, map focus signal, staging live-refresh
  // (effects wired after currentCase is declared, below)
  const [myAccess, setMyAccess] = useState<{ role: string; access: "FULL_EDIT" | "VIEW_ONLY" } | null>(null);
  const [mapFocus, setMapFocus] = useState<{ nodeId: string; nonce: number } | null>(null);
  const [stagingSignal, setStagingSignal] = useState(0);
  const readOnly = myAccess?.access === "VIEW_ONLY";

  useEffect(() => {
    let cancelled = false;
    vpnApi
      .status()
      .then((s) => {
        if (!cancelled) {
          setVpnConnected(!!s.connected);
          setVpnChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVpnConnected(false);
          setVpnChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleVpnAuthenticated = async () => {
    // Fresh tunnel ⇒ fresh Officer Sign-In. A previous officer session
    // (stale JWT, idle-timeout kick, shared workstation) must NEVER be
    // silently restored into the new tunnel — drop it first so this lands
    // on the login page, never the main dashboard.
    removeStoredToken();
    await refreshUser().catch(() => undefined);
    try {
      const s = await vpnApi.status();
      setVpnConnected(!!s.connected);
    } catch {
      setVpnConnected(true);
    }
    setShowAgencyHome(true);
  };

  // Phase 1 Req2 — dynamic department theming: shell/nav follow the
  // gov-ID-resolved agency palette for the signed-in officer.
  useEffect(() => {
    if (user) {
      try {
        applyDepartmentTheme(departmentForUser(user.role, user.agency || "", user.official_id || ""));
      } catch {
        applyDepartmentTheme(null);
      }
    } else {
      applyDepartmentTheme(null);
    }
  }, [user]);

  // Case Datasets
  const [allCases, setAllCases] = useState<CaseDataset[]>(SAMPLE_CASES);
  const [currentCase, setCurrentCase] = useState<CaseDataset>(SAMPLE_CASES[0]);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);

  // Phase 2 — my access level for the active case (VIEW_ONLY after transfer)
  useEffect(() => {
    if (!user || !currentCase?.id) {
      setMyAccess(null);
      return;
    }
    let cancelled = false;
    stagingApi
      .getMyAccess(currentCase.id)
      .then((a) => {
        if (!cancelled) setMyAccess(a);
      })
      .catch(() => {
        if (!cancelled) setMyAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, currentCase?.id]);

  // Phase 2 — live pipeline sync: staging/transfer WS events refresh the hub;
  // a transfer execution re-reads our own access level immediately.
  // Phase 3 Req14 — CASE_CREATED / TEAM_UPDATED refresh the workspace list live.
  // (Graph data merge lives in a later effect, after graph state is declared.)
  useEffect(() => {
    const evt = (realtimeNotification as unknown as { event_type?: string })?.event_type;
    if (!evt) return;
    if (evt === "CASE_CREATED" || evt === "TEAM_UPDATED" || evt === "POC_UPDATED") {
      setWorkspaceSignal((s) => s + 1);
      refreshUser().catch(() => undefined);
    }
    // Raw exhibits land in the Lead triage queue the moment they upload.
    if (evt.startsWith("STAGING_") || evt.startsWith("TRANSFER_") || evt === "INGESTION_STAGED" || evt === "EVIDENCE_UPLOADED" || evt === "EVIDENCE_SHARED" || evt === "REQUISITION_CREATED" || evt === "REQUISITION_DECIDED" || evt === "DOSSIER_SIGNED") {
      setStagingSignal((s) => s + 1);
    }
    if (evt === "TRANSFER_EXECUTED" && currentCase?.id) {
      stagingApi
        .getMyAccess(currentCase.id)
        .then((a) => setMyAccess(a))
        .catch(() => undefined);
      refreshUser().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeNotification]);

  // Active Officer Profile derived from authenticated user
  const currentOfficer: InvestigatorProfile = useMemo(() => {
    if (!user) {
      return {
        id: "OFFICER-001",
        name: "SP Rohit Inamdar, IPS",
        rank: "Superintendent of Police (Lead IO)",
        badgeNumber: "CID-LEAD-310",
        department: "Multi-District Investigations",
        agency: "Crime Investigation Department (CID)",
        role: "CID_LEAD",
        avatarColor: "#f59e0b",
        status: "ACTIVE",
        currentActivity: "Active Syndicate Interdiction",
        permissions: {
          canSignDossier: true,
          canConfirmEvidence: true,
          canRejectEvidence: true,
          canAddHypothesis: true,
          canIngestData: true,
          canExportData: true,
        },
      };
    }

    return {
      id: user._id,
      name: user.name,
      rank: user.designation,
      badgeNumber: user.official_id,
      department: user.department,
      agency: user.agency,
      role: user.role,
      avatarColor: String(user.role).endsWith("_ADMIN")
        ? "#6366f1"
        : String(user.role).endsWith("_LEAD")
          ? "#f59e0b"
          : String(user.role).endsWith("_CYBER")
            ? "#06b6d4"
            : String(user.role).endsWith("_FORENSIC")
              ? "#10b981"
              : "#3b82f6",
      status: "ACTIVE",
      currentActivity: "Active Syndicate Interdiction & Graph Reasoning",
      permissions: user.permissions || {
        canSignDossier: String(user.role).endsWith("_LEAD") || String(user.role).endsWith("_ADMIN"),
        canConfirmEvidence: String(user.role).endsWith("_LEAD") || String(user.role).endsWith("_ADMIN"),
        canRejectEvidence: String(user.role).endsWith("_LEAD") || String(user.role).endsWith("_ADMIN"),
        canAddHypothesis: String(user.role).endsWith("_LEAD") || String(user.role).endsWith("_ADMIN"),
        canIngestData: !String(user.role).endsWith("_LEAD"),
        canExportData: true,
      },
    };
  }, [user]);

  // Case-specific data cache to preserve newly added records across case switching
  const [caseDataMap, setCaseDataMap] = useState<
    Record<
      string,
      {
        nodes: CrimeNetworkNode[];
        links: CrimeNetworkLink[];
        firs: FIRRecord[];
        cdrs: CDRRecord[];
        financials: FinancialRecord[];
        intels: IntelRecord[];
        evidenceFiles?: EvidenceFileRecord[];
      }
    >
  >({
    "CASE-GARUDA-2026": {
      nodes: GARUDA_SYNDICATE_NODES,
      links: GARUDA_SYNDICATE_LINKS,
      firs: GARUDA_FIRS,
      cdrs: GARUDA_CDRS,
      financials: GARUDA_FINANCIALS,
      intels: GARUDA_INTEL,
      evidenceFiles: SAMPLE_CASES[0].evidenceFiles,
    },
    "CASE-SHADOWVAULT-2026": {
      nodes: SHADOWVAULT_NODES,
      links: SHADOWVAULT_LINKS,
      firs: [],
      cdrs: [],
      financials: [],
      intels: [],
      evidenceFiles: SAMPLE_CASES[1].evidenceFiles,
    },
  });

  // Raw Graph Elements for current active case
  const [nodes, setNodes] = useState<CrimeNetworkNode[]>(GARUDA_SYNDICATE_NODES);
  const [links, setLinks] = useState<CrimeNetworkLink[]>(GARUDA_SYNDICATE_LINKS);
  const [firs, setFirs] = useState<FIRRecord[]>(GARUDA_FIRS);
  const [cdrs, setCdrs] = useState<CDRRecord[]>(GARUDA_CDRS);
  const [financials, setFinancials] = useState<FinancialRecord[]>(GARUDA_FINANCIALS);
  const [intels, setIntels] = useState<IntelRecord[]>(GARUDA_INTEL);

  // Graph ↔ server sync: merge newly approved staging items into the canvas
  // whenever the pipeline signal fires (idempotent, dedupes by id).
  const graphSyncSeen = useRef(0);
  useEffect(() => {
    if (stagingSignal === 0 || !currentCase?.id) return;
    if (graphSyncSeen.current === stagingSignal) return;
    graphSyncSeen.current = stagingSignal;
    const cid = currentCase.id;
    caseApi
      .getCaseState(cid)
      .then((state) => {
        setNodes((prev) => mergeNodes(prev, (state.nodes || []).map(dbEntityToNode)));
        setLinks((prev) => mergeLinks(prev, (state.links || []).map(dbRelationshipToLink)));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagingSignal]);

  // Active View Tab: Defaults to 'overview' for the command dashboard experience
  const [activeTab, setActiveTab] = useState<WorkstationTab>("overview");

  // Changes.md portals — Lead: overview/graph/patterns/geo/sahayak/staging.
  // Cyber: ingestion console + cyber cell only.
  useEffect(() => {
    if (!user) return;
    if (isLead(user.role) && (activeTab === "ingest" || activeTab === "cyber" || activeTab === "proceedings")) {
      setActiveTab("sahayak");
    }
    // Cyber personnel choose their case first (workspace), then land on the
    // single case-scoped Cyber Console.
    if (isCyber(user.role) && activeTab !== "cyber") {
      setActiveTab("cyber");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab]);

  // Sidebar collapse toggle & Mobile drawer toggle
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Selection & Highlight State
  const [selectedNode, setSelectedNode] = useState<CrimeNetworkNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<CrimeNetworkLink | null>(null);
  const [shortestPath, setShortestPath] = useState<ShortestPathResult | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<SuspiciousPattern | null>(null);

  // Drawers & Modals
  const [isSahayakOpen, setIsSahayakOpen] = useState(false);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isAddEvidenceOpen, setIsAddEvidenceOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  // Phase 3 Req13 — My Workspace is the default entry point after authentication.
  const [isCasesViewOpen, setIsCasesViewOpen] = useState(true);
  // Phase 3 Req14 — bumped on CASE_CREATED so the workspace list refreshes live.
  const [workspaceSignal, setWorkspaceSignal] = useState(0);

  // Phase 8 Req32 — import is server-side (POST /api/cases/import); the
  // manager calls the API itself, then we refresh auth + workspace.
  const handleImportCaseArchive = async () => {
    setWorkspaceSignal((s) => s + 1);
    await refreshUser().catch(() => undefined);
  };

  // Save current case state to caseDataMap whenever nodes/links change
  useEffect(() => {
    setCaseDataMap((prev) => ({
      ...prev,
      [currentCase.id]: {
        nodes,
        links,
        firs,
        cdrs,
        financials,
        intels,
        evidenceFiles: currentCase.evidenceFiles,
      },
    }));
  }, [nodes, links, firs, cdrs, financials, intels, currentCase]);

  // Switch Active Case dataset
  const handleSelectCase = (targetCase: CaseDataset) => {
    setCurrentCase(targetCase);
    setSelectedNode(null);
    setSelectedLink(null);
    setShortestPath(null);
    setSelectedPattern(null);

    const cached = caseDataMap[targetCase.id];
    if (cached) {
      setNodes(cached.nodes);
      setLinks(cached.links);
      setFirs(cached.firs);
      setCdrs(cached.cdrs);
      setFinancials(cached.financials);
      setIntels(cached.intels);
    } else if (targetCase.id === "CASE-GARUDA-2026") {
      setNodes(GARUDA_SYNDICATE_NODES);
      setLinks(GARUDA_SYNDICATE_LINKS);
      setFirs(GARUDA_FIRS);
      setCdrs(GARUDA_CDRS);
      setFinancials(GARUDA_FINANCIALS);
      setIntels(GARUDA_INTEL);
    } else if (targetCase.id === "CASE-SHADOWVAULT-2026") {
      setNodes(SHADOWVAULT_NODES);
      setLinks(SHADOWVAULT_LINKS);
      setFirs([]);
      setCdrs([]);
      setFinancials([]);
      setIntels([]);
    } else {
      setNodes(targetCase.nodes || []);
      setLinks(targetCase.links || []);
      setFirs(targetCase.firs || []);
      setCdrs(targetCase.cdrs || []);
      setFinancials(targetCase.financials || []);
      setIntels(targetCase.intels || []);
    }
  };

  // Phase 3 Req14/16 — cases originate server-side (ADMIN-only POST /api/cases).
  // The modal calls the API itself; this refreshes auth + workspace on success.
  const handleCreateCase = async () => {
    setIsCreateCaseOpen(false);
    setWorkspaceSignal((s) => s + 1);
    await refreshUser().catch(() => undefined);
  };

  // Run Graph Analytics Engine (Centrality, Communities, Cut-Vertices, Patterns)
  const { analyzedNodes, communities, cutVertices } = useMemo(() => {
    return computeGraphAnalytics(nodes, links);
  }, [nodes, links]);

  const detectedPatterns = useMemo(() => {
    return detectSuspiciousPatterns(analyzedNodes, links, firs, cdrs, financials, intels);
  }, [analyzedNodes, links, firs, cdrs, financials, intels]);

  // Highlighted IDs from selected pattern
  const highlightedPatternNodeIds = useMemo(() => {
    return selectedPattern ? selectedPattern.involvedNodeIds : [];
  }, [selectedPattern]);

  const highlightedPatternLinkIds = useMemo(() => {
    return selectedPattern ? selectedPattern.involvedLinkIds : [];
  }, [selectedPattern]);

  // Handler for Ingesting Extracted NLP / CDR / Financial data
  const handleIngestExtractedData = (
    newNodes: CrimeNetworkNode[],
    newLinks: CrimeNetworkLink[],
    newCdrs?: CDRRecord[],
    newFins?: FinancialRecord[],
    newEvidenceFiles?: EvidenceFileRecord[],
    newIntels?: IntelRecord[]
  ) => {
    setNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const filtered = newNodes.filter((n) => !existingIds.has(n.id));
      return [...prev, ...filtered];
    });

    setLinks((prev) => {
      const existingLinkIds = new Set(prev.map((l) => l.id));
      const filtered = newLinks.filter((l) => !existingLinkIds.has(l.id));
      return [...prev, ...filtered];
    });

    if (newCdrs && newCdrs.length > 0) {
      setCdrs((prev) => [...prev, ...newCdrs]);
    }

    if (newFins && newFins.length > 0) {
      setFinancials((prev) => [...prev, ...newFins]);
    }

    if (newEvidenceFiles && newEvidenceFiles.length > 0) {
      setCurrentCase((prev) => ({
        ...prev,
        evidenceFiles: [...(prev.evidenceFiles || []), ...newEvidenceFiles],
      }));
    }

    if (newIntels && newIntels.length > 0) {
      setIntels((prev) => [...prev, ...newIntels]);
    }
  };

  // Handler to update Node Review State
  const authHeaders = () => {
    const token = localStorage.getItem("crim_intel_token");
    let vpn: string | null = null;
    try {
      vpn = sessionStorage.getItem("crim_intel_vpn");
    } catch {
      vpn = null;
    }
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(vpn ? { "X-VPN-Session": vpn } : {}),
    };
  };

  const handleUpdateNodeReviewState = async (nodeId: string, newState: ReviewState) => {
    // Optimistic UI update (realtime color coding + confirm/review/reject semantics)
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, reviewState: newState } : n))
    );
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode((prev) => (prev ? { ...prev, reviewState: newState } : null));
    }

    // Persist to backend (JWT + VPN session headers required)
    try {
      const res = await fetch(apiUrl(`/api/cases/${currentCase.id}/nodes/${nodeId}/review`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ reviewState: newState }),
      });
      if (!res.ok) console.error("Failed to persist node review state:", res.status);
    } catch (err) {
      console.error("Failed to persist node review state:", err);
    }
  };

  // Handler to add Node Investigator Note
  const handleAddNodeNote = async (nodeId: string, noteText: string) => {
    const newNote = {
      id: `NOTE-${Date.now()}`,
      targetId: nodeId,
      author: `${currentOfficer.name} (${currentOfficer.rank})`,
      text: noteText,
      timestamp: new Date().toISOString(),
    };
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
            ...n,
            investigatorNotesList: [...(n.investigatorNotesList || []), newNote],
          }
          : n
      )
    );
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode((prev) =>
        prev
          ? {
            ...prev,
            investigatorNotesList: [...(prev.investigatorNotesList || []), newNote],
          }
          : null
      );
    }

    // Persist to backend via entity update (notes stored in entity)
    try {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        await fetch(apiUrl(`/api/cases/${currentCase.id}/nodes`), {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: JSON.stringify({
            ...node,
            investigatorNotesList: [...(node.investigatorNotesList || []), newNote],
          }),
        });
      }
    } catch (err) {
      console.error("Failed to persist node note:", err);
    }
  };

  // Handler to update Link Review State
  const handleUpdateLinkReviewState = async (linkId: string, newState: ReviewState) => {
    // Optimistic UI update
    setLinks((prev) =>
      prev.map((l) => (l.id === linkId ? { ...l, reviewState: newState } : l))
    );
    if (selectedLink && selectedLink.id === linkId) {
      setSelectedLink((prev) => (prev ? { ...prev, reviewState: newState } : null));
    }

    // Persist to backend (JWT + VPN session headers required)
    try {
      const res = await fetch(apiUrl(`/api/cases/${currentCase.id}/links/${linkId}/review`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ reviewState: newState }),
      });
      if (!res.ok) console.error("Failed to persist link review state:", res.status);
    } catch (err) {
      console.error("Failed to persist link review state:", err);
    }
  };

  // Handler to add Link Investigator Note
  const handleAddLinkNote = async (linkId: string, noteText: string) => {
    const newNote = {
      id: `NOTE-LINK-${Date.now()}`,
      targetId: linkId,
      author: `${currentOfficer.name} (${currentOfficer.rank})`,
      text: noteText,
      timestamp: new Date().toISOString(),
    };
    setLinks((prev) =>
      prev.map((l) =>
        l.id === linkId
          ? {
            ...l,
            investigatorNotesList: [...(l.investigatorNotesList || []), newNote],
          }
          : l
      )
    );
    if (selectedLink && selectedLink.id === linkId) {
      setSelectedLink((prev) =>
        prev
          ? {
            ...prev,
            investigatorNotesList: [...(prev.investigatorNotesList || []), newNote],
          }
          : null
      );
    }

    // Persist to backend via relationship update
    try {
      const link = links.find((l) => l.id === linkId);
      if (link) {
        await fetch(apiUrl(`/api/cases/${currentCase.id}/links`), {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: JSON.stringify({
            ...link,
            investigatorNotesList: [...(link.investigatorNotesList || []), newNote],
          }),
        });
      }
    } catch (err) {
      console.error("Failed to persist link note:", err);
    }
  };

  const handleInitiatePathFind = (sourceNodeId: string, targetNodeId?: string, shortestPathResult?: ShortestPathResult) => {
    if (shortestPathResult) {
      setShortestPath(shortestPathResult);
    } else if (targetNodeId) {
      // Fallback: compute path here if not provided
      const path = findShortestPath(sourceNodeId, targetNodeId, analyzedNodes, links, "ALL");
      setShortestPath(path);
    }
    setSelectedNode(null);
    setActiveTab("graph");
  };

  const handleRecordPlaybookAction = async (step: InvestigativeStep) => {
    const now = new Date().toISOString();
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: now,
      officerId: currentOfficer.id,
      officerName: currentOfficer.name,
      officerRole: currentOfficer.role,
      officerRank: currentOfficer.rank,
      user_id: currentOfficer.id,
      user_name: currentOfficer.name,
      user_role: currentOfficer.role,
      action: "PLAYBOOK_ACTION_TAKEN",
      actionType: "EVIDENCE_REVIEW",
      targetType: "CASE",
      targetId: currentCase.id,
      targetLabel: step.title,
      details: `Officer ${currentOfficer.name} marked playbook step "${step.title}" [${step.id}] complete. Legal basis: ${step.legalBasis.statute}. Expected outcome: ${step.expectedOutcome}`,
      digitalHash: generateFileHash(`${step.id}:${currentOfficer.id}:${now}`, currentCase.id),
      digital_hash: generateFileHash(`${step.id}:${currentOfficer.id}:${now}`, currentCase.id),
      metadata: {
        stepId: step.id,
        stepPriority: step.priority,
        statute: step.legalBasis.statute,
        responsibleRole: step.responsibleRole,
      },
    };
    // Optimistic local update so the playbook + dossier reflect completion instantly
    setAuditLogs((prev) => [entry, ...prev]);

    // Persist to the immutable backend audit ledger
    try {
      await fetch(apiUrl(`/api/cases/${currentCase.id}/audit`), {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({
          action: entry.action,
          details: entry.details,
          targetType: entry.targetType,
          targetId: entry.targetId,
          targetLabel: entry.targetLabel,
          metadata: entry.metadata,
        }),
      });
    } catch (err) {
      console.error("Failed to persist playbook action:", err);
    }
  };

  const handleSelectNodeAndFocus = (node: CrimeNetworkNode) => {
    setSelectedNode(node);
    setActiveTab("graph");
  };

  const handleSelectPatternAndFocus = (pattern: SuspiciousPattern) => {
    setSelectedPattern(pattern);
    setActiveTab("patterns");
  };

  const linkSourceNode = selectedLink
    ? analyzedNodes.find(
      (n) => n.id === (typeof selectedLink.source === "object" ? (selectedLink.source as any).id : selectedLink.source)
    ) || { id: "unknown", label: "Unknown Source", type: "PERSON" as const, riskScore: 50, confidence: 0.5 }
    : null;

  const linkTargetNode = selectedLink
    ? analyzedNodes.find(
      (n) => n.id === (typeof selectedLink.target === "object" ? (selectedLink.target as any).id : selectedLink.target)
    ) || { id: "unknown", label: "Unknown Target", type: "PERSON" as const, riskScore: 50, confidence: 0.5 }
    : null;

  // View Routing based on Auth & Role
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Shield className="w-6 h-6 animate-pulse" />
        </div>
        <div className="text-center">
          <h2 className="text-sm font-bold tracking-tight text-slate-100 font-mono">TRINETRA OS</h2>
          <p className="text-xs text-slate-400 font-mono mt-1">Initializing Air-Gapped Unified Vault & Security Clearance...</p>
        </div>
      </div>
    );
  }

  // Phase 0 — VPN gate mounts before anything else (demo or production gateway).
  if (!vpnChecked) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Shield className="w-6 h-6 animate-pulse" />
        </div>
        <p className="text-xs text-slate-400 font-mono">Probing VPN gateway…</p>
      </div>
    );
  }

  if (!vpnConnected) {
    return <VPNGatewayPage onAuthenticated={handleVpnAuthenticated} />;
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  // First sign-in after admin unblock: force temp-password rotation.
  if (mustChangePassword) {
    return (
      <ForceChangePasswordView
        officerName={user.name}
        onDone={() => {
          clearMustChangePassword();
          refreshUser().catch(() => undefined);
        }}
      />
    );
  }

  // Phase 0 — canonical LEAD/CYBER roles land on their department dashboard first
  // (branding resolved from gov-ID prefix via departmentForUser).
  if (showAgencyHome && landingForRole(user.role) === "agency") {
    const department = departmentForUser(user.role, user.agency || "", user.official_id || "");
    return (
      <ErrorBoundary title="Department Dashboard">
        <AgencyDashboard
          department={department}
          user={user}
          stats={{
            cases: allCases.length,
            nodes: analyzedNodes.length,
            links: links.length,
            patterns: detectedPatterns.length,
          }}
          graph={{ nodes: analyzedNodes, links, intels }}
          onEnterWorkstation={() => setShowAgencyHome(false)}
          onLogout={logout}
        />
      </ErrorBoundary>
    );
  }

  // 1. Role = *_ADMIN (CBI_ADMIN/NIA_ADMIN/CID_ADMIN/POLICE_ADMIN) -> Administration
  // Control Center FIRST. Admins never land on My Workspace / registered cases;
  // case administration lives inside the portal's own Cases section.
  if (isAdmin(user.role)) {
    return (
      <ErrorBoundary title="Administration Control Center">
        <AdminPortal />
      </ErrorBoundary>
    );
  }

  // Phase 3 Req13 — My Workspace is the default entry for NON-ADMIN roles.
  // Role portals render only after a case is picked (or the view is closed).
  if (isCasesViewOpen) {
    return (
      <>
        <MyCasesView
          allSystemCases={allCases}
          activeCaseId={currentCase?.id}
          refreshSignal={workspaceSignal}
          onCreateNewCase={() => setIsCreateCaseOpen(true)}
          onClose={() => setIsCasesViewOpen(false)}
          onSelectCase={(selectedCase) => {
            handleSelectCase(selectedCase);
            setIsCasesViewOpen(false);
          }}
        />
        {/* Register / Create New Case Modal inside Workspaces View (ADMIN-only server-side) */}
        <CreateCaseModal
          isOpen={isCreateCaseOpen}
          onClose={() => setIsCreateCaseOpen(false)}
          onCreateCase={handleCreateCase}
          existingCases={allCases}
        />
      </>
    );
  }

  // 2. Role = *_FORENSIC -> Forensic Lab Portal (opens the case picked in My Workspace)
  if (isForensic(user.role)) {
    return (
      <ErrorBoundary title="Forensic Upload Portal">
        <ForensicPortal initialCaseId={currentCase?.id} />
      </ErrorBoundary>
    );
  }

  // 3. Role = *_FIELD (CBI_FIELD/NIA_FIELD/CID_FIELD/POLICE_FIELD) -> Field Investigator Portal
  if (isField(user.role)) {
    return (
      <ErrorBoundary title="Field Investigator Portal">
        <InvestigatorPortal initialCaseId={currentCase?.id} />
      </ErrorBoundary>
    );
  }

  // 3b. LEAD/CYBER roles fall through to the full workstation below after
  // their department dashboard (handled above).

  // 4. Role = LEAD_INVESTIGATOR -> Full Crime Intelligence Graph Workstation
  // (crash-isolated: a render failure shows an error, never a blank screen)
  return (
    <ErrorBoundary title="Investigation Workstation">
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex overflow-hidden font-sans selection:bg-amber-500 selection:text-slate-950">
        {/* Real-time Update Toast */}
        {realtimeNotification && (
          <div className="fixed top-4 right-4 z-50 p-4 rounded-2xl bg-slate-900/95 border border-amber-500/50 shadow-2xl backdrop-blur-md max-w-sm animate-in slide-in-from-top duration-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <strong className="text-xs font-bold text-amber-300 uppercase font-mono">
                  {realtimeNotification.type}
                </strong>
              </div>
              <button
                onClick={clearNotification}
                className="text-slate-400 hover:text-slate-200 text-xs font-mono"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-200 mt-1.5">{realtimeNotification.details}</p>
            <div className="mt-2 text-[10px] font-mono text-slate-400">
              By: {realtimeNotification.user_name} ({realtimeNotification.user_role})
            </div>
          </div>
        )}

        {/* 1. Collapsible Professional Left Sidebar */}
        <Sidebar
          currentCase={currentCase}
          allCases={allCases}
          onSelectCase={handleSelectCase}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenCopilot={() => setIsSahayakOpen(true)}
          onOpenDossier={() => setIsDossierOpen(true)}
          onOpenNewCase={() => setIsCreateCaseOpen(true)}
          onOpenArchive={() => setIsArchiveOpen(true)}
          onOpenMyCases={() => setIsCasesViewOpen(true)}
          onLogout={logout}
          userRole={user?.role}
          nodeCount={analyzedNodes.length}
          kingpinCount={analyzedNodes.filter((n) => n.isKingpinCandidate).length}
          cutVertexCount={cutVertices.length}
          patternCount={detectedPatterns.length}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* 2. Main Intelligence Workstation Viewport */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-slate-950">
          {/* Top Header Command Bar */}
          <Header
            currentCase={currentCase}
            allCases={allCases}
            onSelectCase={handleSelectCase}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onOpenDossier={() => setIsDossierOpen(true)}
            onOpenCopilot={() => setIsSahayakOpen(true)}
            onOpenNewCase={() => setIsCreateCaseOpen(true)}
            onOpenArchive={() => setIsArchiveOpen(true)}
            onOpenMyCases={() => setIsCasesViewOpen(true)}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            nodes={analyzedNodes}
            onSelectNode={handleSelectNodeAndFocus}
            nodeCount={analyzedNodes.length}
            linkCount={links.length}
            kingpinCount={analyzedNodes.filter((n) => n.isKingpinCandidate).length}
            patternCount={detectedPatterns.length}
            currentOfficer={currentOfficer}
            onLogout={logout}
          />

          {/* Phase 2 — VIEW_ONLY banner after inter-department transfer */}
          {readOnly && (
            <div className="px-4 sm:px-6 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-[11px] font-mono text-cyan-200 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>
                VIEW_ONLY access — this case was transferred to another department. You can inspect the graph, map, diary and pipeline, but mutations are disabled (403).
              </span>
            </div>
          )}

          {/* Dynamic Workspace Container */}
          <main className="flex-1 overflow-y-auto relative flex flex-col pb-16 md:pb-0">
            {/* Module 0: Executive Command Overview Dashboard */}
            {activeTab === "overview" && (
              <OverviewDashboard
                currentCase={currentCase}
                nodes={analyzedNodes}
                links={links}
                patterns={detectedPatterns}
                onSelectNode={handleSelectNodeAndFocus}
              />
            )}

            {/* Module 1: Interactive D3 Graph Workstation */}
            {activeTab === "graph" && (
              <GraphCanvas
                nodes={analyzedNodes}
                links={links}
                communities={communities}
                selectedNodeId={selectedNode?.id || null}
                onSelectNode={setSelectedNode}
                onSelectLink={(link) => setSelectedLink(link)}
                shortestPath={shortestPath}
                highlightedPatternNodeIds={highlightedPatternNodeIds}
                highlightedPatternLinkIds={highlightedPatternLinkIds}
              />
            )}

            {/* Module 3: Threat Patterns & Leads (alerts + path finder + playbook) */}
            {activeTab === "patterns" && (
              <PatternAlerts
                patterns={detectedPatterns}
                nodes={analyzedNodes}
                links={links}
                communities={communities}
                cutVertices={cutVertices}
                caseId={currentCase.id}
                auditLogs={auditLogs}
                onSelectPattern={setSelectedPattern}
                onFocusNode={(node) => {
                  setSelectedNode(node);
                  setActiveTab("graph");
                }}
                onSelectNode={handleSelectNodeAndFocus}
                onSetShortestPath={setShortestPath}
                onRecordAction={handleRecordPlaybookAction}
                onSwitchToGraph={() => setActiveTab("graph")}
              />
            )}

            {/* Module 4: Geospatial & Spatio-Temporal Intelligence */}
            {activeTab === "geo" && (
              <GeoTimelineView
                nodes={analyzedNodes}
                links={links}
                firs={firs}
                cdrs={cdrs}
                financials={financials}
                intels={intels}
                focusSignal={mapFocus}
                highlightedPatternNodeIds={highlightedPatternNodeIds}
                highlightedPatternLinkIds={highlightedPatternLinkIds}
                onSelectNode={(node) => {
                  // Phase 2 map → graph sync: select opens the drawer in place;
                  // "View in Graph" jumps explicitly. Map stays put.
                  setSelectedNode(node);
                }}
              />
            )}

            {/* Module 5: Multi-Source Data Ingestion Hub (Cyber Personnel only — Req18) */}
            {activeTab === "ingest" && user && !isLead(user.role) && (
              <DataIngestionHub
                onIngestExtractedData={handleIngestExtractedData}
                onSwitchToGraph={() => setActiveTab("graph")}
                onOpenAddEvidence={() => setIsAddEvidenceOpen(true)}
              />
            )}

            {/* Module 5b: SAHAYAK AI replaces ingestion for Lead Investigators (Req19) */}
            {activeTab === "sahayak" && (
              <SahayakPanel caseId={currentCase.id} readOnly={readOnly} onChanged={() => setStagingSignal((s) => s + 1)} />
            )}

            {/* Module 6 retired from role portals per Changes.md (diary spine still auto-logs server-side) */}

            {/* Module 7: Intake & Approval Pipeline (Staging · Pool · Transfer) */}
            {activeTab === "staging" && (
              <StagingHub currentCase={currentCase} readOnly={readOnly} signal={stagingSignal} />
            )}

            {/* Module 8: Cyber Crime Cell (Cyber Personnel only — Req18) */}
            {activeTab === "cyber" && user && !isLead(user.role) && (
              <CyberHub
                caseId={currentCase.id}
                readOnly={readOnly}
                signal={stagingSignal}
                onChanged={() => setStagingSignal((s) => s + 1)}
                focusLine={
                  user
                    ? `${matrixFor(orgOf(user.role)).cyber.title}: ${matrixFor(orgOf(user.role)).cyber.focus.join(" · ")}`
                    : undefined
                }
              />
            )}
          </main>
        </div>

        {/* 3. Mobile Bottom Navigation Bar */}
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          nodeCount={analyzedNodes.length}
          patternCount={detectedPatterns.length}
          onOpenNewCase={() => setIsCreateCaseOpen(true)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenCopilot={() => setIsSahayakOpen(true)}
          onOpenDossier={() => setIsDossierOpen(true)}
          userRole={user?.role}
        />

        {/* 4. Register / Create New Case Modal */}
        <CreateCaseModal
          isOpen={isCreateCaseOpen}
          onClose={() => setIsCreateCaseOpen(false)}
          onCreateCase={handleCreateCase}
        />

        {/* 5. Add Bulk Evidence Modal (Supports 15GB Max Ingestion) */}
        <AddEvidenceModal
          isOpen={isAddEvidenceOpen}
          onClose={() => setIsAddEvidenceOpen(false)}
          caseTitle={currentCase.name}
          caseId={currentCase.id}
          onCommitEvidence={handleIngestExtractedData}
        />

        {/* 6. 360-Degree Entity Detail Drawer with Evidence Review & Notes */}
        {selectedNode && (
          <EntityDetailDrawer
            node={selectedNode}
            allNodes={analyzedNodes}
            links={links}
            onClose={() => setSelectedNode(null)}
            onSelectNeighbor={(neighbor) => setSelectedNode(neighbor)}
            onInitiatePathFind={handleInitiatePathFind}
            onUpdateReviewState={handleUpdateNodeReviewState}
            onAddNote={handleAddNodeNote}
            onSelectLink={(link) => setSelectedLink(link)}
            onLocateOnMap={(node) => {
              setMapFocus({ nodeId: node.id, nonce: Date.now() });
              setActiveTab("geo");
            }}
            onViewInGraph={() => setActiveTab("graph")}
          />
        )}

        {/* 7. Relationship / Link Detail Drawer with Evidence Traceability */}
        {selectedLink && linkSourceNode && linkTargetNode && (
          <RelationshipDetailDrawer
            link={selectedLink}
            sourceNode={linkSourceNode}
            targetNode={linkTargetNode}
            onClose={() => setSelectedLink(null)}
            onUpdateReviewState={handleUpdateLinkReviewState}
            onAddNote={handleAddLinkNote}
          />
        )}

        {/* 8. SAHAYAK — Ask · Document Intel · Evidence Links · Statutes */}
        <SahayakDrawer
          isOpen={isSahayakOpen}
          onClose={() => setIsSahayakOpen(false)}
          caseId={currentCase?.id || "case-garuda"}
          nodes={analyzedNodes}
          links={links}
          patterns={detectedPatterns}
          communities={communities}
          onSelectNode={(node) => setSelectedNode(node)}
          readOnly={readOnly}
          onChanged={() => setStagingSignal((s) => s + 1)}
        />

        {/* 9. Court-Ready Case Intelligence Dossier (crash-isolated: never blanks the workstation) */}
        <ErrorBoundary title="Judicial Dossier">
          <DossierModal
            isOpen={isDossierOpen}
            onClose={() => setIsDossierOpen(false)}
            currentCase={currentCase}
            nodes={analyzedNodes}
            links={links}
            patterns={detectedPatterns}
            communities={communities}
            auditLogs={auditLogs}
          />
        </ErrorBoundary>

        {/* 10. Case Archive & Offline Backup Hub */}
        <CaseArchiveManager
          isOpen={isArchiveOpen}
          onClose={() => setIsArchiveOpen(false)}
          currentCase={currentCase}
          nodes={nodes}
          links={links}
          firs={firs}
          cdrs={cdrs}
          financials={financials}
          intels={intels}
          auditLogs={auditLogs}
          onImportArchive={handleImportCaseArchive}
        />
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkstationApp />
    </AuthProvider>
  );
}
