export type EntityType =
  | "PERSON"
  | "PHONE"
  | "FINANCIAL"
  | "LOCATION"
  | "VEHICLE"
  | "ORGANIZATION"
  | "INCIDENT"
  | "SOCIAL_MEDIA";

export type OSINTPlatform =
  | "TWITTER"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "TELEGRAM_PUBLIC"
  | "YOUTUBE"
  | "LINKEDIN"
  | "OTHER";

export type RelationType =
  | "CALLS"
  | "FUNDS_TRANSFER"
  | "CO_ACCUSED"
  | "TRAVELLED_WITH"
  | "ASSOCIATED_WITH"
  | "OWNS"
  | "OPERATES_FROM"
  | "MEMBER_OF"
  | "LOCATED_AT";

export type IntelligenceClassification = 
  | "UNCLASSIFIED"
  | "RESTRICTED"
  | "CONFIDENTIAL"
  | "SECRET"
  | "TOP_SECRET";

export type IntelligenceCompartment = 
  | "GENERAL"
  | "NARCOTICS"
  | "TERRORISM"
  | "CYBER"
  | "ECONOMIC"
  | "ORGANIZED_CRIME";

export type IntelligenceCaveat = 
  | "NOFORN"
  | "ORCON"
  | "PROPIN"
  | "REL_TO_IND"
  | "EYES_ONLY";

export type InformationCategory =
  | "EVIDENCE"
  | "INVESTIGATOR_KNOWLEDGE"
  | "INFERENCE"
  | "HYPOTHESIS"
  | "OSINT";

export type ReviewState =
  | "CONFIRMED"
  | "NEEDS_REVIEW"
  | "REJECTED"
  | "UNCERTAIN";

export type AIProcessingEngine =
  | "LOCAL_OFFLINE"
  | "GROQ_LPU"
  | "GEMINI_37";

// Phase 0 — canonical per-organization roles live in the shared model.
export type { UserRole } from "../data/roles";
import type { UserRole } from "../data/roles";

export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";

export type RelationshipProvenance =
  | "FIELD_OBSERVATION"
  | "FORENSIC_EXTRACTION"
  | "CDR_TRIANGULATION"
  | "FINANCIAL_LEDGER"
  | "MANUAL_INVESTIGATION"
  | "AI_SUGGESTED"
  | "SOCIAL_MEDIA";

export type RelationshipStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "AI_SUGGESTED"
  | "EXTRACTED";

export interface UserAccount {
  _id: string;
  name: string;
  official_id: string;
  email: string;
  agency: string;
  designation: string;
  department: string;
  role: UserRole;
  /** State police jurisdiction (e.g. "MAHARASHTRA", "KARNATAKA"); undefined for central agencies. */
  state?: string;
  status: UserStatus;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  last_login?: string;
  avatarColor?: string;
  permissions?: {
    canSignDossier: boolean;
    canConfirmEvidence: boolean;
    canRejectEvidence: boolean;
    canAddHypothesis: boolean;
    canIngestData: boolean;
    canExportData: boolean;
    canEditGraph?: boolean;
    canAccessCopilot?: boolean;
  };
  clearance?: {
    level: IntelligenceClassification;
    compartments: IntelligenceCompartment[];
    caveats: IntelligenceCaveat[];
  };
}

export interface AccessRequest {
  _id: string;
  full_name: string;
  official_id: string;
  official_email: string;
  agency: string;
  designation: string;
  department: string;
  requested_role: UserRole;
  reason_for_access: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  notes?: string;
}

export interface CaseMember {
  _id: string;
  case_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  official_id?: string;
  agency?: string;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  assigned_at: string;
  assigned_by?: string;
}

export interface CaseAccessRequest {
  _id: string;
  case_id: string;
  case_name: string;
  case_code: string;
  user_id: string;
  user_name: string;
  user_email: string;
  official_id: string;
  agency: string;
  user_role: UserRole;
  reason_for_access: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
}

