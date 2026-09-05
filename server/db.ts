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

export interface DBUser {
  _id: string;
  name: string;
  official_id: string;
  email: string;
  password_hash: string;
  agency: string;
  designation: string;
  department: string;
  role: "ADMIN" | "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR" | "INSPECTOR";
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
  requested_role: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR";
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
  user_role: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR";
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
  role: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR" | "INSPECTOR" | "ADMIN";
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
}

const memoryDb = new InMemoryDatabase();

export async function initDatabase(): Promise<{ isMongo: boolean }> {
  console.log("[DATABASE] Initializing high-performance integrated memory security vault store.");
  // Seed default demo accounts & cases
  await seedInitialData();
  return { isMongo: false };
}

async function seedInitialData() {
  const salt = await bcrypt.genSalt(10);
  const adminPass = await bcrypt.hash("Admin@123", salt);
  const leadPass = await bcrypt.hash("Lead@123", salt);
  const forensicPass = await bcrypt.hash("Forensic@123", salt);
  const investigatorPass = await bcrypt.hash("Officer@123", salt);
  const pendingPass = await bcrypt.hash("Officer@123", salt);

  const demoUsers: DBUser[] = [
    {
      _id: "user-admin-01",
      name: "Director General Rajeshwar Varma",
      official_id: "NCRB-ADM-001",
      email: "admin@ncrb.gov.in",
      password_hash: adminPass,
      agency: "National Crime Records Bureau (NCRB)",
      designation: "Director General / System Admin",
      department: "Access Governance & Intelligence Security Directorate",
      role: "ADMIN",
      status: "ACTIVE",
      created_at: "2026-08-01T08:00:00.000Z",
      approved_by: "SYSTEM_ROOT",
      approved_at: "2026-08-01T08:00:00.000Z",
      avatarColor: "#6366f1",
    },
    {
      _id: "user-lead-01",
      name: "Vikramaditya Rathore, IPS",
      official_id: "NCB-SIT-774",
      email: "rathore@ncb.gov.in",
      password_hash: leadPass,
      agency: "Narcotics Control Bureau (NCB)",
      designation: "Superintendent of Police (Lead IO)",
      department: "Special Task Force & Organized Crime Wing",
      role: "LEAD_INVESTIGATOR",
      status: "ACTIVE",
      created_at: "2026-08-05T09:30:00.000Z",
      approved_by: "user-admin-01",
      approved_at: "2026-08-05T10:00:00.000Z",
      avatarColor: "#f59e0b",
    },
    {
      _id: "user-forensic-01",
      name: "Inspector Sameer Deshmukh",
      official_id: "DFS-CYBER-881",
      email: "deshmukh@forensics.gov.in",
      password_hash: forensicPass,
      agency: "Directorate of Forensic Science",
      designation: "Forensic Technology Lead",
      department: "State Cyber Cell & Telecom Interception Lab",
      role: "FORENSIC_INVESTIGATOR",
      status: "ACTIVE",
      created_at: "2026-08-07T11:15:00.000Z",
      approved_by: "user-admin-01",
      approved_at: "2026-08-07T12:00:00.000Z",
      avatarColor: "#10b981",
    },
    {
      _id: "user-investigator-01",
      name: "Inspector Devendra Patil",
      official_id: "DP-FIELD-502",
      email: "patil@police.gov.in",
      password_hash: investigatorPass,
      agency: "Crime Branch CID / Field Interdiction Squad",
      designation: "Field Inspector / Sighting Lead",
      department: "Anti-Narcotics & Surveillance Squad",
      role: "INVESTIGATOR",
      status: "ACTIVE",
      created_at: "2026-08-09T08:00:00.000Z",
      approved_by: "user-admin-01",
      approved_at: "2026-08-09T09:00:00.000Z",
      avatarColor: "#3b82f6",
    },
    {
      _id: "user-pending-01",
      name: "Inspector Pooja Sharma",
      official_id: "DP-CRIME-992",
      email: "sharma@police.gov.in",
      password_hash: pendingPass,
      agency: "Delhi Police Special Cell",
      designation: "Cyber Forensics Examiner",
      department: "Digital Evidence Analysis Unit",
      role: "FORENSIC_INVESTIGATOR",
      status: "PENDING",
      created_at: "2026-08-31T14:20:00.000Z",
      avatarColor: "#ec4899",
    },
  ];

  for (const u of demoUsers) {
    memoryDb.users.set(u._id, u);
  }

  // Access Requests seed
  const demoRequests: DBAccessRequest[] = [
    {
      _id: "req-001",
      full_name: "Inspector Pooja Sharma",
      official_id: "DP-CRIME-992",
      official_email: "sharma@police.gov.in",
      agency: "Delhi Police Special Cell",
      designation: "Cyber Forensics Examiner",
      department: "Digital Evidence Analysis Unit",
      requested_role: "FORENSIC_INVESTIGATOR",
      reason_for_access: "Assigned to telecom cell tower triangulation and CDR analysis for northern syndicate links.",
      status: "PENDING",
      submitted_at: "2026-08-31T14:20:00.000Z",
    },
    {
      _id: "req-002",
      full_name: "Deputy SP Arvind Kulkarni",
      official_id: "MUM-ATS-441",
      official_email: "kulkarni@ats.gov.in",
      agency: "Anti-Terrorism Squad (ATS)",
      designation: "Deputy Superintendent of Police",
      department: "Counter-Hawala Intelligence Unit",
      requested_role: "LEAD_INVESTIGATOR",
      reason_for_access: "Leading cross-jurisdiction interdiction on Hawala networks operating out of Surat and Dubai.",
      status: "PENDING",
      submitted_at: "2026-09-01T08:15:00.000Z",
    },
  ];

  for (const r of demoRequests) {
    memoryDb.access_requests.set(r._id, r);
  }

  // Cases seed
  for (const c of CASE_DATASETS) {
    memoryDb.cases.set(c.id, {
      _id: c.id,
      id: c.id,
      name: c.name,
      codeName: c.codeName,
      description: c.description,
      date: c.date,
      leadAgency: c.leadAgency,
      created_at: "2026-08-14T09:00:00.000Z",
    });
  }

  // Case Membership seed: Operation Garuda, ShadowVault, and Interstate
  const initialMembers: DBCaseMember[] = [
    {
      _id: "mem-001",
      case_id: "case-garuda",
      user_id: "user-lead-01",
      user_name: "Vikramaditya Rathore, IPS",
      user_email: "rathore@ncb.gov.in",
      official_id: "NCB-SIT-774",
      agency: "Narcotics Control Bureau (NCB)",
      role: "LEAD_INVESTIGATOR",
      status: "ACTIVE",
      assigned_at: "2026-08-14T09:00:00.000Z",
      assigned_by: "user-admin-01",
    },
    {
      _id: "mem-002",
      case_id: "case-garuda",
      user_id: "user-forensic-01",
      user_name: "Inspector Sameer Deshmukh",
      user_email: "deshmukh@forensics.gov.in",
      official_id: "DFS-CYBER-881",
      agency: "Directorate of Forensic Science",
      role: "FORENSIC_INVESTIGATOR",
      status: "ACTIVE",
      assigned_at: "2026-08-14T09:15:00.000Z",
      assigned_by: "user-admin-01",
    },
    {
      _id: "mem-003",
      case_id: "case-garuda",
      user_id: "user-investigator-01",
      user_name: "Inspector Devendra Patil",
      user_email: "patil@police.gov.in",
      official_id: "DP-FIELD-502",
      agency: "Crime Branch CID / Field Interdiction Squad",
      role: "INVESTIGATOR",
      status: "ACTIVE",
      assigned_at: "2026-08-14T09:20:00.000Z",
      assigned_by: "user-admin-01",
    },
    {
      _id: "mem-004",
      case_id: "case-shadowvault",
      user_id: "user-lead-01",
      user_name: "Vikramaditya Rathore, IPS",
      user_email: "rathore@ncb.gov.in",
      official_id: "NCB-SIT-774",
      agency: "Narcotics Control Bureau (NCB)",
      role: "LEAD_INVESTIGATOR",
      status: "ACTIVE",
      assigned_at: "2026-08-16T11:00:00.000Z",
      assigned_by: "user-admin-01",
    },
  ];

  for (const m of initialMembers) {
    memoryDb.case_members.set(m._id, m);
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
      officer_id: "user-investigator-01",
      officer_name: "Inspector Devendra Patil",
      officer_role: "INVESTIGATOR",
      officer_badge: "DP-FIELD-502",
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
    memoryDb.observations.set(obs._id, obs);
  }

  for (const m of initialMembers) {
    memoryDb.case_members.set(m._id, m);
  }

  // Seed sample Case Access Request
  const demoCaseRequests: DBCaseAccessRequest[] = [
    {
      _id: "case_req-001",
      case_id: "case-shadowvault",
      case_name: "Operation ShadowVault: Darknet Cyber Extortion & USDT Wash",
      case_code: "OP-SHADOWVAULT-2026",
      user_id: "user-forensic-01",
      user_name: "Inspector Sameer Deshmukh",
      user_email: "deshmukh@forensics.gov.in",
      official_id: "DFS-CYBER-881",
      agency: "Directorate of Forensic Science",
      user_role: "FORENSIC_INVESTIGATOR",
      reason_for_access: "Assigned to analyze cryptocurrency transaction flows and USDT tumbler ledgers for cyber forensics.",
      status: "PENDING",
      requested_at: "2026-09-01T10:30:00.000Z",
    },
  ];

  for (const cr of demoCaseRequests) {
    memoryDb.case_access_requests.set(cr._id, cr);
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
    memoryDb.evidence.set(ev._id, ev);
  }

  // Seed Entities for Operation Garuda
  for (const node of GARUDA_SYNDICATE_NODES) {
    const ent: DBEntity = {
      _id: `ent-garuda-${node.id}`,
      case_id: "case-garuda",
      ...node,
      evidence_ids: node.sourceDocumentIds || ["EVID-001"],
    };
    memoryDb.entities.set(ent._id, ent);
  }

  // Seed Relationships for Operation Garuda with Provenance
  for (const link of GARUDA_SYNDICATE_LINKS) {
    const src = typeof link.source === "object" ? (link.source as any).id : link.source;
    const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
    const rel: DBRelationship = {
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
    memoryDb.relationships.set(rel._id, rel);
  }

  // Seed ShadowVault Entities & Links
  for (const node of SHADOWVAULT_NODES) {
    const ent: DBEntity = {
      _id: `ent-shadow-${node.id}`,
      case_id: "case-shadowvault",
      ...node,
      evidence_ids: ["EVID-SV-01"],
    };
    memoryDb.entities.set(ent._id, ent);
  }

  for (const link of SHADOWVAULT_LINKS) {
    const src = typeof link.source === "object" ? (link.source as any).id : link.source;
    const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
    const rel: DBRelationship = {
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
    memoryDb.relationships.set(rel._id, rel);
  }

  // Seed FIR, CDR, Financials, Intel
  for (const item of GARUDA_FIRS) memoryDb.firs.set(`fir-garuda-${item.id}`, { case_id: "case-garuda", ...item });
  for (const item of GARUDA_CDRS) memoryDb.cdrs.set(`cdr-garuda-${item.id}`, { case_id: "case-garuda", ...item });
  for (const item of GARUDA_FINANCIALS) memoryDb.financials.set(`fin-garuda-${item.id}`, { case_id: "case-garuda", ...item });
  for (const item of GARUDA_INTEL) memoryDb.intels.set(`intel-garuda-${item.id}`, { case_id: "case-garuda", ...item });

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
    memoryDb.audit_logs.set(al._id, al);
  }
}

// Data Access Object / Collections Helper
export const db = {
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
  },
};
