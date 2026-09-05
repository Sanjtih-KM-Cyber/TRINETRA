import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
  AuditLogEntry,
} from "../types";

export type PlaybookPriority = "IMMEDIATE" | "HIGH" | "MEDIUM" | "LOW";

export interface InvestigativeStepLegalBasis {
  statute: string;
  provision: string;
  authority: string;
}

export interface InvestigativeStep {
  id: string;
  priority: PlaybookPriority;
  title: string;
  description: string;
  legalBasis: InvestigativeStepLegalBasis;
  responsibleRole: string;
  deadlineDays: number;
  prerequisites: string[];
  evidenceToCollect: string[];
  expectedOutcome: string;
  riskIfDelayed: string;
  linkedEntities: string[];
  linkedPatterns: string[];
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

export interface PlaybookContext {
  caseId: string;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns: SuspiciousPattern[];
  communities: SyndicateCommunity[];
  cutVertices: string[];
  evidenceFiles?: Array<{ id: string; fileName: string }>;
  recentAuditLogs?: AuditLogEntry[];
}

const PRIORITY_ORDER: Record<PlaybookPriority, number> = {
  IMMEDIATE: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function nodeLabel(nodes: CrimeNetworkNode[], id: string): string {
  const n = nodes.find((x) => x.id === id);
  return n ? n.label : id;
}

function linkAmount(link: CrimeNetworkLink): number {
  const l = link as CrimeNetworkLink & { amount?: number };
  return typeof l.amount === "number" ? l.amount : 0;
}

function linkEndpointIds(link: CrimeNetworkLink): [string, string] {
  const s = typeof link.source === "object" ? (link.source as { id: string }).id : (link.source as string);
  const t = typeof link.target === "object" ? (link.target as { id: string }).id : (link.target as string);
  return [s, t];
}

function actionTakenFor(auditLogs: AuditLogEntry[] | undefined, stepId: string): AuditLogEntry | undefined {
  if (!auditLogs) return undefined;
  return auditLogs.find(
    (l) =>
      (l.action === "PLAYBOOK_ACTION_TAKEN" &&
        ((l as AuditLogEntry & { metadata?: { stepId?: string } }).metadata?.stepId === stepId ||
          (l.details || "").includes(stepId)))
  );
}

function markCompleted(
  steps: InvestigativeStep[],
  auditLogs: AuditLogEntry[] | undefined
): InvestigativeStep[] {
  return steps.map((s) => {
    const done = actionTakenFor(auditLogs, s.id);
    if (done) {
      return { ...s, completed: true, completedAt: done.timestamp, completedBy: done.officerName };
    }
    return s;
  });
}

/**
 * Deterministic investigative playbook generator.
 * Pure rules over graph analytics — auditable, reproducible, no LLM hallucination.
 */
export function generatePlaybook(ctx: PlaybookContext): InvestigativeStep[] {
  const steps: InvestigativeStep[] = [];
  const { nodes, links, patterns, cutVertices } = ctx;

  const kingpins = nodes.filter((n) => n.isKingpinCandidate || (n.betweenness || 0) > 0.2);

  // RULE 1: Kingpin financial isolation (Section 102 CrPC)
  kingpins.forEach((kp) => {
    const financialLinks = links.filter((l) => {
      const [s, t] = linkEndpointIds(l);
      return l.relationType === "FUNDS_TRANSFER" && (s === kp.id || t === kp.id);
    });
    if (financialLinks.length > 0) {
      const total = financialLinks.reduce((sum, l) => sum + linkAmount(l), 0);
      const accounts = Array.from(new Set(financialLinks.flatMap((l) => linkEndpointIds(l))));
      steps.push({
        id: `freeze-${kp.id}`,
        priority: "IMMEDIATE",
        title: `Section 102 CrPC Freeze on ${kp.label}'s Financial Network`,
        description: `Identified ${financialLinks.length} fund transfers linked to ${kp.label} (Betweenness: ${(kp.betweenness || 0).toFixed(4)}). Initiate immediate account freezes on all beneficiary accounts before layering completes.`,
        legalBasis: {
          statute: "Section 102 CrPC",
          provision: "Power of police officer to seize certain property suspected to be proceeds of crime",
          authority: "IO / SHO",
        },
        responsibleRole: "IO",
        deadlineDays: 1,
        prerequisites: ["Beneficiary account list from financial ledger", "Bank branch details for each account"],
        evidenceToCollect: ["Bank statements (6 months)", "UTR references", "KYC documents of mule accounts"],
        expectedOutcome: `Freeze ₹${total.toLocaleString("en-IN")} across ${accounts.length} accounts`,
        riskIfDelayed: "Funds dissipated via UPI/crypto layering within 24–48 hours",
        linkedEntities: [kp.id, ...accounts],
        linkedPatterns: patterns.filter((p) => p.type === "HAWALA_LAYERING").map((p) => p.id),
        completed: false,
      });
    }
  });

  // RULE 2: Burner phone technical surveillance (Telegraph Act / IT Act)
  patterns
    .filter((p) => p.type === "BURNER_SWAP")
    .forEach((p) => {
      const imei = (p.evidenceData && (p.evidenceData as { imei?: string }).imei) || "unknown IMEI";
      const simCount = ((p.evidenceData as { phoneNumbers?: string[] } | undefined)?.phoneNumbers || []).length;
      steps.push({
        id: `imsi-${p.id}`,
        priority: "HIGH",
        title: `Technical Surveillance for IMEI ${imei}`,
        description: `Burner swap detected: ${simCount || "multiple"} SIMs operated on a single handset. Request interception and IMSI-catcher deployment to attribute the active SIM.`,
        legalBasis: {
          statute: "Section 5(2) Indian Telegraph Act / Section 69 IT Act",
          provision: "Interception in the interest of public safety / sovereignty",
          authority: "Home Secretary authorization",
        },
        responsibleRole: "SP",
        deadlineDays: 3,
        prerequisites: ["Home Secretary authorization", "Telecom service provider coordination"],
        evidenceToCollect: ["Real-time call logs", "Tower location pings", "New SIM activation KYC"],
        expectedOutcome: "Attribute current active SIM to physical device and holder",
        riskIfDelayed: "Device goes dark; attribution trail is lost",
        linkedEntities: [...p.involvedNodeIds],
        linkedPatterns: [p.id],
        completed: false,
      });
    });

  // RULE 3: Geo-convergence field surveillance
  patterns
    .filter((p) => p.type === "GEO_CONVERGENCE")
    .forEach((p) => {
      const location = (p.evidenceData as { location?: string } | undefined)?.location || "convergence site";
      const count = (p.evidenceData as { suspectCount?: number } | undefined)?.suspectCount || p.involvedNodeIds.length;
      steps.push({
        id: `surv-${p.id}`,
        priority: "HIGH",
        title: `Physical Surveillance at ${location}`,
        description: `${count} suspects converged at ${location}. Deploy field team for photo/video evidence collection and ANPR verification.`,
        legalBasis: {
          statute: "Section 149 CrPC / Police Act",
          provision: "Preventive action and surveillance to prevent cognizable offences",
          authority: "SHO / IO",
        },
        responsibleRole: "IO",
        deadlineDays: 2,
        prerequisites: ["Vehicle details from CDR tower dumps", "CCTV camera map of 2 km radius"],
        evidenceToCollect: ["Photographs / video", "ANPR logs", "Witness statements"],
        expectedOutcome: "Confirm physical meeting; identify additional attendees",
        riskIfDelayed: "Meeting concludes; suspects disperse and go underground",
        linkedEntities: [...p.involvedNodeIds],
        linkedPatterns: [p.id],
        completed: false,
      });
    });

  // RULE 4: Cut-vertex disruption
  cutVertices.forEach((cvId) => {
    const n = nodes.find((x) => x.id === cvId);
    if (!n) return;
    const shieldPatterns = patterns.filter(
      (p) => p.type === "KINGPIN_SHIELD" && p.involvedNodeIds.includes(cvId)
    );
    steps.push({
      id: `disrupt-${cvId}`,
      priority: "HIGH",
      title: `Targeted Disruption of Bridge Node: ${n.label}`,
      description: `Cut vertex ${n.label} (Betweenness: ${(n.betweenness || 0).toFixed(4)}, Degree: ${n.degree || 0}) bridges sub-networks. Custodial interrogation severs command-control flow.`,
      legalBasis: {
        statute: "Section 41 CrPC / Section 151 CrPC",
        provision: "Arrest without warrant for cognizable offence / preventive arrest",
        authority: "IO / SHO",
      },
      responsibleRole: "IO",
      deadlineDays: 5,
      prerequisites: ["Corroborating CDR/financial evidence", "Arrest memo and medical examination readiness"],
      evidenceToCollect: ["Seized devices", "Call log extracts", "Associate statements under Section 161 CrPC"],
      expectedOutcome: `Fragment network; isolate ${n.degree || 0} direct contact clusters`,
      riskIfDelayed: "Network re-routes through alternate conduits",
      linkedEntities: [cvId],
      linkedPatterns: shieldPatterns.map((p) => p.id),
      completed: false,
    });
  });

  // RULE 5: Hawala layering → FIU-IND STR
  patterns
    .filter((p) => p.type === "HAWALA_LAYERING")
    .forEach((p) => {
      steps.push({
        id: `str-${p.id}`,
        priority: "HIGH",
        title: `File STR with FIU-IND for Layering Chain (${p.id})`,
        description: `Multi-tier fund layering detected (${p.triggerExplanation}). File Suspicious Transaction Reports and seek Section 102 CrPC freeze orders on mule accounts.`,
        legalBasis: {
          statute: "PMLA Section 12 / Section 102 CrPC",
          provision: "Reporting entity obligations; seizure of suspected proceeds",
          authority: "IO via FIU-IND",
        },
        responsibleRole: "IO",
        deadlineDays: 3,
        prerequisites: ["UTR list from financial ledger", "Mule account beneficiary details"],
        evidenceToCollect: ["STR acknowledgements", "Bank freeze confirmations"],
        expectedOutcome: "Formal freeze on layering chain; money trail preserved for trial",
        riskIfDelayed: "Layered funds exit the banking system",
        linkedEntities: [...p.involvedNodeIds],
        linkedPatterns: [p.id],
        completed: false,
      });
    });

  // RULE 6: Evidence gaps → Section 91 CrPC notices for persons without call data
  const personsWithoutCalls = nodes.filter(
    (n) =>
      n.type === "PERSON" &&
      !links.some((l) => {
        const [s, t] = linkEndpointIds(l);
        return l.relationType === "CALLS" && (s === n.id || t === n.id);
      })
  );
  if (personsWithoutCalls.length > 0) {
    steps.push({
      id: "cdr-91-notices",
      priority: "MEDIUM",
      title: `Section 91 CrPC Notices for ${personsWithoutCalls.length} Suspects Without Call Data`,
      description: `No communication records for: ${personsWithoutCalls.slice(0, 5).map((n) => nodeLabel(nodes, n.id)).join(", ")}${personsWithoutCalls.length > 5 ? ` (+${personsWithoutCalls.length - 5} more)` : ""}. Requisition CDR/IPDR from service providers.`,
      legalBasis: {
        statute: "Section 91 CrPC",
        provision: "Summons to produce documents or records in possession",
        authority: "IO / Court",
      },
      responsibleRole: "IO",
      deadlineDays: 14,
      prerequisites: ["Phone numbers / IMEIs for each suspect", "Event-window date ranges from FIR/intel"],
      evidenceToCollect: ["CDR (1 year)", "IPDR (6 months)", "Tower dump for event window"],
      expectedOutcome: "Establish communication links; fill graph gaps",
      riskIfDelayed: "Provider retention windows (typically 1 year) may purge records",
      linkedEntities: personsWithoutCalls.map((n) => n.id),
      linkedPatterns: [],
      completed: false,
    });
  }

  // RULE 7: Unreviewed high-risk entities → verification drive
  const unreviewedHighRisk = nodes.filter(
    (n) => (n.reviewState || "NEEDS_REVIEW") === "NEEDS_REVIEW" && (n.riskScore || 0) >= 75
  );
  if (unreviewedHighRisk.length > 0) {
    steps.push({
      id: "verify-high-risk",
      priority: "MEDIUM",
      title: `Verify ${unreviewedHighRisk.length} High-Risk Unreviewed Entities`,
      description: `${unreviewedHighRisk.slice(0, 5).map((n) => n.label).join(", ")}${unreviewedHighRisk.length > 5 ? ` (+${unreviewedHighRisk.length - 5} more)` : ""} carry risk ≥ 75 but remain NEEDS_REVIEW. Confirm or reject each with source citations.`,
      legalBasis: {
        statute: "Section 173 CrPC (Investigation)",
        provision: "Diligent investigation and verification of evidence",
        authority: "IO",
      },
      responsibleRole: "IO",
      deadlineDays: 7,
      prerequisites: ["Source documents for each entity", "Corroborating exhibits"],
      evidenceToCollect: ["Confirmation decisions with citations", "Rejection notes where unfounded"],
      expectedOutcome: "Zero unreviewed high-risk entities; dossier-grade evidence set",
      riskIfDelayed: "Unverified leads weaken chargesheet; defence exploits gaps",
      linkedEntities: unreviewedHighRisk.map((n) => n.id),
      linkedPatterns: [],
      completed: false,
    });
  }

  const deduped = Array.from(new Map(steps.map((s) => [s.id, s])).values());
  const withStatus = markCompleted(deduped, ctx.recentAuditLogs);
  return withStatus.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export function playbookSummary(steps: InvestigativeStep[]): string {
  const done = steps.filter((s) => s.completed).length;
  const immediate = steps.filter((s) => s.priority === "IMMEDIATE" && !s.completed).length;
  return `${done}/${steps.length} steps complete • ${immediate} immediate actions pending`;
}