export interface FieldObservation {
  id: string;
  caseId: string;
  observationType:
    | "SUSPECT_SIGHTING"
    | "LOCATION_SURVEILLANCE"
    | "VEHICLE_TRACKING"
    | "FIELD_INTEL_NOTE"
    | "RELATIONSHIP_OBSERVED";
  title: string;
  narrative: string;
  locationName: string;
  lat?: number;
  lng?: number;
  timestamp: string;
  officerId: string;
  officerName: string;
  officerRole: UserRole;
  officerBadge: string;
  relatedEntities: Array<{
    id: string;
    label: string;
    type: EntityType;
    roleInObservation?: string;
  }>;
  observedRelationships?: Array<{
    sourceId: string;
    targetId: string;
    relationType: RelationType;
    notes?: string;
  }>;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSizeFormatted: string;
    sha256: string;
    mediaCategory: "PHOTO" | "AUDIO" | "VIDEO" | "DOCUMENT";
  }>;
  status: "SUBMITTED" | "VALIDATED" | "INTEGRATED_IN_CASE";
  confidenceScore: number;
  tags: string[];
}

export type EvidenceLifecycleStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "VALIDATED"
  | "COMMITTED";

export interface RealtimeCaseUpdate {
  type: "CASE_UPDATED" | "EVIDENCE_COMMITTED" | "EVIDENCE_UPLOADED" | "ALERT_CREATED";
  case_id: string;
  event_type: string;
  title: string;
  message: string;
  changes: {
    new_evidence?: number;
    new_entities?: number;
    new_relationships?: number;
    new_alerts?: number;
  };
  evidence_id?: string;
  actor_name?: string;
  actor_role?: UserRole;
  timestamp: string;
}

