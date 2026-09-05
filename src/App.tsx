import React, { useState, useEffect, useMemo } from "react";
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
import { LoginView } from "./components/auth/LoginView";
import { AdminPortal } from "./components/admin/AdminPortal";
import { ForensicPortal } from "./components/forensic/ForensicPortal";
import { InvestigatorPortal } from "./components/investigator/InvestigatorPortal";
import { MyCasesView } from "./components/cases/MyCasesView";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { GraphCanvas } from "./components/GraphCanvas";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { PatternAlerts } from "./components/PatternAlerts";
import { GeoTimelineView } from "./components/GeoTimelineView";
import { DataIngestionHub } from "./components/DataIngestionHub";
import { InvestigatorRbacHub } from "./components/InvestigatorRbacHub";
import { EntityDetailDrawer } from "./components/EntityDetailDrawer";
import { RelationshipDetailDrawer } from "./components/RelationshipDetailDrawer";
import { AddEvidenceModal } from "./components/AddEvidenceModal";
import { AiCopilotDrawer } from "./components/AiCopilotDrawer";
import { DossierModal } from "./components/DossierModal";
import { CreateCaseModal } from "./components/CreateCaseModal";
import { CaseArchiveManager, CaseArchivePayload } from "./components/CaseArchiveManager";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { Shield, Radio } from "lucide-react";
import { VPNGatewayPage } from "./components/VPNGatewayPage";

