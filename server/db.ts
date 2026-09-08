import bcrypt from "bcryptjs";
import {
  CASE_DATASETS,
  GARUDA_SYNDICATE_NODES,
  GARUDA_SYNDICATE_LINKS,
  GARUDA_FIRS,
  GARUDA_CDRS,
  GARUDA_FINANCIALS,
  GARUDA_INTEL,
  SHADOWVAULT_NODES,
  SHADOWVAULT_LINKS,
  INITIAL_AUDIT_LOGS,
} from "../src/data/mockDatasets";

import type { UserRole } from "../src/data/roles";
export type DBRole = UserRole;

export interface DBUser {
  _id: string;
  name: string;
  official_id: string;
  email: string;
  password_hash: string;
  agency: string;
  designation: string;
  department: string;
  role: DBRole;
  /** State police jurisdiction (e.g. "MAHARASHTRA"); undefined for central agencies. */
  state?: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  last_login?: string;
  avatarColor?: string;
}

export interface DBAccessRequest {
  _id: string;
  full_name: string;
  official_id: string;
  official_email: string;
  agency: string;
  designation: string;
  department: string;
  requested_role: DBRole;
  /** State jurisdiction for POLICE roles (e.g. MAHARASHTRA/KARNATAKA). */
  state?: string;
  reason_for_access: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  notes?: string;
}

export interface DBCaseAccessRequest {
  _id: string;
  case_id: string;
  case_name: string;
  case_code: string;
  user_id: string;
  user_name: string;
  user_email: string;
  official_id: string;
  agency: string;
  user_role: DBRole;
  state?: string;
  reason_for_access: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
}

export interface DBCaseMember {
  _id: string;
  case_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  official_id: string;
  agency: string;
  role: DBRole;
  /** State police jurisdiction (police members only). */
  state?: string;
  /** FULL_EDIT = read/write; VIEW_ONLY = read-only (set on inter-department transfer). */
  access?: "FULL_EDIT" | "VIEW_ONLY";
  status: "ACTIVE" | "INACTIVE";
  assigned_at: string;
  assigned_by?: string;
}

export interface DBObservation {
  _id: string;
  case_id: string;
  observation_type:
    | "SUSPECT_SIGHTING"
    | "LOCATION_SURVEILLANCE"
    | "VEHICLE_TRACKING"
    | "FIELD_INTEL_NOTE"
    | "RELATIONSHIP_OBSERVED";
  title: string;
  narrative: string;
  location_name: string;
  lat?: number;
  lng?: number;
  timestamp: string;
  officer_id: string;
  officer_name: string;
  officer_role: string;
  officer_badge: string;
  related_entities: Array<{
    id: string;
    label: string;
    type: string;
    role_in_observation?: string;
  }>;
  observed_relationships?: Array<{
    source_id: string;
    target_id: string;
    relation_type: string;
    notes?: string;
  }>;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size_formatted: string;
    sha256: string;
    media_category: string;
  }>;
  status: "SUBMITTED" | "VALIDATED" | "INTEGRATED_IN_CASE";
  confidence_score: number;
  tags: string[];
  created_at: string;
}

export interface DBEvidence {
  _id: string;
  case_id: string;
  file_name: string;
  file_size: number;
  file_size_formatted: string;
  file_type: string;
  file_hash: string; // SHA-256
  uploaded_at: string;
  uploaded_by: string; // user_id or name
  uploader_role: string;
  status: "UPLOADED" | "PROCESSING" | "VALIDATED" | "COMMITTED";
  source_authority: string;
  summary: string;
  raw_text?: string;
  /** Phase 6 Req26 — cross-state bridge: states this exhibit is shared with. */
  sharedTo?: string[];
  sharedBy?: string;
  sharedAt?: string;
  extracted_entities_count: number;
  extracted_relations_count: number;
  extracted_entities?: any[];
  extracted_relations?: any[];
  quality_notes?: string;
}

export interface DBEntity {
  _id: string;
  case_id: string;
  id: string;
  label: string;
  type: string;
  category?: string;
  reviewState?: string;
  role?: string;
  aliases?: string[];
  riskScore: number;
  confidence: number;
  details?: any;
  evidence_ids?: string[];
  sourceDocumentIds?: string[];
  sourceSnippets?: any[];
  created_at?: string;
  updated_at?: string;
}

export interface DBRelationship {
  _id: string;
  case_id: string;
  id: string;
  source: string;
  target: string;
  relationType: string;
  category?: string;
  reviewState?: string;
  provenance?: "FIELD_OBSERVATION" | "FORENSIC_EXTRACTION" | "CDR_TRIANGULATION" | "FINANCIAL_LEDGER" | "MANUAL_INVESTIGATION" | "AI_SUGGESTED";
  status?: "VERIFIED" | "UNVERIFIED" | "AI_SUGGESTED" | "EXTRACTED";
  creator_id?: string;
  creator_name?: string;
  creator_role?: string;
  source_record_id?: string;
  weight: number;
  frequency?: number;
  amount?: number;
  durationSec?: number;
  timestamp?: string;
  details?: string;
  evidence_ids: string[];
  source_type: string;
  confidence: number;
  flags?: string[];
  updated_at?: string;
  evidenceDetail?: any;
}

export interface DBAlert {
  _id: string;
  case_id: string;
  id: string;
  type: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  confidence?: number;
  description: string;
  triggerExplanation: string;
  reviewState?: string;
  involvedNodeIds: string[];
  involvedLinkIds: string[];
  evidenceData?: any;
  actionableLead: string;
  detectedAt: string;
}

export interface DBInvestigationEvent {
  _id: string;
  case_id: string;
  event_type: string;
  title: string;
  description: string;
  timestamp: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  metadata?: any;
}

export interface DBAuditLog {
  _id: string;
  timestamp: string;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  action: string;
  action_type?: string;
  case_id?: string;
  resource_id?: string;
  target_type?: "NODE" | "LINK" | "EXHIBIT" | "CASE" | "DOSSIER" | string;
  target_id?: string;
  target_label?: string;
  details: string;
  digital_hash: string; // SHA-256
  ip_address?: string;
  result: "SUCCESS" | "DENIED" | "FAILURE";
  metadata?: any;
}