export interface InvestigatorProfile {
  id: string;
  name: string;
  badgeNumber: string;
  role: UserRole;
  rank: string;
  department: string;
  agency?: string;
  avatarColor: string;
  status: "ACTIVE_DUTY" | "IN_FIELD" | "COURT_HEARING";
  currentActivity?: string;
  permissions: {
    canConfirmEvidence: boolean;
    canRejectEvidence: boolean;
    canSignDossier: boolean;
    canAddHypothesis: boolean;
    canIngestData: boolean;
    canExportData: boolean;
    canEditGraph: boolean;
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  officerId?: string;
  officerName?: string;
  officerRole?: UserRole;
  officerRank?: string;
  user?: string;
  userRank?: string;
  action?: string;
  actionType?:
    | "CONFIRM_ENTITY"
    | "REJECT_ENTITY"
    | "CONFIRM_RELATION"
    | "REJECT_RELATION"
    | "ADD_HYPOTHESIS"
    | "INGEST_EVIDENCE"
    | "ADD_OFFICER_NOTE"
    | "GENERATE_DOSSIER"
    | "SEAL_CASE_EXHIBIT"
    | "SWITCH_ROLE"
    | string;
  targetType?: "NODE" | "LINK" | "EXHIBIT" | "CASE" | "DOSSIER" | string;
  targetId?: string;
  objectId?: string;
  targetLabel?: string;
  details: string;
  digitalHash?: string; // SHA-256 tamper-evident digest
  ipAddress?: string;
  // Server-compatible (snake_case) mirror fields for the immutable audit ledger
  user_id?: string;
  user_name?: string;
  user_role?: string;
  digital_hash?: string;
  metadata?: Record<string, any>;
}

// Geospatial & GIS Forensic Types
export interface CellTowerSector {
  towerId: string;
  towerName: string;
  lat: number;
  lng: number;
  azimuthDeg: number; // 0 to 360 degrees
  beamWidthDeg: number; // typically 60 - 120 degrees
  radiusMeters: number; // typically 500m - 3000m
  operator: string;
  activeCallsCount: number;
  carrierFrequencies?: string;
}

export interface GeofenceZone {
  id: string;
  name: string;
  category: "RED_ALERT" | "SAFEHOUSE" | "BORDER_EXIT" | "HAWALA_HUB";
  center: { lat: number; lng: number };
  radiusMeters: number;
  polygonCoords?: Array<[number, number]>;
  activeSuspectsInside: string[];
  alertTriggered: boolean;
}

export interface SuspectTrajectoryPoint {
  id: string;
  suspectId: string;
  suspectName: string;
  timestamp: string;
  lat: number;
  lng: number;
  locationLabel: string;
  speedKmh?: number;
  activityType: "CALL" | "FINANCIAL" | "SURVEILLANCE" | "VEHICLE_ANPR";
  towerAzimuth?: number;
}

// Streaming Chunked Ingestion
export interface UploadChunkProgress {
  fileId: string;
  fileName: string;
  totalBytes: number;
  uploadedBytes: number;
  chunkIndex: number;
  totalChunks: number;
  speedMBps: number;
  progressPct: number;
  sha256Checksum: string;
  status: "IDLE" | "STREAMING" | "COMPUTING_HASH" | "EXTRACTING" | "COMPLETE" | "ERROR";
  errorMessage?: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  name: string;
  address?: string;
}

export interface SourceSnippet {
  docId: string;
  docName: string;
  page?: number;
  line?: number;
  row?: number;
  locator?: string;
  timestamp?: string;
  snippet: string;
  confidence: number;
}

export interface InvestigatorNote {
  id: string;
  targetId: string;
  author: string;
  authorRank?: string;
  text: string;
  timestamp: string;
}

export interface RelationshipEvidence {
  sourceDocumentId: string;
  sourceDocumentName: string;
  locator?: string; // e.g. "Page 4, Line 12" or "CDR Row #412"
  page?: number;
  row?: number;
  timestamp?: string;
  excerpt: string;
  confidence: number;
  basis: string;
}

export interface CrimeNetworkNode {
  id: string;
  label: string;
  type: EntityType;
  category?: InformationCategory; // EVIDENCE vs INVESTIGATOR_KNOWLEDGE vs INFERENCE vs HYPOTHESIS
  reviewState?: ReviewState; // CONFIRMED vs NEEDS_REVIEW vs REJECTED vs UNCERTAIN
  role?: string;
  aliases?: string[];
  riskScore: number; // 0 - 100
  confidence: number; // 0 - 1
  details?: {
    notes?: string;
    phone?: string;
    imei?: string;
    accountNumber?: string;
    bankName?: string;
    ifsc?: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    firNumber?: string;
    station?: string;
    address?: string;
    geo?: GeoLocation;
    firstSeen?: string;
    lastSeen?: string;
    status?: "ACTIVE" | "WANTED" | "ARRESTED" | "SURVEILLANCE" | "FLAGGED";
  };
  // Explicit SIH Blueprint Separations
  investigatorNotesList?: InvestigatorNote[];
  sourceSnippets?: SourceSnippet[];
  possibleDuplicates?: Array<{
    candidateId: string;
    candidateLabel: string;
    similarityScore: number;
    matchReason: string;
  }>;

  // Graph Analytics Metrics
  degree?: number;
  inDegree?: number;
  outDegree?: number;
  betweenness?: number;
  closeness?: number;
  pageRank?: number;
  communityId?: number;
  communityName?: string;
  isKingpinCandidate?: boolean;
  isCutVertex?: boolean; // Single point of failure/bridge
  sourceDocumentIds?: string[];