function WorkstationApp() {
  const { user, isAuthenticated, isLoading, logout, realtimeNotification, clearNotification } = useAuth();

  // Case Datasets
  const [allCases, setAllCases] = useState<CaseDataset[]>(SAMPLE_CASES);
  const [currentCase, setCurrentCase] = useState<CaseDataset>(SAMPLE_CASES[0]);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);

  // VPN Gateway State
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnConnecting, setVpnConnecting] = useState(false);

  const handleVpnConnect = () => {
    // In real implementation, this would initiate the VPN connection
    // For demo, we simulate connection
    // The actual connection is handled by the VPNGatewayPage component
  };

  const handleVpnDisconnect = () => {
    // Disconnect VPN
  };

  // Active Officer Profile derived from authenticated user
  const currentOfficer: InvestigatorProfile = useMemo(() => {
    if (!user) {
      return {
        id: "OFFICER-001",
        name: "SP Vikramaditya Rathore, IPS",
        rank: "Superintendent of Police",
        badgeNumber: "NCB-SIT-774",
        department: "Special Task Force & Intelligence",
        agency: "Narcotics Control Bureau (NCB)",
        role: "LEAD_INVESTIGATOR",
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
      avatarColor: user.role === "ADMIN" ? "#6366f1" : user.role === "LEAD_INVESTIGATOR" ? "#f59e0b" : "#10b981",
      status: "ACTIVE",
      currentActivity: "Active Syndicate Interdiction & Graph Reasoning",
      permissions: user.permissions || {
        canSignDossier: user.role === "LEAD_INVESTIGATOR" || user.role === "ADMIN",
        canConfirmEvidence: user.role === "LEAD_INVESTIGATOR" || user.role === "ADMIN",
        canRejectEvidence: user.role === "LEAD_INVESTIGATOR" || user.role === "ADMIN",
        canAddHypothesis: user.role === "LEAD_INVESTIGATOR" || user.role === "ADMIN",
        canIngestData: true,
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

  // Active View Tab: Defaults to 'overview' for the command dashboard experience
  const [activeTab, setActiveTab] = useState<
    "overview" | "graph" | "analytics" | "patterns" | "geo" | "ingest"
  >("overview");

  // Sidebar collapse toggle & Mobile drawer toggle
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Selection & Highlight State
  const [selectedNode, setSelectedNode] = useState<CrimeNetworkNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<CrimeNetworkLink | null>(null);
  const [shortestPath, setShortestPath] = useState<ShortestPathResult | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<SuspiciousPattern | null>(null);

  // Drawers & Modals
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isAddEvidenceOpen, setIsAddEvidenceOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isCasesViewOpen, setIsCasesViewOpen] = useState(false);

  // Import Archive Handler
  const handleImportCaseArchive = (payload: CaseArchivePayload) => {
    const importedCase = payload.caseMetadata;
    setAllCases((prev) => {
      const exists = prev.find((c) => c.id === importedCase.id);
      if (exists) {
        return prev.map((c) => (c.id === importedCase.id ? importedCase : c));
      }
      return [importedCase, ...prev];
    });

    setCaseDataMap((prev) => ({
      ...prev,
      [importedCase.id]: {
        nodes: payload.graphData.nodes,
        links: payload.graphData.links,
        firs: payload.evidenceRecords.firs || [],
        cdrs: payload.evidenceRecords.cdrs || [],
        financials: payload.evidenceRecords.financials || [],
        intels: payload.evidenceRecords.intels || [],
        evidenceFiles: payload.evidenceRecords.evidenceFiles || importedCase.evidenceFiles,
      },
    }));

    setCurrentCase(importedCase);
    setNodes(payload.graphData.nodes);
    setLinks(payload.graphData.links);
    setFirs(payload.evidenceRecords.firs || []);
    setCdrs(payload.evidenceRecords.cdrs || []);
    setFinancials(payload.evidenceRecords.financials || []);
    setIntels(payload.evidenceRecords.intels || []);

    if (payload.auditLogs && payload.auditLogs.length > 0) {
      setAuditLogs((prev) => [...payload.auditLogs, ...prev]);
    }
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

  // Handle registering and populating a brand-new case
  const handleCreateCase = (
    newCase: CaseDataset,
    initialNodes: CrimeNetworkNode[],
    initialLinks: CrimeNetworkLink[]
  ) => {
    setAllCases((prev) => [newCase, ...prev]);

    setCaseDataMap((prev) => ({
      ...prev,
      [newCase.id]: {
        nodes: initialNodes,
        links: initialLinks,
        firs: [],
        cdrs: [],
        financials: [],
        intels: [],
        evidenceFiles: newCase.evidenceFiles || [],
      },
    }));

    setCurrentCase(newCase);
    setNodes(initialNodes);
    setLinks(initialLinks);
    setFirs([]);
    setCdrs([]);
    setFinancials([]);
    setIntels([]);
    setSelectedNode(null);
    setSelectedLink(null);
    setShortestPath(null);
    setSelectedPattern(null);

    if (initialNodes.length > 0) {
      setActiveTab("graph");
    } else {
      setActiveTab("overview");
    }
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
  const handleUpdateNodeReviewState = async (nodeId: string, newState: ReviewState) => {
    // Optimistic UI update
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, reviewState: newState } : n))
    );
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode((prev) => (prev ? { ...prev, reviewState: newState } : null));
    }

    // Persist to backend
    try {
      await fetch(`/api/cases/${currentCase.id}/nodes/${nodeId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewState: newState }),
      });
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
        await fetch(`/api/cases/${currentCase.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

    // Persist to backend
    try {
      await fetch(`/api/cases/${currentCase.id}/links/${linkId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewState: newState }),
      });
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
        await fetch(`/api/cases/${currentCase.id}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      await fetch(`/api/cases/${currentCase.id}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          <h2 className="text-sm font-bold tracking-tight text-slate-100 font-mono">CRIM-INTEL OS v4.2</h2>
          <p className="text-xs text-slate-400 font-mono mt-1">Initializing Air-Gapped Unified Vault & Security Clearance...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  // 1. Role = ADMIN -> Render Admin Portal
  if (user.role === "ADMIN") {
    return <AdminPortal />;
  }

  // 2. Role = FORENSIC_INVESTIGATOR -> Render Forensic Lab Portal
  if (user.role === "FORENSIC_INVESTIGATOR") {
    return <ForensicPortal />;
  }

  // 3. Role = INVESTIGATOR / INSPECTOR -> Render Field Investigator Portal
  if (user.role === "INVESTIGATOR" || (user.role as string) === "INSPECTOR") {
    return <InvestigatorPortal />;
  }

  // 3. User requested to switch/browse case workspaces
  if (isCasesViewOpen) {
    return (
      <>
        <MyCasesView
          allSystemCases={allCases}
          activeCaseId={currentCase?.id}
          onCreateNewCase={() => setIsCreateCaseOpen(true)}
          onClose={() => setIsCasesViewOpen(false)}
          onSelectCase={(selectedCase) => {
            handleSelectCase(selectedCase);
            setIsCasesViewOpen(false);
          }}
        />
        {/* Register / Create New Case Modal inside Workspaces View */}
        <CreateCaseModal
          isOpen={isCreateCaseOpen}
          onClose={() => setIsCreateCaseOpen(false)}
          onCreateCase={handleCreateCase}
          existingCases={allCases}
        />
      </>
    );
  }

  // 4. Role = LEAD_INVESTIGATOR -> Full Crime Intelligence Graph Workstation
  return (
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
        onOpenCopilot={() => setIsCopilotOpen(true)}
        onOpenDossier={() => setIsDossierOpen(true)}
        onOpenNewCase={() => setIsCreateCaseOpen(true)}
        onOpenArchive={() => setIsArchiveOpen(true)}
        onOpenMyCases={() => setIsCasesViewOpen(true)}
        onLogout={logout}
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
          onOpenCopilot={() => setIsCopilotOpen(true)}
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

        {/* Dynamic Workspace Container */}
        <main className="flex-1 overflow-y-auto relative flex flex-col pb-16 md:pb-0">
          {/* Module 0: Executive Command Overview Dashboard */}
          {activeTab === "overview" && (
            <OverviewDashboard
              currentCase={currentCase}
              nodes={analyzedNodes}
              links={links}
              patterns={detectedPatterns}
              communities={communities}
              cutVertices={cutVertices}
              onSelectNode={handleSelectNodeAndFocus}
              onSelectPattern={handleSelectPatternAndFocus}
              onNavigateTab={setActiveTab}
              onOpenCopilot={() => setIsCopilotOpen(true)}
              onOpenDossier={() => setIsDossierOpen(true)}
              onOpenNewCase={() => setIsCreateCaseOpen(true)}
              onOpenArchive={() => setIsArchiveOpen(true)}
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

          {/* Module 2: Centrality, Influencers & Disruption Engine */}
          {activeTab === "analytics" && (
            <AnalyticsDashboard
              nodes={analyzedNodes}
              links={links}
              communities={communities}
              cutVertices={cutVertices}
              patterns={detectedPatterns}
              caseId={currentCase.id}
              auditLogs={auditLogs}
              onRecordAction={handleRecordPlaybookAction}
              onSelectNode={(node) => {
                setSelectedNode(node);
                setActiveTab("graph");
              }}
              onSetShortestPath={setShortestPath}
              onSwitchToGraph={() => setActiveTab("graph")}
            />
          )}

          {/* Module 3: Suspicious Pattern Alert Center */}
          {activeTab === "patterns" && (
            <PatternAlerts
              patterns={detectedPatterns}
              nodes={analyzedNodes}
              onSelectPattern={setSelectedPattern}
              onFocusNode={(node) => {
                setSelectedNode(node);
                setActiveTab("graph");
              }}
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
              onSelectNode={(node) => {
                setSelectedNode(node);
                setActiveTab("graph");
              }}
            />
          )}

          {/* Module 5: Multi-Source Data Ingestion Hub (Supports 15GB files) */}
          {activeTab === "ingest" && (
            <DataIngestionHub
              onIngestExtractedData={handleIngestExtractedData}
              onSwitchToGraph={() => setActiveTab("graph")}
              onOpenAddEvidence={() => setIsAddEvidenceOpen(true)}
            />
          )}
        </main>
      </div>

      {/* 3. Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenNewCase={() => setIsCreateCaseOpen(true)}
        onOpenCopilot={() => setIsCopilotOpen(true)}
        onOpenDossier={() => setIsDossierOpen(true)}
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

      {/* 8. AI Criminal Graph Copilot */}
      <AiCopilotDrawer
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        caseId={currentCase?.id || "case-garuda"}
        nodes={analyzedNodes}
        links={links}
        patterns={detectedPatterns}
        communities={communities}
        onSelectNode={(node) => setSelectedNode(node)}
      />

      {/* 9. Court-Ready Case Intelligence Dossier */}
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
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkstationApp />
    </AuthProvider>
  );
}