// ---- Phase 1: Core Investigation Engine record types ----
export interface DBCaseDiary {
  _id: string;
  case_id: string;
  diaryNo: number;
  date: string;
  time?: string;
  place: string;
  firRef?: string;
  proceedings: string;
  actionTaken?: string;
  autoLogged?: boolean;
  sourceAction?: string;
  voiceLocale?: string;
  status: "DRAFT" | "SIGNED" | "COUNTERSIGNED";
  ioName: string;
  ioRank: string;
  ioId: string;
  ioSignature?: any;
  countersign?: any;
  prevHash?: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface DBArrestMemo {
  _id: string;
  case_id: string;
  memoNo: string;
  memoType: "ARREST" | "SEIZURE" | "ARREST_CUM_SEIZURE";
  statute: string;
  date: string;
  time?: string;
  place: string;
  firNumber: string;
  sections: string[];
  accused?: any;
  groundsOfArrest?: string;
  articles: any[];
  witnesses: any[];
  rightsRead: boolean;
  intimationName?: string;
  intimationRelation?: string;
  intimationPhone?: string;
  intimationAt?: string;
  ioName: string;
  ioRank: string;
  ioId: string;
  esign?: any;
  status: "DRAFT" | "SIGNED" | "FILED";
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface DBHistorySheet {
  _id: string;
  case_id: string;
  sheetNo: string;
  subjectName: string;
  aliases: string[];
  dob?: string;
  address: string;
  policeStation: string;
  district: string;
  category: "A" | "B" | "C";
  moCodes: string[];
  previousCases: any[];
  associates: any[];
  village: string;
  beatNo?: string;
  beatOfficer?: string;
  villageRemarks?: string;
  villageLastChecked?: string;
  surveillanceLevel?: string;
  checkIntervalDays?: number;
  lastChecked?: string;
  nextCheck?: string;
  openedBy: string;
  openedByRank: string;
  openedAt: string;
  status: "ACTIVE" | "CLOSED";
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface DBCustodyRecord {
  _id: string;
  case_id: string;
  accusedName: string;
  firNumber: string;
  sections: string[];
  arrestDate: string;
  arrestMemoId?: string;
  offencePunishmentYears: number;
  remands: any[];
  bailApplications: any[];
  status: string;
  recordedBy: string;
  recordedByRank: string;
  policeCustodyUsedDays: number;
  chargeSheetDueDate?: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface DBChargeSheet {
  _id: string;
  case_id: string;
  csNo: string;
  firNumber: string;
  policeStation: string;
  district: string;
  state: string;
  sections: string[];
  accused: any[];
  witnesses: any[];
  exhibits: string[];
  factsOfCase: string;
  evidenceSummary: string;
  legalOpinion: string;
  assistMeta?: any;
  annexures: any[];
  ioName: string;
  ioRank: string;
  forwardingOfficer?: string;
  draftSource: "MANUAL" | "SAHAYAK_ASSIST";
  status: "DRAFT" | "IO_SIGNED" | "SP_APPROVED" | "FILED";
  filedInCourt?: string;
  filingDate?: string;
  cnrNumber?: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

/** Phase 3 — Lead Investigator personnel requisition to the department Admin. */
/** Phase 4 Req22 — extended with DATA kind: Lead → assigned personnel evidence requests. */
export interface DBRequisition {
  _id: string;
  case_id: string;
  case_code: string;
  requested_by: string;
  requested_by_role: DBRole;
  requested_by_state?: string;
  kind: "PERSONNEL" | "DATA";
  functional: "CYBER" | "FORENSIC" | "FIELD" | "LEAD";
  /** DATA kind: which functional must fulfill (CYBER/FORENSIC/FIELD). */
  targetFunctional?: "CYBER" | "FORENSIC" | "FIELD";
  title?: string;
  count: number;
  justification: string;
  /** Phase: operational deadline (ISO date) on DATA directives. */
  deadline?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED";
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  fulfilled_by?: string;
  fulfilled_at?: string;
}

/** Judicial dossier signature (Sec 65B IEA / Sec 63 BSA attestation). */
export interface DBDossierSignature {
  _id: string;
  case_id: string;
  reg_number: string;
  court: string;
  signed_by: string;
  signed_role: string;
  signed_badge: string;
  statement: string;
  signature_hash: string;
  signed_at: string;
}

// In-Memory Storage Engine with identical MongoDB Query semantics
// ensuring zero-downtime execution whether external Mongo is available or not
class InMemoryDatabase {
  users: Map<string, DBUser> = new Map();
  access_requests: Map<string, DBAccessRequest> = new Map();
  case_access_requests: Map<string, DBCaseAccessRequest> = new Map();
  cases: Map<string, any> = new Map();
  case_members: Map<string, DBCaseMember> = new Map();
  evidence: Map<string, DBEvidence> = new Map();
  observations: Map<string, DBObservation> = new Map();
  entities: Map<string, DBEntity> = new Map();
  relationships: Map<string, DBRelationship> = new Map();
  alerts: Map<string, DBAlert> = new Map();
  investigation_events: Map<string, DBInvestigationEvent> = new Map();
  audit_logs: Map<string, DBAuditLog> = new Map();

  firs: Map<string, any> = new Map();
  cdrs: Map<string, any> = new Map();
  financials: Map<string, any> = new Map();
  intels: Map<string, any> = new Map();

  case_diary: Map<string, DBCaseDiary> = new Map();
  arrest_memos: Map<string, DBArrestMemo> = new Map();
  history_sheets: Map<string, DBHistorySheet> = new Map();
  custody: Map<string, DBCustodyRecord> = new Map();
  charge_sheets: Map<string, DBChargeSheet> = new Map();

  // ---- Phase 5: Cyber Crime + AI Models ----
  cyber_incidents: Map<string, DBCyberIncident> = new Map();
  mesh_peers: Map<string, DBMeshPeer> = new Map();

  // ---- Phase 2: Ingestion + Approval Pipeline ----
  ingestion_batches: Map<string, DBIngestionBatch> = new Map();
  staged_entities: Map<string, DBStagedEntity> = new Map();
  staged_links: Map<string, DBStagedLink> = new Map();
  innocent_pool: Map<string, DBInnocentItem> = new Map();
  // ---- Phase 3: Personnel requisitions (Lead → Admin) ----
  requisitions: Map<string, DBRequisition> = new Map();
  // ---- Judicial dossier signatures (Sec 65B IEA / Sec 63 BSA) ----
  dossier_signatures: Map<string, DBDossierSignature> = new Map();
  transfers: Map<string, DBTransfer> = new Map();
}

// ---- Phase 2: Ingestion + Approval Pipeline record types ----
export interface DBIngestionBatch {
  _id: string;
  case_id: string;
  source: string;
  fileName?: string;
  url?: string;
  entityCount: number;
  linkCount: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  truncated?: boolean;
  status: "STAGED" | "PARTIALLY_REVIEWED" | "FULLY_REVIEWED";
  submittedBy: string;
  submittedByRank: string;
  submittedAt: string;
  hash: string;
  /** Raw source retained (capped) for as-is review + SAHAYAK summary. */
  content?: string;
  contentTruncated?: boolean;
  /** Lines/rows that yielded nothing — reviewable, never dropped. */
  unresolved?: string[];
  enrichment?: string;
  provider?: string;
}

export interface DBStagedEntity {
  _id: string;
  case_id: string;
  batchId: string;
  source: string;
  label: string;
  type: string;
  role?: string;
  riskScore: number;
  confidence: number;
  details?: any;
  evidenceRef?: string;
  locator?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  duplicateOf?: string;
  created_at: string;
}

export interface DBStagedLink {
  _id: string;
  case_id: string;
  batchId: string;
  source: string;
  sourceLabel: string;
  targetLabel: string;
  relationType: string;
  weight: number;
  frequency?: number;
  amount?: number;
  details?: string;
  evidenceRef?: string;
  locator?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  created_at: string;
}

export interface DBInnocentItem {
  _id: string;
  case_id: string;
  kind: "ENTITY" | "LINK";
  label: string;
  snapshot: any;
  rejectionReason: string;
  rejectedBy: string;
  rejectedAt: string;
  source: string;
  batchId?: string;
  readded: boolean;
}

// ---- Phase 5: Cyber Crime + AI Models record types ----
export type CyberIncidentKind =
  | "NCRP_REFERRAL"
  | "CERT_INCIDENT"
  | "SEC69_INTERCEPT"
  | "CRYPTO_TRAIL"
  | "IMEI_CEIR";

export interface DBCyberIncident {
  _id: string;
  case_id: string;
  refNo: string;
  kind: CyberIncidentKind;
  title: string;
  description: string;
  // NCRP
  ncrpAck?: string;
  ncrpCategory?: string;
  amountInvolved?: number;
  // CERT-In
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  detectedAt?: string;
  reportedAt?: string;
  reportDueAt?: string;
  affectedSystems?: string;
  iocs?: string[];
  contactName?: string;
  contactPhone?: string;
  // Sec 69 IT Act
  orderNo?: string;
  issuingAuthority?: string;
  targetIdentifier?: string;
  serviceProvider?: string;
  periodDays?: number;
  reviewDueAt?: string;
  // IMEI / CEIR
  imei?: string;
  ceirAction?: "BLOCK" | "UNBLOCK" | "TRACK";
  ownerName?: string;
  firRef?: string;
  // Crypto trail result snapshot
  trailResult?: any;
  status: string;
  recordedBy: string;
  recordedByRank: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface DBMeshPeer {
  _id: string;
  name: string;
  baseUrl: string;
  transport: string;
  adapters: string[];
  models: string[];
  enabled: boolean;
  lastLatencyMs?: number;
  lastSeen?: string;
  lastError?: string;
  addedBy: string;
  created_at: string;
}

export interface DBTransfer {
  _id: string;
  case_id: string;
  caseName: string;
  fromAgency: string;
  fromDepartment: string;
  toAgency: string;
  toDepartment: string;
  toOfficerId?: string;
  toOfficerName?: string;
  reason: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  requestedBy: string;
  requestedByRank: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  proposalHash: string;
  executionHash?: string;
  affectedMembers?: string[];
}

const memoryDb = new InMemoryDatabase();

async function seedInitialData() {
  const salt = await bcrypt.genSalt(10);
  const adminPass = await bcrypt.hash("Admin@123", salt);
  const leadPass = await bcrypt.hash("Lead@123", salt);
  const forensicPass = await bcrypt.hash("Forensic@123", salt);
  const investigatorPass = await bcrypt.hash("Officer@123", salt);
  const pendingPass = await bcrypt.hash("Officer@123", salt);
  const agencyPass = await bcrypt.hash("Agency@123", salt);

  const mkUser = (
    _id: string,
    name: string,
    official_id: string,
    email: string,
    pass: string,
    agency: string,
    designation: string,
    department: string,
    role: DBRole,
    state?: string,
    avatarColor = "#3b82f6",
    status: DBUser["status"] = "ACTIVE"
  ): DBUser => ({
    _id,
    name,
    official_id,
    email,
    password_hash: pass,
    agency,
    designation,
    department,
    role,
    state,
    status,
    created_at: "2026-08-10T09:00:00.000Z",
    approved_by: status === "ACTIVE" ? "SYSTEM_ROOT" : undefined,
    approved_at: status === "ACTIVE" ? "2026-08-10T10:00:00.000Z" : undefined,
    avatarColor,
  });

  const demoUsers: DBUser[] = [
    // ---- CBI ----
    mkUser("user-cbi-admin", "DG Meenakshi Rao, IPS", "CBI-ADM-001", "admin@cbi.gov.in", adminPass,
      "Central Bureau of Investigation (CBI)", "Director General / Admin", "Access & Case Governance", "CBI_ADMIN", undefined, "#1e3a8a"),
    mkUser("user-cbi-lead", "SP Anjali Rao, IPS", "CBI-LEAD-210", "rao@cbi.gov.in", leadPass,
      "Central Bureau of Investigation (CBI)", "Superintendent of Police (Lead IO)", "Anti-Corruption Branch", "CBI_LEAD", undefined, "#1e3a8a"),
    mkUser("user-cbi-cyber", "Insp. Aarav Mehta", "CBI-CYBER-001", "cyber@cbi.gov.in", agencyPass,
      "Central Bureau of Investigation (CBI)", "Cyber Cell Expert", "Cyber Crime & OSINT Division", "CBI_CYBER", undefined, "#0e7490"),
    mkUser("user-cbi-forensic", "Dr. Nandini Kulkarni", "CBI-FSL-101", "fsl@cbi.gov.in", forensicPass,
      "Central Bureau of Investigation (CBI)", "CFSL Examiner", "Document & Financial Forensics", "CBI_FORENSIC", undefined, "#059669"),
    mkUser("user-cbi-field", "SI Rakesh Yadav", "CBI-FLD-301", "field@cbi.gov.in", agencyPass,
      "Central Bureau of Investigation (CBI)", "Sub-Inspector", "Field Interdiction Squad", "CBI_FIELD", undefined, "#475569"),

    // ---- NIA ----
    mkUser("user-nia-admin", "ADG Ashok Batra, IPS", "NIA-ADM-001", "admin@nia.gov.in", adminPass,
      "National Investigation Agency (NIA)", "Additional DG / Admin", "Terror Financing Governance", "NIA_ADMIN", undefined, "#7f1d1d"),
    mkUser("user-nia-lead", "SP Farhan Qureshi, IPS", "NIA-LEAD-118", "qureshi@nia.gov.in", leadPass,
      "National Investigation Agency (NIA)", "Superintendent of Police (Lead IO)", "Counter-Terrorism Wing", "NIA_LEAD", undefined, "#7f1d1d"),
    mkUser("user-nia-cyber", "Scientist Ria Kapoor", "NIA-CYBER-002", "cyber@nia.gov.in", agencyPass,
      "National Investigation Agency (NIA)", "Digital Forensics Expert", "Dark Web & Encrypted Channels Cell", "NIA_CYBER", undefined, "#0e7490"),
    mkUser("user-nia-forensic", "Dr. S. Venkatesh", "NIA-FSL-102", "fsl@nia.gov.in", forensicPass,
      "National Investigation Agency (NIA)", "Explosives & Ballistics Specialist", "IED / Residue Analysis Lab", "NIA_FORENSIC", undefined, "#059669"),
    mkUser("user-nia-field", "PSO Vishal Shetty", "NIA-FLD-302", "field@nia.gov.in", agencyPass,
      "National Investigation Agency (NIA)", "Tactical Ground Unit", "Undercover Operations", "NIA_FIELD", undefined, "#475569"),

    // ---- CID ----
    mkUser("user-cid-admin", "ADGP Suresh Nadgouda, IPS", "CID-ADM-001", "admin@cid.gov.in", adminPass,
      "Crime Investigation Department (CID)", "Additional DGP / Admin", "State CID Governance", "CID_ADMIN", undefined, "#1d4ed8"),
    mkUser("user-cid-lead", "SP Rohit Inamdar, IPS", "CID-LEAD-310", "inamdar@cid.gov.in", leadPass,
      "Crime Investigation Department (CID)", "Superintendent of Police (Lead IO)", "Multi-District Investigations", "CID_LEAD", undefined, "#1d4ed8"),
    mkUser("user-cid-cyber", "Insp. Tanvi Joshi", "CID-CYBER-003", "cid_cyber_01@cid.gov.in", agencyPass,
      "Crime Investigation Department (CID)", "Cyber Cell Expert", "State Cyber Crime Cell", "CID_CYBER", undefined, "#0e7490"),
    mkUser("user-cid-forensic", "Forensic Tech. Prakash Mane", "CID-FSL-103", "fsl@cid.gov.in", forensicPass,
      "Crime Investigation Department (CID)", "State FSL / Fingerprint Bureau", "Fingerprint & Toxicology Unit", "CID_FORENSIC", undefined, "#059669"),
    mkUser("user-cid-field", "SI Sunil Pawar", "CID-FLD-303", "field@cid.gov.in", agencyPass,
      "Crime Investigation Department (CID)", "Sub-Inspector", "District Field Operations", "CID_FIELD", undefined, "#475569"),

    // ---- State Police: Maharashtra ----
    mkUser("user-mh-admin", "DGP Vinayak Chavan, IPS", "MHA-ADM-001", "admin@mahapolice.gov.in", adminPass,
      "Maharashtra Police", "Director General / Admin", "State Police Governance", "POLICE_ADMIN", "MAHARASHTRA", "#1e293b"),
    mkUser("user-mh-lead", "PI Devendra Patil", "MHA-LEAD-502", "patil@mahapolice.gov.in", leadPass,
      "Maharashtra Police", "Police Inspector (Station House)", "Anti-Narcotics & Surveillance Squad", "POLICE_LEAD", "MAHARASHTRA", "#f59e0b"),
    mkUser("user-mh-field", "PC Ramesh Gite", "MHA-FLD-701", "gite@mahapolice.gov.in", investigatorPass,
      "Maharashtra Police", "Police Constable", "Beat / Field Collection", "POLICE_FIELD", "MAHARASHTRA", "#475569"),

    // ---- State Police: Karnataka ----
    mkUser("user-ka-admin", "IGP Lakshmi Hegde, IPS", "KAR-ADM-001", "admin@karpolice.gov.in", adminPass,
      "Karnataka Police", "Inspector General / Admin", "State Police Governance", "POLICE_ADMIN", "KARNATAKA", "#1e293b"),
    mkUser("user-ka-lead", "PI Srinivas Rao", "KAR-LEAD-503", "rao@karpolice.gov.in", leadPass,
      "Karnataka Police", "Police Inspector (Station House)", "Crime Branch", "POLICE_LEAD", "KARNATAKA", "#f59e0b"),
    mkUser("user-ka-field", "PC Manjunath B.", "KAR-FLD-702", "manjunath@karpolice.gov.in", investigatorPass,
      "Karnataka Police", "Police Constable", "Beat / Field Collection", "POLICE_FIELD", "KARNATAKA", "#475569"),

    // Pending approval demo
    mkUser("user-pending-01", "Inspector Pooja Sharma", "CID-CRIME-992", "sharma@cid.gov.in", pendingPass,
      "Crime Investigation Department (CID)", "Cyber Forensics Examiner", "Digital Evidence Analysis Unit", "CID_CYBER", undefined, "#ec4899", "PENDING"),
  ];

  for (const u of demoUsers) {
    await db.users.insertOne(u);
  }

  // Access Requests seed
  const demoRequests: DBAccessRequest[] = [
    {
      _id: "req-001",
      full_name: "Inspector Pooja Sharma",
      official_id: "CID-CRIME-992",
      official_email: "sharma@cid.gov.in",
      agency: "Crime Investigation Department (CID)",
      designation: "Cyber Forensics Examiner",
      department: "Digital Evidence Analysis Unit",
      requested_role: "CID_CYBER",
      reason_for_access: "Assigned to telecom cell tower triangulation and CDR analysis for northern syndicate links.",
      status: "PENDING",
      submitted_at: "2026-08-31T14:20:00.000Z",
    },
    {
      _id: "req-002",
      full_name: "Deputy SP Arvind Kulkarni",
      official_id: "MHA-ATS-441",
      official_email: "kulkarni@mahapolice.gov.in",
      agency: "Maharashtra Police (ATS)",
      designation: "Deputy Superintendent of Police",
      department: "Counter-Hawala Intelligence Unit",
      requested_role: "POLICE_LEAD",
      reason_for_access: "Leading cross-jurisdiction interdiction on Hawala networks operating out of Surat and Dubai.",
      status: "PENDING",
      submitted_at: "2026-09-01T08:15:00.000Z",
    },
  ];

  for (const r of demoRequests) {
    await db.access_requests.insertOne(r);
  }

  // Cases seed — Phase 0 tenant tags (grandfathered joint-task-force members stay).
  const CASE_TENURES: Record<string, { org: string; state?: string }> = {
    "case-garuda": { org: "POLICE", state: "MAHARASHTRA" },
    "case-shadowvault": { org: "CBI" },
    "case-interstate": { org: "CID" },
  };
  for (const c of CASE_DATASETS) {
    const tenure = CASE_TENURES[c.id] || { org: "UNKNOWN" as string };
    await db.cases.insertOne({
      _id: c.id,
      id: c.id,
      name: c.name,
      codeName: c.codeName,
      description: c.description,
      date: c.date,
      leadAgency: c.leadAgency,
      org: tenure.org,
      state: (tenure as any).state,
      created_at: "2026-08-14T09:00:00.000Z",
    });
  }

  // Case Membership seed: Operation Garuda, ShadowVault, and Interstate
  const initialMembers: DBCaseMember[] = [
    {
      _id: "mem-001",
      case_id: "case-garuda",
      user_id: "user-mh-lead",
      user_name: "PI Devendra Patil",
      user_email: "patil@mahapolice.gov.in",
      official_id: "MHA-LEAD-502",
      agency: "Maharashtra Police",
      role: "POLICE_LEAD",
      state: "MAHARASHTRA",
      status: "ACTIVE",
      assigned_at: "2026-08-14T09:00:00.000Z",
      assigned_by: "user-mh-admin",
    },
    {
      _id: "mem-002",
      case_id: "case-garuda",
      user_id: "user-cid-forensic",
      user_name: "Forensic Tech. Prakash Mane",
      user_email: "fsl@cid.gov.in",
      official_id: "CID-FSL-103",
      agency: "Crime Investigation Department (CID)",
      role: "CID_FORENSIC",
      status: "ACTIVE",
      assigned_at: "2026-08-14T09:15:00.000Z",
      assigned_by: "user-mh-admin",
    },
    {
      _id: "mem-003",
      case_id: "case-garuda",
      user_id: "user-mh-field",
      user_name: "PC Ramesh Gite",
      user_email: "gite@mahapolice.gov.in",
      official_id: "MHA-FLD-701",
      agency: "Maharashtra Police",
      role: "POLICE_FIELD",
      state: "MAHARASHTRA",
      status: "ACTIVE",
      assigned_at: "2026-08-14T09:20:00.000Z",
      assigned_by: "user-mh-admin",
    },
    {
      _id: "mem-004",
      case_id: "case-shadowvault",
      user_id: "user-cbi-lead",
      user_name: "SP Anjali Rao, IPS",
      user_email: "rao@cbi.gov.in",
      official_id: "CBI-LEAD-210",
      agency: "Central Bureau of Investigation (CBI)",
      role: "CBI_LEAD",
      status: "ACTIVE",
      assigned_at: "2026-08-16T11:00:00.000Z",
      assigned_by: "user-cbi-admin",
    },
    {
      _id: "mem-005",
      case_id: "case-garuda",
      user_id: "user-cbi-lead",
      user_name: "SP Anjali Rao, IPS",
      user_email: "rao@cbi.gov.in",
      official_id: "CBI-LEAD-210",
      agency: "Central Bureau of Investigation (CBI)",
      role: "CBI_LEAD",
      status: "ACTIVE",
      assigned_at: "2026-08-16T11:00:00.000Z",
      assigned_by: "user-cbi-admin",
    },
    {
      _id: "mem-006",
      case_id: "case-garuda",
      user_id: "user-nia-lead",
      user_name: "SP Farhan Qureshi, IPS",
      user_email: "qureshi@nia.gov.in",
      official_id: "NIA-LEAD-118",
      agency: "National Investigation Agency (NIA)",
      role: "NIA_LEAD",
      status: "ACTIVE",
      assigned_at: "2026-08-16T11:00:00.000Z",
      assigned_by: "user-nia-admin",
    },
    {
      _id: "mem-007",
      case_id: "case-garuda",
      user_id: "user-cid-lead",
      user_name: "SP Rohit Inamdar, IPS",
      user_email: "inamdar@cid.gov.in",
      official_id: "CID-LEAD-310",
      agency: "Crime Investigation Department (CID)",
      role: "CID_LEAD",
      status: "ACTIVE",
      assigned_at: "2026-08-16T11:00:00.000Z",
      assigned_by: "user-cid-admin",
    },
    {
      _id: "mem-008",
      case_id: "case-shadowvault",
      user_id: "user-cid-cyber",
      user_name: "Insp. Tanvi Joshi",
      user_email: "cid_cyber_01@cid.gov.in",
      official_id: "CID-CYBER-003",
      agency: "Crime Investigation Department (CID)",
      role: "CID_CYBER",
      status: "ACTIVE",
      assigned_at: "2026-08-16T11:00:00.000Z",
      assigned_by: "user-cid-admin",
    },
  ];

  for (const m of initialMembers) {
    await db.case_members.insertOne(m);
  }

  // Seed sample observations
  const demoObservations: DBObservation[] = [
    {
      _id: "obs-001",
      case_id: "case-garuda",
      observation_type: "SUSPECT_SIGHTING",
      title: "Physical Sighting: Karan Saluja at Vashi Toll Plaza",
      narrative: "During vehicle interdiction duty, logistics operator Karan Saluja was sighted driving white Fortuner GA-03-K-4411 leading an enclosed container truck MH-04-AZ-8890 heading towards Panvel bypass.",
      location_name: "Vashi Toll Plaza, Navi Mumbai",
      lat: 19.055,
      lng: 72.975,
      timestamp: "2026-08-14T00:45:00.000Z",
      officer_id: "user-mh-field",
      officer_name: "PC Ramesh Gite",
      officer_role: "POLICE_FIELD",
      officer_badge: "MHA-FLD-701",
      related_entities: [
        { id: "suspect-saluja", label: "Karan 'Rider' Saluja", type: "PERSON", role_in_observation: "Driver of escort vehicle" },
        { id: "veh-ga03k4411", label: "Toyota Fortuner GA-03-K-4411", type: "VEHICLE", role_in_observation: "Escort vehicle" },
      ],
      observed_relationships: [
        { source_id: "suspect-saluja", target_id: "veh-ga03k4411", relation_type: "OWNS", notes: "Direct visual driving confirmation" },
      ],
      attachments: [
        {
          id: "att-001",
          file_name: "vashi_toll_dashcam_0045.jpg",
          file_type: "image/jpeg",
          file_size_formatted: "2.4 MB",
          sha256: "sha256:a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef",
          media_category: "PHOTO",
        },
      ],
      status: "INTEGRATED_IN_CASE",
      confidence_score: 0.96,
      tags: ["CONVOY", "VASHI", "VEHICLE_SIGHTING"],
      created_at: "2026-08-14T01:15:00.000Z",
    },
  ];

  for (const obs of demoObservations) {
    await db.observations.insertOne(obs);
  }

  // Seed sample Case Access Request
  const demoCaseRequests: DBCaseAccessRequest[] = [
    {
      _id: "case_req-001",
      case_id: "case-shadowvault",
      case_name: "Operation ShadowVault: Darknet Cyber Extortion & USDT Wash",
      case_code: "OP-SHADOWVAULT-2026",
      user_id: "user-cid-forensic",
      user_name: "Forensic Tech. Prakash Mane",
      user_email: "fsl@cid.gov.in",
      official_id: "CID-FSL-103",
      agency: "Crime Investigation Department (CID)",
      user_role: "CID_FORENSIC",
      reason_for_access: "Assigned to analyze cryptocurrency transaction flows and USDT tumbler ledgers for cyber forensics.",
      status: "PENDING",
      requested_at: "2026-09-01T10:30:00.000Z",
    },
  ];

  for (const cr of demoCaseRequests) {
    await db.case_access_requests.insertOne(cr);
  }

  // Seed Evidence
  const garudaEvidence: DBEvidence[] = [
    {
      _id: "EVID-001",
      case_id: "case-garuda",
      file_name: "FIR_209_SpecialCell_CrimeBranch.pdf",
      file_size: 4280000,
      file_size_formatted: "4.28 MB",
      file_type: "PDF",
      file_hash: "sha256:7f8e9a4b2c1d889201a094bb819c927f8a9e2c4d1b8e9a4b",
      uploaded_at: "2026-08-14 09:30:00",
      uploaded_by: "Inspector Sameer Deshmukh",
      uploader_role: "FORENSIC_INVESTIGATOR",
      status: "COMMITTED",
      source_authority: "Special Cell, Lodhi Colony HQ",
      summary: "Special Cell seizure memo regarding 12kg MDMA in Nhava Sheva container terminal and interception of call records.",
      extracted_entities_count: 8,
      extracted_relations_count: 12,
    },
    {
      _id: "EVID-002",
      case_id: "case-garuda",
      file_name: "CDR_Dongri_Vashi_Surveillance_Dump.csv",
      file_size: 18400000,
      file_size_formatted: "18.4 MB",
      file_type: "CDR_CSV",
      file_hash: "sha256:3a1b4c9e8f7d6e5a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
      uploaded_at: "2026-08-14 11:15:00",
      uploaded_by: "Inspector Sameer Deshmukh",
      uploader_role: "FORENSIC_INVESTIGATOR",
      status: "COMMITTED",
      source_authority: "Nodal Cyber Operations, Mumbai",
      summary: "Telecom service provider tower pings showing handset IMEI 864219038472911 hopping across Dongri, Vashi, and Goa towers.",
      extracted_entities_count: 6,
      extracted_relations_count: 9,
    },
    {
      _id: "EVID-003",
      case_id: "case-garuda",
      file_name: "Hawala_Angadia_Transaction_Ledgers.csv",
      file_size: 9200000,
      file_size_formatted: "9.2 MB",
      file_type: "FINANCIAL_CSV",
      file_hash: "sha256:c9b8a7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6",
      uploaded_at: "2026-08-14 14:00:00",
      uploaded_by: "Inspector Sameer Deshmukh",
      uploader_role: "FORENSIC_INVESTIGATOR",
      status: "COMMITTED",
      source_authority: "Financial Intelligence Unit (FIU-IND)",
      summary: "Layered payments from Apex Agro Exports through mule UPI handles to Rameshwar Joshi's account.",
      extracted_entities_count: 5,
      extracted_relations_count: 8,
    },
    {
      _id: "EVID-004",
      case_id: "case-garuda",
      file_name: "CCTV_Vashi_Toll_Container_Pass.mp4",
      file_size: 1450000000,
      file_size_formatted: "1.45 GB",
      file_type: "VIDEO_CCTV",
      file_hash: "sha256:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
      uploaded_at: "2026-08-14 16:30:00",
      uploaded_by: "Inspector Sameer Deshmukh",
      uploader_role: "FORENSIC_INVESTIGATOR",
      status: "COMMITTED",
      source_authority: "Maharashtra State Road Development Corp",
      summary: "ANPR camera capture of container truck MH-04-AZ-8890 escorted by Toyota Fortuner GA-03-K-4411 at 00:45 AM.",
      extracted_entities_count: 2,
      extracted_relations_count: 2,
    },
  ];

  for (const ev of garudaEvidence) {
    await db.evidence.insertOne(ev);
  }

  // Seed Entities for Operation Garuda
  const garudaEnts: DBEntity[] = GARUDA_SYNDICATE_NODES.map((node) => ({
    _id: `ent-garuda-${node.id}`,
    case_id: "case-garuda",
    ...node,
    evidence_ids: node.sourceDocumentIds || ["EVID-001"],
  }));
  await db.entities.upsertMany(garudaEnts);

  // Seed Relationships for Operation Garuda with Provenance
  const garudaRels: DBRelationship[] = GARUDA_SYNDICATE_LINKS.map((link) => {
    const src = typeof link.source === "object" ? (link.source as any).id : link.source;
    const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
    return {
      _id: `rel-garuda-${link.id}`,
      case_id: "case-garuda",
      id: link.id,
      source: src,
      target: tgt,
      relationType: link.relationType,
      category: link.category,
      reviewState: link.reviewState,
      weight: link.weight,
      frequency: link.frequency,
      amount: link.amount,
      durationSec: link.durationSec,
      timestamp: link.timestamp,
      details: link.details,
      evidence_ids: link.sourceDocumentId ? [link.sourceDocumentId] : ["EVID-001", "EVID-002"],
      source_type: link.relationType === "CALLS" ? "CDR" : link.relationType === "FUNDS_TRANSFER" ? "FINANCIAL_LEDGER" : "FIR",
      confidence: link.weight >= 0.8 ? 0.95 : 0.85,
      flags: link.flags,
      evidenceDetail: link.evidenceDetail,
    };
  });
  await db.relationships.upsertMany(garudaRels);

  // Seed ShadowVault Entities & Links
  const shadowEnts: DBEntity[] = SHADOWVAULT_NODES.map((node) => ({
    _id: `ent-shadow-${node.id}`,
    case_id: "case-shadowvault",
    ...node,
    evidence_ids: ["EVID-SV-01"],
  }));
  await db.entities.upsertMany(shadowEnts);

  const shadowRels: DBRelationship[] = SHADOWVAULT_LINKS.map((link) => {
    const src = typeof link.source === "object" ? (link.source as any).id : link.source;
    const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
    return {
      _id: `rel-shadow-${link.id}`,
      case_id: "case-shadowvault",
      id: link.id,
      source: src,
      target: tgt,
      relationType: link.relationType,
      weight: link.weight,
      evidence_ids: ["EVID-SV-01"],
      source_type: "FINANCIAL_LEDGER",
      confidence: 0.9,
    };
  });
  await db.relationships.upsertMany(shadowRels);

  // Seed FIR, CDR, Financials, Intel
  for (const item of GARUDA_FIRS) await db.firs.insertOne({ case_id: "case-garuda", ...item });
  await db.cdrs.insertMany(GARUDA_CDRS.map((item) => ({ case_id: "case-garuda", ...item })));
  await db.financials.insertMany(GARUDA_FINANCIALS.map((item) => ({ case_id: "case-garuda", ...item })));
  for (const item of GARUDA_INTEL) await db.intels.insertOne({ case_id: "case-garuda", ...item });

  // Seed Audit Logs
  for (const log of INITIAL_AUDIT_LOGS) {
    const al: DBAuditLog = {
      _id: log.id,
      timestamp: log.timestamp,
      user_id: log.officerId,
      user_name: log.officerName,
      user_role: log.officerRole as any,
      action: log.actionType || "AUDIT_RECORD",
      action_type: log.actionType,
      case_id: log.targetId?.startsWith("case-") ? log.targetId : "case-garuda",
      resource_id: log.targetId,
      target_label: log.targetLabel,
      details: log.details,
      digital_hash: log.digitalHash || `sha256:${Date.now()}`,
      result: "SUCCESS",
    };
    await db.audit_logs.insertOne(al);
  }
}

// Data Access Object / Collections Helper (in-memory backend).
// `db` is a swappable facade: initDatabase() replaces it with the Mongo
// backend when MONGO_URL is set. Importers hold a live binding.
const memoryBackend = {
  users: {
    find: async (query: Partial<DBUser> = {}) => {
      const all = Array.from(memoryDb.users.values());
      return all.filter((u) => Object.entries(query).every(([k, v]) => (u as any)[k] === v));
    },
    findOne: async (query: { _id?: string; email?: string; official_id?: string }) => {
      const all = Array.from(memoryDb.users.values());
      return all.find((u) => {
        if (query._id && u._id === query._id) return true;
        if (query.email && u.email.toLowerCase() === query.email.toLowerCase()) return true;
        if (query.official_id && u.official_id.toLowerCase() === query.official_id.toLowerCase()) return true;
        return false;
      }) || null;
    },
    insertOne: async (user: DBUser) => {
      memoryDb.users.set(user._id, user);
      return user;
    },
    updateOne: async (id: string, updates: Partial<DBUser>) => {
      const existing = memoryDb.users.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.users.set(id, updated);
      return updated;
    },
    count: async () => memoryDb.users.size,
  },

  access_requests: {
    find: async (query: Partial<DBAccessRequest> = {}) => {
      const all = Array.from(memoryDb.access_requests.values());
      return all
        .filter((r) => Object.entries(query).every(([k, v]) => (r as any)[k] === v))
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    },
    findOne: async (id: string) => memoryDb.access_requests.get(id) || null,
    insertOne: async (req: DBAccessRequest) => {
      memoryDb.access_requests.set(req._id, req);
      return req;
    },
    updateOne: async (id: string, updates: Partial<DBAccessRequest>) => {
      const existing = memoryDb.access_requests.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.access_requests.set(id, updated);
      return updated;
    },
  },

  case_access_requests: {
    find: async (query: { case_id?: string; user_id?: string; status?: string } = {}) => {
      const all = Array.from(memoryDb.case_access_requests.values());
      return all
        .filter((r) => {
          if (query.case_id && r.case_id !== query.case_id) return false;
          if (query.user_id && r.user_id !== query.user_id) return false;
          if (query.status && r.status !== query.status) return false;
          return true;
        })
        .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
    },
    findOne: async (id: string) => memoryDb.case_access_requests.get(id) || null,
    findOneByCaseAndUser: async (case_id: string, user_id: string) => {
      const all = Array.from(memoryDb.case_access_requests.values());
      return all.find((r) => r.case_id === case_id && r.user_id === user_id && r.status === "PENDING") || null;
    },
    insertOne: async (req: DBCaseAccessRequest) => {
      memoryDb.case_access_requests.set(req._id, req);
      return req;
    },
    updateOne: async (id: string, updates: Partial<DBCaseAccessRequest>) => {
      const existing = memoryDb.case_access_requests.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.case_access_requests.set(id, updated);
      return updated;
    },
  },

  cases: {
    find: async () => Array.from(memoryDb.cases.values()),
    findOne: async (id: string) => memoryDb.cases.get(id) || null,
    insertOne: async (c: any) => {
      memoryDb.cases.set(c.id, c);
      return c;
    },
    updateOne: async (id: string, updates: Record<string, any>) => {
      const existing: any = memoryDb.cases.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.cases.set(id, updated);
      return updated;
    },
  },

  case_members: {
    find: async (query: { case_id?: string; user_id?: string }) => {
      const all = Array.from(memoryDb.case_members.values());
      return all.filter((m) => {
        if (query.case_id && m.case_id !== query.case_id) return false;
        if (query.user_id && m.user_id !== query.user_id) return false;
        return true;
      });
    },
    findOne: async (query: { case_id: string; user_id: string }) => {
      const all = Array.from(memoryDb.case_members.values());
      return all.find((m) => m.case_id === query.case_id && m.user_id === query.user_id) || null;
    },
    insertOne: async (member: DBCaseMember) => {
      memoryDb.case_members.set(member._id, member);
      return member;
    },
    updateOne: async (id: string, updates: Partial<DBCaseMember>) => {
      const existing = memoryDb.case_members.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.case_members.set(id, updated);
      return updated;
    },
    deleteOne: async (id: string) => {
      memoryDb.case_members.delete(id);
      return true;
    },
    deleteByCaseAndUser: async (case_id: string, user_id: string) => {
      for (const [k, v] of memoryDb.case_members.entries()) {
        if (v.case_id === case_id && v.user_id === user_id) {
          memoryDb.case_members.delete(k);
          return true;
        }
      }
      return false;
    },
  },

  evidence: {
    find: async (query: { case_id?: string; status?: string } = {}) => {
      const all = Array.from(memoryDb.evidence.values());
      return all
        .filter((e) => {
          if (query.case_id && e.case_id !== query.case_id) return false;
          if (query.status && e.status !== query.status) return false;
          return true;
        })
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
    },
    findOne: async (id: string) => memoryDb.evidence.get(id) || null,
    insertOne: async (ev: DBEvidence) => {
      memoryDb.evidence.set(ev._id, ev);
      return ev;
    },
    updateOne: async (id: string, updates: Partial<DBEvidence>) => {
      const existing = memoryDb.evidence.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.evidence.set(id, updated);
      return updated;
    },
  },

  observations: {
    find: async (query: { case_id?: string; officer_id?: string; status?: string } = {}) => {
      const all = Array.from(memoryDb.observations.values());
      return all
        .filter((obs) => {
          if (query.case_id && obs.case_id !== query.case_id) return false;
          if (query.officer_id && obs.officer_id !== query.officer_id) return false;
          if (query.status && obs.status !== query.status) return false;
          return true;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    findOne: async (id: string) => memoryDb.observations.get(id) || null,
    insertOne: async (obs: DBObservation) => {
      memoryDb.observations.set(obs._id, obs);
      return obs;
    },
    updateOne: async (id: string, updates: Partial<DBObservation>) => {
      const existing = memoryDb.observations.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.observations.set(id, updated);
      return updated;
    },
  },

  entities: {
    find: async (query: { case_id: string }) => {
      const all = Array.from(memoryDb.entities.values());
      return all.filter((e) => e.case_id === query.case_id);
    },
    findOne: async (case_id: string, id: string) => {
      const all = Array.from(memoryDb.entities.values());
      return all.find((e) => e.case_id === case_id && (e.id === id || e._id === id)) || null;
    },
    upsertMany: async (entitiesList: DBEntity[]) => {
      for (const ent of entitiesList) {
        // find existing by label or id in case
        let key = ent._id || `ent-${ent.case_id}-${ent.id}`;
        memoryDb.entities.set(key, { ...ent, _id: key });
      }
      return entitiesList;
    },
    insertOne: async (ent: DBEntity) => {
      const key = ent._id || `ent-${ent.case_id}-${ent.id}`;
      memoryDb.entities.set(key, { ...ent, _id: key });
      return ent;
    },
    updateOne: async (id: string, updates: Partial<DBEntity>) => {
      const existing = memoryDb.entities.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.entities.set(id, updated);
      return updated;
    },
  },

  relationships: {
    find: async (query: { case_id: string }) => {
      const all = Array.from(memoryDb.relationships.values());
      return all.filter((r) => r.case_id === query.case_id);
    },
    upsertMany: async (relsList: DBRelationship[]) => {
      for (const rel of relsList) {
        let key = rel._id || `rel-${rel.case_id}-${rel.id}`;
        memoryDb.relationships.set(key, { ...rel, _id: key });
      }
      return relsList;
    },
    insertOne: async (rel: DBRelationship) => {
      const key = rel._id || `rel-${rel.case_id}-${rel.id}`;
      memoryDb.relationships.set(key, { ...rel, _id: key });
      return rel;
    },
    updateOne: async (id: string, updates: Partial<DBRelationship>) => {
      const existing = memoryDb.relationships.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.relationships.set(id, updated);
      return updated;
    },
  },

  investigation_events: {
    find: async (query: { case_id?: string } = {}) => {
      const all = Array.from(memoryDb.investigation_events.values());
      return all
        .filter((ev) => !query.case_id || ev.case_id === query.case_id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    insertOne: async (ev: DBInvestigationEvent) => {
      memoryDb.investigation_events.set(ev._id, ev);
      return ev;
    },
  },

  audit_logs: {
    find: async (query: { case_id?: string; user_id?: string } = {}) => {
      const all = Array.from(memoryDb.audit_logs.values());
      return all
        .filter((l) => {
          if (query.case_id && l.case_id !== query.case_id) return false;
          if (query.user_id && l.user_id !== query.user_id) return false;
          return true;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    insertOne: async (log: DBAuditLog) => {
      memoryDb.audit_logs.set(log._id, log);
      return log;
    },
  },

  firs: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.firs.values()).filter((f) => f.case_id === case_id);
    },
    insertOne: async (fir: any) => {
      const key = `fir-${fir.case_id}-${fir.id}`;
      memoryDb.firs.set(key, fir);
      return fir;
    },
  },

  cdrs: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.cdrs.values()).filter((c) => c.case_id === case_id);
    },
    insertMany: async (items: any[]) => {
      for (const item of items) {
        const key = `cdr-${item.case_id}-${item.id}`;
        memoryDb.cdrs.set(key, item);
      }
      return items;
    },
  },

  financials: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.financials.values()).filter((f) => f.case_id === case_id);
    },
    insertMany: async (items: any[]) => {
      for (const item of items) {
        const key = `fin-${item.case_id}-${item.id}`;
        memoryDb.financials.set(key, item);
      }
      return items;
    },
  },

  intels: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.intels.values()).filter((i) => i.case_id === case_id);
    },
    insertOne: async (intel: any) => {
      const key = `intel-${intel.case_id}-${intel.id || Date.now()}`;
      memoryDb.intels.set(key, intel);
      return intel;
    },
  },

  // ---- Phase 1: Core Investigation Engine ----
  case_diary: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.case_diary.values())
        .filter((d) => d.case_id === case_id)
        .sort((a, b) => a.diaryNo - b.diaryNo);
    },
    findOne: async (id: string) => memoryDb.case_diary.get(id) || null,
    insertOne: async (entry: DBCaseDiary) => {
      memoryDb.case_diary.set(entry._id, entry);
      return entry;
    },
    updateOne: async (id: string, updates: Partial<DBCaseDiary>) => {
      const existing = memoryDb.case_diary.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.case_diary.set(id, updated);
      return updated;
    },
  },

  arrest_memos: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.arrest_memos.values())
        .filter((m) => m.case_id === case_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    findOne: async (id: string) => memoryDb.arrest_memos.get(id) || null,
    insertOne: async (memo: DBArrestMemo) => {
      memoryDb.arrest_memos.set(memo._id, memo);
      return memo;
    },
    updateOne: async (id: string, updates: Partial<DBArrestMemo>) => {
      const existing = memoryDb.arrest_memos.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.arrest_memos.set(id, updated);
      return updated;
    },
  },

  history_sheets: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.history_sheets.values()).filter((h) => h.case_id === case_id);
    },
    findOne: async (id: string) => memoryDb.history_sheets.get(id) || null,
    insertOne: async (sheet: DBHistorySheet) => {
      memoryDb.history_sheets.set(sheet._id, sheet);
      return sheet;
    },
    updateOne: async (id: string, updates: Partial<DBHistorySheet>) => {
      const existing = memoryDb.history_sheets.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.history_sheets.set(id, updated);
      return updated;
    },
  },

  custody: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.custody.values()).filter((c) => c.case_id === case_id);
    },
    findOne: async (id: string) => memoryDb.custody.get(id) || null,
    insertOne: async (rec: DBCustodyRecord) => {
      memoryDb.custody.set(rec._id, rec);
      return rec;
    },
    updateOne: async (id: string, updates: Partial<DBCustodyRecord>) => {
      const existing = memoryDb.custody.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.custody.set(id, updated);
      return updated;
    },
  },

  charge_sheets: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.charge_sheets.values()).filter((c) => c.case_id === case_id);
    },
    findOne: async (id: string) => memoryDb.charge_sheets.get(id) || null,
    insertOne: async (cs: DBChargeSheet) => {
      memoryDb.charge_sheets.set(cs._id, cs);
      return cs;
    },
    updateOne: async (id: string, updates: Partial<DBChargeSheet>) => {
      const existing = memoryDb.charge_sheets.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.charge_sheets.set(id, updated);
      return updated;
    },
  },

  // ---- Phase 2: Ingestion + Approval Pipeline ----
  ingestion_batches: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.ingestion_batches.values())
        .filter((b) => b.case_id === case_id)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    },
    findOne: async (id: string) => memoryDb.ingestion_batches.get(id) || null,
    insertOne: async (b: DBIngestionBatch) => {
      memoryDb.ingestion_batches.set(b._id, b);
      return b;
    },
    updateOne: async (id: string, updates: Partial<DBIngestionBatch>) => {
      const existing = memoryDb.ingestion_batches.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.ingestion_batches.set(id, updated);
      return updated;
    },
  },

  staged_entities: {
    find: async (case_id: string, status?: string) => {
      return Array.from(memoryDb.staged_entities.values()).filter(
        (e) => e.case_id === case_id && (!status || e.status === status)
      );
    },
    findOne: async (id: string) => memoryDb.staged_entities.get(id) || null,
    insertMany: async (items: DBStagedEntity[]) => {
      for (const it of items) memoryDb.staged_entities.set(it._id, it);
      return items;
    },
    updateOne: async (id: string, updates: Partial<DBStagedEntity>) => {
      const existing = memoryDb.staged_entities.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.staged_entities.set(id, updated);
      return updated;
    },
    deleteOne: async (id: string) => {
      return memoryDb.staged_entities.delete(id);
    },
  },

  staged_links: {
    find: async (case_id: string, status?: string) => {
      return Array.from(memoryDb.staged_links.values()).filter(
        (l) => l.case_id === case_id && (!status || l.status === status)
      );
    },
    findOne: async (id: string) => memoryDb.staged_links.get(id) || null,
    insertMany: async (items: DBStagedLink[]) => {
      for (const it of items) memoryDb.staged_links.set(it._id, it);
      return items;
    },
    updateOne: async (id: string, updates: Partial<DBStagedLink>) => {
      const existing = memoryDb.staged_links.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.staged_links.set(id, updated);
      return updated;
    },
    deleteOne: async (id: string) => {
      return memoryDb.staged_links.delete(id);
    },
  },

  innocent_pool: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.innocent_pool.values())
        .filter((i) => i.case_id === case_id)
        .sort((a, b) => new Date(b.rejectedAt).getTime() - new Date(a.rejectedAt).getTime());
    },
    findOne: async (id: string) => memoryDb.innocent_pool.get(id) || null,
    insertOne: async (item: DBInnocentItem) => {
      memoryDb.innocent_pool.set(item._id, item);
      return item;
    },
    updateOne: async (id: string, updates: Partial<DBInnocentItem>) => {
      const existing = memoryDb.innocent_pool.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.innocent_pool.set(id, updated);
      return updated;
    },
  },

  transfers: {
    find: async (case_id: string) => {
      return Array.from(memoryDb.transfers.values())
        .filter((t) => t.case_id === case_id)
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    },
    findOne: async (id: string) => memoryDb.transfers.get(id) || null,
    insertOne: async (t: DBTransfer) => {
      memoryDb.transfers.set(t._id, t);
      return t;
    },
    updateOne: async (id: string, updates: Partial<DBTransfer>) => {
      const existing = memoryDb.transfers.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.transfers.set(id, updated);
      return updated;
    },
  },

  // ---- Phase 5: Cyber Crime + AI Models ----
  cyber_incidents: {
    find: async (case_id: string, kind?: string) => {
      return Array.from(memoryDb.cyber_incidents.values())
        .filter((i) => i.case_id === case_id && (!kind || i.kind === kind))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    findOne: async (id: string) => memoryDb.cyber_incidents.get(id) || null,
    insertOne: async (incident: DBCyberIncident) => {
      memoryDb.cyber_incidents.set(incident._id, incident);
      return incident;
    },
    updateOne: async (id: string, updates: Partial<DBCyberIncident>) => {
      const existing = memoryDb.cyber_incidents.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.cyber_incidents.set(id, updated);
      return updated;
    },
  },

  mesh_peers: {
    find: async () => {
      return Array.from(memoryDb.mesh_peers.values()).sort((a, b) =>
        a.created_at < b.created_at ? -1 : 1
      );
    },
    findOne: async (id: string) => memoryDb.mesh_peers.get(id) || null,
    insertOne: async (peer: DBMeshPeer) => {
      memoryDb.mesh_peers.set(peer._id, peer);
      return peer;
    },
    updateOne: async (id: string, updates: Partial<DBMeshPeer>) => {
      const existing = memoryDb.mesh_peers.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.mesh_peers.set(id, updated);
      return updated;
    },
    deleteOne: async (id: string) => {
      return memoryDb.mesh_peers.delete(id);
    },
  },

  // ---- Judicial dossier signatures ----
  dossier_signatures: {
    find: async (query: { case_id?: string } = {}) => {
      return Array.from(memoryDb.dossier_signatures.values())
        .filter((s) => !query.case_id || s.case_id === query.case_id)
        .sort((a, b) => new Date(b.signed_at).getTime() - new Date(a.signed_at).getTime());
    },
    findOne: async (id: string) => memoryDb.dossier_signatures.get(id) || null,
    insertOne: async (sig: DBDossierSignature) => {
      memoryDb.dossier_signatures.set(sig._id, sig);
      return sig;
    },
  },

  // ---- Phase 3: Personnel requisitions ----
  requisitions: {
    find: async (query: { case_id?: string; status?: string } = {}) => {
      return Array.from(memoryDb.requisitions.values())
        .filter(
          (r) =>
            (!query.case_id || r.case_id === query.case_id) &&
            (!query.status || r.status === query.status)
        )
        .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
    },
    findOne: async (id: string) => memoryDb.requisitions.get(id) || null,
    insertOne: async (req: DBRequisition) => {
      memoryDb.requisitions.set(req._id, req);
      return req;
    },
    updateOne: async (id: string, updates: Partial<DBRequisition>) => {
      const existing = memoryDb.requisitions.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      memoryDb.requisitions.set(id, updated);
      return updated;
    },
  },
};