  // D3 physics coordinates
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface CrimeNetworkLink {
  id: string;
  source: string | CrimeNetworkNode;
  target: string | CrimeNetworkNode;
  relationType: RelationType;
  category?: InformationCategory; // EVIDENCE vs INFERENCE vs HYPOTHESIS
  reviewState?: ReviewState; // CONFIRMED vs NEEDS_REVIEW vs REJECTED vs UNCERTAIN
  provenance?: RelationshipProvenance;
  status?: RelationshipStatus;
  creatorId?: string;
  creatorName?: string;
  creatorRole?: UserRole;
  sourceRecordId?: string;
  caseId?: string;
  weight: number; // strength or frequency of link
  frequency?: number; // e.g. call count, transaction count
  amount?: number; // for financial transfers in INR
  durationSec?: number; // for phone calls
  timestamp?: string; // ISO date string
  details?: string;
  sourceDocumentId?: string;
  evidenceDetail?: RelationshipEvidence;
  investigatorNotesList?: InvestigatorNote[];
  flags?: Array<
    | "SUSPICIOUS_HAWALA"
    | "NIGHT_CALL"
    | "SHARED_IMEI"
    | "SMURFING_CHAIN"
    | "GEO_TOWER_MATCH"
    | "HIGH_FREQUENCY"
    | "BURST_COMMUNICATION"
  >;
}

export interface EvidenceFileRecord {
  id: string;
  fileName: string;
  fileSize: number; // in bytes (supports up to 15GB)
  fileSizeFormatted: string; // e.g. "4.2 MB" or "1.4 GB"
  fileType: "PDF" | "IMAGE_OCR" | "TEXT_DOC" | "CDR_CSV" | "FINANCIAL_CSV" | "AUDIO_LOG" | "VIDEO_CCTV" | "DOCX";
  fileHash: string; // SHA-256 checksum for legal admissibility (Sec 65B BSA)
  uploadedAt: string;
  processingStatus: "PROCESSED" | "PROCESSING" | "QUEUED" | "FAILED";
  extractedEntitiesCount: number;
  extractedRelationsCount: number;
  rawTextPreview?: string;
  summary?: string;
  sourceAuthority?: string;
  qualityWarning?: string;
}

export interface InvestigatorHypothesis {
  id: string;
  title: string;
  narrative: string;
  author: string;
  status: "ACTIVE" | "VALIDATED" | "DISPROVEN" | "SUSPENDED";
  associatedSuspectIds: string[];
  createdAt: string;
}

export interface FIRRecord {
  id: string;
  firNumber: string;
  date: string;
  policeStation: string;
  district: string;
  state: string;
  sections: string[]; // e.g. ["IPC 302", "IPC 120B", "NDPS Sec 21", "BNS Sec 111"]
  complainant: string;
  accused: string[];
  briefNarrative: string;
  status: "REGISTERED" | "CHARGESHEETED" | "UNDER_INVESTIGATION" | "CLOSED";
  extractedEntityIds?: string[];
}

export interface CDRRecord {
  id: string;
  aParty: string; // Calling Number
  bParty: string; // Called Number
  imeiA: string;
  imeiB?: string;
  timestamp: string;
  durationSec: number;
  callType: "VOICE_CALL" | "SMS" | "VOIP_SIGNAL";
  towerId: string;
  towerLocation: string;
  lat: number;
  lng: number;
}

export interface FinancialRecord {
  id: string;
  senderAcc: string;
  senderName: string;
  receiverAcc: string;
  receiverName: string;
  amount: number;
  timestamp: string;
  mode: "NEFT" | "RTGS" | "IMPS" | "UPI" | "HAWALA_CASH" | "CRYPTO";
  utrNumber: string;
  bankName?: string;
  isSmurfingFlag?: boolean;
}

export interface IntelRecord {
  id: string;
  date: string;
  sourceType: "FIELD_AGENT" | "HUMINT" | "TECHNICAL_SURVEILLANCE" | "INTERCEPT" | "INFORMANTS";
  location: string;
  lat: number;
  lng: number;
  vehiclePlate?: string;
  suspectsObserved: string[];
  description: string;
  reliabilityScore: number; // 1 to 5
  classification: IntelligenceClassification;
  compartment: IntelligenceCompartment;
  caveats: IntelligenceCaveat[];
  sourceAgency: "IB" | "RAW" | "STATE_IB" | "FIU_IND" | "NCB" | "ED" | "DRI" | "CUSTOMS" | "OTHER";
  sourceOfficer?: { id: string; pseudonym: string; clearance: IntelligenceClassification };
  sanitizedVersion?: string; // For lower-clearance users
  declassificationDate?: string;
}

export type PatternType =
  | "BURNER_SWAP"
  | "HAWALA_LAYERING"
  | "GEO_CONVERGENCE"
  | "KINGPIN_SHIELD"
  | "BURST_COMMUNICATION"
  | "MULE_CLUSTER";

export interface SuspiciousPattern {
  id: string;
  type: PatternType;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  confidence?: number;
  description: string;
  triggerExplanation: string; // Explicit explainability reason
  reviewState?: ReviewState;
  involvedNodeIds: string[];
  involvedLinkIds: string[];
  evidenceData: Record<string, any>;
  actionableLead: string;
  detectedAt: string;
}

export interface SyndicateCommunity {
  id: number;
  name: string;
  role: string;
  color: string;
  nodeIds: string[];
  keyLeaderId?: string;
}

export interface ShortestPathStep {
  fromId: string;
  fromLabel: string;
  fromType: EntityType;
  toId: string;
  toLabel: string;
  toType: EntityType;
  linkId?: string;
  relationType: string;
  summary: string;
  isFinancial?: boolean;
  isTelecom?: boolean;
}

export interface ShortestPathResult {
  path: string[];
  hops?: string[]; // Alias for backwards compatibility
  links: string[];
  totalHops: number;
  summary: string;
  steps?: ShortestPathStep[];
  trailType?: "GENERAL" | "HAWALA_FINANCIAL" | "TELECOM_CDR";
}

export interface GraphFilterState {
  searchQuery: string;
  selectedEntityTypes: EntityType[];
  selectedRelationTypes: RelationType[];
  selectedCategory: InformationCategory | "ALL";
  selectedReviewState: ReviewState | "ALL";
  minRiskScore: number;
  selectedCommunity: number | "ALL";
  onlyKingpins: boolean;
  onlySuspicious: boolean;
  timeRange: {
    start: string;
    end: string;
  };
}

export interface CourtDossier {
  caseTitle: string;
  caseNumber: string;
  generatedAt: string;
  classification: string;
  executiveSummary: string;
  keySuspects: Array<{
    id: string;
    name: string;
    role: string;
    riskScore: number;
    centralityMetric: string;
    knownAliases: string[];
    allegedActs: string;
  }>;
  subSyndicateBreakdown: Array<{
    communityName: string;
    purpose: string;
    memberCount: number;
    topLeader: string;
  }>;
  suspiciousPatternsDetected: Array<{
    patternTitle: string;
    severity: string;
    evidenceSummary: string;
    actionableLead: string;
  }>;
  actionableNextSteps: string[];
  officerDecisions?: DossierOfficerDecision[];
  digitalSignatures?: DossierDigitalSignature[];
  playbook?: DossierPlaybookStep[];
}

export interface DossierOfficerDecision {
  officerId?: string;
  officerName?: string;
  officerRank?: string;
  targetType?: string;
  targetLabel?: string;
  previousState?: string;
  newState?: string;
  note?: string;
  timestamp: string;
  digitalHash?: string;
  action?: string;
}

export interface DossierDigitalSignature {
  officerId?: string;
  officerName?: string;
  officerRank?: string;
  action?: string;
  targetType?: string;
  targetLabel?: string;
  timestamp: string;
  digitalHash?: string;
  verified?: boolean;
}

export interface DossierPlaybookStep {
  id: string;
  priority: string;
  title: string;
  description: string;
  statute: string;
  provision: string;
  authority: string;
  responsibleRole: string;
  deadlineDays: number;
  evidenceToCollect: string[];
  expectedOutcome: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

export interface CaseDataset {
  id: string;
  name: string;
  codeName: string;
  description: string;
  date: string;
  leadAgency: string;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  firs: FIRRecord[];
  cdrs: CDRRecord[];
  financials: FinancialRecord[];
  intels: IntelRecord[];
  evidenceFiles: EvidenceFileRecord[];
  hypotheses: InvestigatorHypothesis[];
  auditLogs: AuditLogEntry[];
}

export type CriminalHistoryIdentifierType =
  | "AADHAAR"
  | "PAN"
  | "FINGERPRINT_ID"
  | "NAME_DOB"
  | "POLICE_STATION_CASE";

export interface CriminalHistoryQuery {
  identifier: {
    type: CriminalHistoryIdentifierType;
    value: string;
  };
  purpose: "BAIL_VERIFICATION" | "PRIOR_CONVICTION" | "ASSOCIATE_CHECK" | "HISTORY_SHEET";
  requestingOfficer: {
    id: string;
    rank: string;
    station: string;
  };
  legalAuthority: string;
}

export interface CriminalRecordSubject {
  name: string;
  aliases: string[];
  aadhaarLast4?: string;
  pan?: string;
  dob?: string;
  gender?: string;
  address: string;
  policeStation: string;
  district: string;
  state: string;
}

export interface CriminalCase {
  firNumber: string;
  year: number;
  policeStation: string;
  sections: string[];
  role: "ACCUSED" | "CONVICTED" | "ACQUITTED" | "DISCHARGED" | "WANTED";
  status: "PENDING_TRIAL" | "CONVICTED" | "ACQUITTED" | "APPEAL_PENDING";
  convictionDate?: string;
  sentence?: string;
  courtName?: string;
  caseNumber?: string;
}

export interface CriminalAssociate {
  name: string;
  relation: string;
  firNumbers: string[];
}

export interface HistorySheet {
  openedDate: string;
  category: "A" | "B" | "C";
  remarks: string;
}

export interface CriminalRecord {
  subject: CriminalRecordSubject;
  cases: CriminalCase[];
  associates: CriminalAssociate[];
  historySheet?: HistorySheet;
}

export type WorkstationTab =
  | "overview"
  | "graph"
  | "patterns"
  | "geo"
  | "ingest"
  | "sahayak"
  | "proceedings"
  | "staging"
  | "cyber";

// ---------------------------------------------------------------------------
// PHASE 1 — Core Investigation Engine (Sec 172 / 41 / 102 / 173 CrPC)
// ---------------------------------------------------------------------------

export interface DiarySignature {
  name: string;
  rank: string;
  badgeNumber?: string;
  signedAt: string;
  hash: string;
}

export interface CaseDiaryEntry {
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
  ioSignature?: DiarySignature;
  countersign?: DiarySignature;
  prevHash?: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

export type ArrestMemoType = "ARREST" | "SEIZURE" | "ARREST_CUM_SEIZURE";
export type MemoStatute = "CRPC_41" | "CRPC_41A" | "CRPC_102" | "BNSS_35" | "BNSS_35_3" | "BNSS_185";

export interface MemoPerson {
  name: string;
  age?: number;
  gender?: string;
  address: string;
  idType?: string;
  idNumber?: string;
}

export interface SeizedArticle {
  description: string;
  quantity: string;
  value?: number;
  identificationMark?: string;
  sealed: boolean;
  sealNo?: string;
}

export interface MemoWitness {
  name: string;
  address: string;
  relation?: string;
  signed: boolean;
  signedAt?: string;
}

export interface AadhaarESign {
  signerName: string;
  signerRole: string;
  aadhaarMasked: string;
  signedAt: string;
  hash: string;
}

export interface ArrestMemo {
  _id: string;
  case_id: string;
  memoNo: string;
  memoType: ArrestMemoType;
  statute: MemoStatute;
  date: string;
  time?: string;
  place: string;
  firNumber: string;
  sections: string[];
  accused?: MemoPerson;
  groundsOfArrest?: string;
  articles: SeizedArticle[];
  witnesses: MemoWitness[];
  rightsRead: boolean;
  intimationName?: string;
  intimationRelation?: string;
  intimationPhone?: string;
  intimationAt?: string;
  ioName: string;
  ioRank: string;
  ioId: string;
  esign?: AadhaarESign;
  status: "DRAFT" | "SIGNED" | "FILED";
  hash: string;
  created_at: string;
  updated_at: string;
}

export type HistorySheetCategory = "A" | "B" | "C";

export interface HistorySheet {
  _id: string;
  case_id: string;
  sheetNo: string;
  subjectName: string;
  aliases: string[];
  dob?: string;
  address: string;
  policeStation: string;
  district: string;
  category: HistorySheetCategory;
  moCodes: string[];
  previousCases: Array<{ firNumber: string; policeStation: string; sections: string; status: string }>;
  associates: Array<{ name: string; relation: string }>;
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

export type CustodyStatus =
  | "POLICE_CUSTODY"
  | "JUDICIAL_CUSTODY"
  | "BAIL"
  | "ABSCONDING"
  | "DISCHARGED"
  | "CONVICTED";

export type BailType = "REGULAR_437" | "ANTICIPATORY_438" | "SESSIONS_439" | "DEFAULT_167_2";

export interface RemandOrder {
  id: string;
  orderDate: string;
  court: string;
  daysGranted: number;
  custodyType: "PC" | "JC";
  producedViaVC: boolean;
  orderRef?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface BailApplication {
  id: string;
  bailType: BailType;
  filedDate: string;
  court: string;
  status: "PENDING" | "GRANTED" | "REJECTED" | "WITHDRAWN";
  decidedDate?: string;
  conditions?: string;
  suretyAmount?: number;
  decidedBy?: string;
}

export interface CustodyRecord {
  _id: string;
  case_id: string;
  accusedName: string;
  firNumber: string;
  sections: string[];
  arrestDate: string;
  arrestMemoId?: string;
  offencePunishmentYears: number;
  remands: RemandOrder[];
  bailApplications: BailApplication[];
  status: CustodyStatus;
  recordedBy: string;
  recordedByRank: string;
  policeCustodyUsedDays: number;
  chargeSheetDueDate?: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface CustodyAlert {
  recordId: string;
  accusedName: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  kind:
    | "PC_EXPIRY"
    | "PC_EXHAUSTED"
    | "REMAND_EXPIRY"
    | "CHARGESHEET_DUE"
    | "DEFAULT_BAIL_ELIGIBLE"
    | "DEFAULT_BAIL_OVERDUE"
    | "BAIL_PENDING";
  message: string;
  dueDate?: string;
  daysLeft?: number;
}

export interface ChargeSheetAnnexure {
  id: string;
  letter: string;
  title: string;
  docType: string;
  pages?: number;
  hash?: string;
  exhibitRef?: string;
  filedBy: string;
  filedAt: string;
}

export interface ChargeSheet {
  _id: string;
  case_id: string;
  csNo: string;
  firNumber: string;
  policeStation: string;
  district: string;
  state: string;
  sections: string[];
  accused: Array<{ name: string; address?: string; custodyStatus: string; chargeFramed?: string }>;
  witnesses: Array<{ name: string; type: string; address?: string; statement?: string }>;
  exhibits: string[];
  factsOfCase: string;
  evidenceSummary: string;
  legalOpinion: string;
  assistMeta?: { provider: string; llmUsed: boolean; citations: string[] };
  annexures: ChargeSheetAnnexure[];
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

// ---------------------------------------------------------------------------
// PHASE 2 — Ingestion + Approval Pipeline (Staging · Innocent Pool · Transfer)
// ---------------------------------------------------------------------------

export type CaseAccess = "FULL_EDIT" | "VIEW_ONLY";

export type IngestionSource =
  | "FIR"
  | "CDR_CSV"
  | "FINANCIAL_CSV"
  | "OSINT_URL"
  | "INTEL_REPORT"
  | "CYBER_LOG";

export type StagingStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IngestionBatch {
  _id: string;
  case_id: string;
  source: IngestionSource;
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
}

export interface StagedEntity {
  _id: string;
  case_id: string;
  batchId: string;
  source: IngestionSource;
  label: string;
  type: string;
  role?: string;
  riskScore: number;
  confidence: number;
  details?: any;
  evidenceRef?: string;
  locator?: string;
  status: StagingStatus;
  submittedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  duplicateOf?: string;
  created_at: string;
}

export interface StagedLink {
  _id: string;
  case_id: string;
  batchId: string;
  source: IngestionSource;
  sourceLabel: string;
  targetLabel: string;
  relationType: string;
  weight: number;
  frequency?: number;
  amount?: number;
  details?: string;
  evidenceRef?: string;
  locator?: string;
  status: StagingStatus;
  submittedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  created_at: string;
}

export interface InnocentPoolItem {
  _id: string;
  case_id: string;
  kind: "ENTITY" | "LINK";
  label: string;
  snapshot: any;
  rejectionReason: string;
  rejectedBy: string;
  rejectedAt: string;
  source: IngestionSource;
  batchId?: string;
  readded: boolean;
}

export interface DeptTransfer {
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
}

// ---------------------------------------------------------------------------
// PHASE 5 — Cyber Crime + AI Models (NCRP · CERT-In · Sec 69 · CEIR · Mesh)
// ---------------------------------------------------------------------------

export type CyberIncidentKind =
  | "NCRP_REFERRAL"
  | "CERT_INCIDENT"
  | "SEC69_INTERCEPT"
  | "CRYPTO_TRAIL"
  | "IMEI_CEIR";

export interface CyberIncident {
  _id: string;
  case_id: string;
  refNo: string;
  kind: CyberIncidentKind;
  title: string;
  description: string;
  ncrpAck?: string;
  ncrpCategory?: string;
  amountInvolved?: number;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  detectedAt?: string;
  reportedAt?: string;
  reportDueAt?: string;
  affectedSystems?: string;
  iocs?: string[];
  contactName?: string;
  contactPhone?: string;
  orderNo?: string;
  issuingAuthority?: string;
  targetIdentifier?: string;
  serviceProvider?: string;
  periodDays?: number;
  reviewDueAt?: string;
  imei?: string;
  ceirAction?: "BLOCK" | "UNBLOCK" | "TRACK";
  ownerName?: string;
  firRef?: string;
  trailResult?: CryptoTrailResult;
  status: string;
  recordedBy: string;
  recordedByRank: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface CryptoTrailHop {
  hop: number;
  fromLabel: string;
  toLabel: string;
  amount?: number;
  frequency?: number;
  details?: string;
}

export interface CryptoTrailResult {
  startLabel: string;
  direction: string;
  maxHops: number;
  hops: CryptoTrailHop[];
  nodesVisited: number;
  totalIn: number;
  totalOut: number;
  computedAt: string;
}

export interface MeshPeer {
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

export interface ICCTNSAdapter {
  queryHistory(query: CriminalHistoryQuery): Promise<CriminalRecord>;
  getCaseDetails(firNumber: string, state: string): Promise<{
    firNumber: string;
    date: string;
    policeStation: string;
    district: string;
    state: string;
    sections: string[];
    complainant: string;
    accused: string[];
    briefNarrative: string;
    status: string;
  }>;
  searchByBiometric(fingerprintId: string): Promise<CriminalRecord | null>;
}