export type DbBackend = typeof memoryBackend;

/** Active backend — memory by default, Mongo after initDatabase() when configured. */
export let db: DbBackend = memoryBackend;

/** True when the Mongo backend is active (surfaced in /api/health). */
export let isMongoBackend = false;

export async function initDatabase(): Promise<{ isMongo: boolean }> {
  const mongoUrl = (process.env.MONGO_URL || "").trim();
  if (mongoUrl) {
    try {
      const { createMongoBackend } = await import("./mongo");
      const mongo = await createMongoBackend(mongoUrl, (process.env.MONGO_DB || "crimintel").trim() || "crimintel");
      db = mongo as DbBackend;
      isMongoBackend = true;
      console.log("[DATABASE] MongoDB vault store connected.");
      const existing = await db.users.find();
      if (existing.length === 0) {
        console.log("[DATABASE] Empty vault — seeding initial data.");
        await seedInitialData();
      } else {
        console.log(`[DATABASE] Vault holds ${existing.length} officer accounts — skipping seed.`);
      }
      return { isMongo: true };
    } catch (err: any) {
      console.error(`[DATABASE] MongoDB unavailable (${err.message}) — falling back to memory vault.`);
    }
  }
  console.log("[DATABASE] Initializing high-performance integrated memory security vault store.");
  await seedInitialData();
  return { isMongo: false };
}
