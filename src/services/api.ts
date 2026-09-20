import { UserAccount, AccessRequest, CaseMember, RealtimeCaseUpdate } from "../types";
import { apiUrl, caseWsUrl } from "./apiBase";

const TOKEN_KEY = "crim_intel_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const vpnSession = (() => {
    try {
      return sessionStorage.getItem("crim_intel_vpn");
    } catch {
      return null;
    }
  })();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (vpnSession) {
    headers["X-VPN-Session"] = vpnSession;
  }

  // Split-deploy: relative "/api/..." stays same-origin; with VITE_API_URL
  // set (Vercel → Render) this prefixes the Render backend origin.
  const url = endpoint.startsWith("/api/") ? apiUrl(endpoint) : endpoint;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.message || data.error || `HTTP error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const authApi = {
  getDemoUsers: async () => {
    return request<{ users: UserAccount[] }>("/api/auth/demo-users");
  },

  login: async (identifier: string, password: string, otp?: string) => {
    const res = await request<{
      token: string;
      user: UserAccount;
      authorized_cases: any[];
      mustChangePassword?: boolean;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password, otp }),
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  /** Blocked-screen poll — no password needed, identifier only. */
  accountStatus: async (identifier: string) => {
    return request<{
      status: string;
      blocked?: boolean;
      unblocked?: boolean;
      name?: string;
      tempPassword?: string;
      mustChangePassword?: boolean;
      message?: string;
    }>("/api/auth/account-status", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    });
  },

  /** First-login rotation after admin unblock (temp-password session). */
  changePassword: async (newPassword: string) => {
    return request<{ success: boolean; message: string }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
  },

  requestAccess: async (formData: {
    full_name: string;
    official_id: string;
    official_email: string;
    agency: string;
    designation?: string;
    department: string;
    requested_role: string;
    state?: string;
    reason_for_access: string;
    password?: string;
  }) => {
    return request<{ success: boolean; message: string; request_id: string }>("/api/auth/request-access", {
      method: "POST",
      body: JSON.stringify(formData),
    });
  },

  getMe: async () => {
    return request<{ user: UserAccount; authorized_cases: any[] }>("/api/auth/me");
  },

  // Phase 3 Req15/17 — same-tenure directory for Lead staffing workflows.
  getTenureUsers: async () => {
    return request<{ users: UserAccount[]; tenure: string }>("/api/auth/tenure-users");
  },

  logout: async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } finally {
      removeStoredToken();
    }
  },
};

export const adminApi = {
  getDashboard: async () => {
    return request<{
      metrics: {
        totalUsers: number;
        activeUsers: number;
        pendingRequests: number;
        suspendedUsers: number;
        activeCases: number;
        auditLogCount: number;
      };
      recentRequests: AccessRequest[];
      recentAudits: any[];
    }>("/api/admin/dashboard");
  },

  getAccessRequests: async () => {
    return request<{ requests: AccessRequest[] }>("/api/admin/access-requests");
  },

  getCaseAccessRequests: async () => {
    return request<{ requests: any[] }>("/api/admin/case-access-requests");
  },

  approveCaseAccessRequest: async (id: string, notes?: string, orderRef?: string) => {
    return request<{ success: boolean; message: string; member: CaseMember }>(`/api/admin/case-access-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes, orderRef }),
    });
  },

  rejectCaseAccessRequest: async (id: string, notes?: string) => {
    return request<{ success: boolean; message: string }>(`/api/admin/case-access-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  approveRequest: async (id: string, notes?: string, defaultCaseId?: string, assignedRole?: string) => {
    return request<{ success: boolean; message: string }>(`/api/admin/access-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes, defaultCaseId, assignedRole }),
    });
  },

  rejectRequest: async (id: string, notes?: string) => {
    return request<{ success: boolean; message: string }>(`/api/admin/access-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  getUsers: async () => {
    return request<{ users: UserAccount[] }>("/api/admin/users");
  },

  updateUserStatus: async (id: string, status: "ACTIVE" | "SUSPENDED" | "REJECTED") => {
    return request<{ success: boolean; message: string; tempPassword?: string; mustChangePassword?: boolean }>(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  // Direct officer onboarding (auto email/ID, admin-set password, no justification).
  addOfficer: async (payload: {
    full_name: string;
    branch?: string;
    division?: string;
    designation?: string;
    department?: string;
    requested_role: string;
    state?: string;
    password: string;
  }) => {
    return request<{ success: boolean; user: any }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getCases: async () => {
    return request<{ cases: any[] }>("/api/admin/cases");
  },

  getCaseMembers: async (caseId: string) => {
    return request<{ members: CaseMember[] }>(`/api/admin/cases/${caseId}/members`);
  },

  assignCaseMember: async (caseId: string, userId: string, orderRef?: string) => {
    return request<{ success: boolean; member: CaseMember; crossPosted?: boolean }>(`/api/admin/cases/${caseId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId, orderRef }),
    });
  },

  removeCaseMember: async (caseId: string, userId: string) => {
    return request<{ success: boolean; message: string }>(`/api/admin/cases/${caseId}/members/${userId}`, {
      method: "DELETE",
    });
  },

  getAuditLogs: async () => {
    return request<{ logs: any[] }>("/api/admin/audit-logs");
  },

  // Phase 3 Req17 — dept-scoped requisition queue.
  getRequisitions: async () => {
    return request<{ requisitions: any[] }>("/api/admin/requisitions");
  },

  decideRequisition: async (id: string, approve: boolean, notes?: string, assigneeId?: string) => {
    return request<{ success: boolean; assigned?: string }>(`/api/admin/requisitions/${id}/${approve ? "approve" : "reject"}`, {
      method: "POST",
      body: JSON.stringify({ notes, assigneeId }),
    });
  },

  // Phase 6 Req27 — cross-tenure admin directory for handover targeting.
  getAdmins: async () => {
    return request<{ admins: any[] }>("/api/admin/admins");
  },

  // Admin case deletion (cascade)
  deleteCase: async (caseId: string, reason: string) => {
    return request<{ success: boolean; message: string }>(`/api/admin/cases/${caseId}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: true, reason }),
    });
  },
};

export const caseApi = {
  getCases: async () => {
    return request<{ cases: any[] }>("/api/cases");
  },

  getAvailableCases: async () => {
    return request<{
      cases: Array<{
        id: string;
        name: string;
        codeName: string;
        description: string;
        date: string;
        leadAgency: string;
        memberCount: number;
        evidenceCount: number;
        hasAccess: boolean;
        userRoleInCase: string | null;
        hasPendingRequest: boolean;
        pendingRequestId: string | null;
        pendingRequestDate: string | null;
      }>;
    }>("/api/cases/available");
  },

  getMyAccessRequests: async () => {
    return request<{ requests: any[] }>("/api/cases/my-access-requests");
  },

  requestCaseAccess: async (caseId: string, reason_for_access: string) => {
    return request<{ success: boolean; message: string; request: any }>(`/api/cases/${caseId}/request-access`, {
      method: "POST",
      body: JSON.stringify({ reason_for_access }),
    });
  },

  getCaseMembers: async (caseId: string) => {
    return request<{ members: CaseMember[] }>(`/api/cases/${caseId}/members`);
  },

  // Phase 6 Req26 — cross-state bridge: flag + inbox.
  shareEvidence: async (caseId: string, evidenceId: string, states: string[]) => {
    return request<{ success: boolean; sharedTo: string[] }>(`/api/cases/${caseId}/evidence/${evidenceId}/share`, {
      method: "POST",
      body: JSON.stringify({ states }),
    });
  },

  getSharedInbox: async () => {
    return request<{ evidence: any[] }>("/api/cases/shared/inbox");
  },

  // Phase 8 Req32 — full-case archive import (ADMIN-only).
  importArchive: async (payload: {
    caseMetadata: any;
    graphData: { nodes: any[]; links: any[] };
    evidenceRecords: { firs: any[]; cdrs: any[]; financials: any[]; intels: any[]; evidenceFiles?: any[] };
    auditLogs?: any[];
    version?: string;
  }) => {
    return request<{ success: boolean; case: any; imported: Record<string, number> }>("/api/cases/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 3 Req16 — ADMIN-only case instantiation (no templates).
  createCase: async (payload: {
    name: string;
    codeName: string;
    description?: string;
    leadUserId?: string;
    leadAgency?: string;
  }) => {
    return request<{ success: boolean; case: any; leadMember: any }>("/api/cases", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 3 Req15 — Lead team-add (same tenure, from command overview).
  leadAddMember: async (caseId: string, userId: string) => {
    return request<{ success: boolean; member: CaseMember }>(`/api/cases/${caseId}/members/lead-add`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  // Phase 3 Req16 — POC nomination (field/forensic/cyber user ids).
  updatePocs: async (caseId: string, pocs: { field?: string; forensic?: string; cyber?: string }) => {
    return request<{ success: boolean; pocs: Record<string, string> }>(`/api/cases/${caseId}/pocs`, {
      method: "PATCH",
      body: JSON.stringify(pocs),
    });
  },

  // Phase 3 Req17 — requisition workflow.
  createRequisition: async (
    caseId: string,
    payload: { functional: string; count: number; justification: string }
  ) => {
    return request<{ success: boolean; requisition: any }>(`/api/cases/${caseId}/requisitions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getRequisitions: async (caseId: string) => {
    return request<{ requisitions: any[] }>(`/api/cases/${caseId}/requisitions`);
  },

  // Phase 4 Req22 — data requisitions Lead → personnel.
  createDataRequest: async (
    caseId: string,
    payload: { targetFunctional: string; title: string; details: string; deadline?: string }
  ) => {
    return request<{ success: boolean; requisition: any }>(`/api/cases/${caseId}/data-requests`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getDataRequests: async (caseId: string) => {
    return request<{ requisitions: any[] }>(`/api/cases/${caseId}/data-requests`);
  },

  // Lead triage of raw exhibits (approve → extract + stage; reject → drop).
  triageEvidence: async (caseId: string, evidenceId: string, decision: "APPROVE" | "REJECT", note?: string) => {
    return request<{ success: boolean; status: string; batchId?: string }>(`/api/cases/${caseId}/evidence/${evidenceId}/triage`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
  },

  fulfillDataRequest: async (caseId: string, reqId: string, notes?: string) => {
    return request<{ success: boolean }>(`/api/cases/${caseId}/data-requests/${reqId}/fulfill`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  // Judicial Dossier Studio — Sign & Certify (65B/63).
  getDossierSignatures: async (caseId: string) => {
    return request<{ signatures: any[] }>(`/api/cases/${caseId}/dossier/signatures`);
  },

  signDossier: async (caseId: string, payload: { regNumber: string; court?: string; venue?: string }) => {
    return request<{ success: boolean; signature: any }>(`/api/cases/${caseId}/dossier/signatures`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  decideRequisition: async (caseId: string, reqId: string, approve: boolean, notes?: string, assigneeId?: string) => {
    return request<{ success: boolean; assigned?: string }>(`/api/cases/${caseId}/requisitions/${reqId}/${approve ? "approve" : "reject"}`, {
      method: "POST",
      body: JSON.stringify({ notes, assigneeId }),
    });
  },

  // Lead removes same-tenure personnel from the case.
  leadRemoveMember: async (caseId: string, userId: string) => {
    return request<{ success: boolean }>(`/api/cases/${caseId}/members/lead-remove`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  getCaseState: async (caseId: string) => {
    return request<{
      case: any;
      nodes: any[];
      links: any[];
      evidenceFiles: any[];
      members: CaseMember[];
      auditLogs: any[];
      events: any[];
      firs: any[];
      cdrs: any[];
      financials: any[];
      intels: any[];
      observations?: any[];
    }>(`/api/cases/${caseId}/state`);
  },

  uploadEvidence: async (caseId: string, payload: {
    fileName: string;
    fileType: string;
    fileSize?: number;
    fileSizeFormatted?: string;
    sourceAuthority?: string;
    rawText?: string;
    summary?: string;
  }) => {
    return request<{ success: boolean; evidence: any }>(`/api/cases/${caseId}/evidence`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  processEvidence: async (caseId: string, evidenceId: string, payload: { rawText?: string; fileType?: string } = {}) => {
    return request<{
      success: boolean;
      evidence: any;
      candidateNodes: any[];
      candidateLinks: any[];
    }>(`/api/cases/${caseId}/evidence/${evidenceId}/process`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  commitEvidence: async (caseId: string, evidenceId: string, payload: { entities?: any[]; relationships?: any[] } = {}) => {
    return request<{
      success: boolean;
      message: string;
      evidence: any;
      committedEntitiesCount: number;
      committedRelationsCount: number;
      stagedBatchId?: string;
    }>(`/api/cases/${caseId}/evidence/${evidenceId}/commit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  addNode: async (caseId: string, node: any) => {
    return request<{ success: boolean; node: any }>(`/api/cases/${caseId}/nodes`, {
      method: "POST",
      body: JSON.stringify(node),
    });
  },

  addLink: async (caseId: string, link: any) => {
    return request<{ success: boolean; link: any }>(`/api/cases/${caseId}/links`, {
      method: "POST",
      body: JSON.stringify(link),
    });
  },

  getAuditLogs: async (caseId: string) => {
    return request<{ logs: any[] }>(`/api/cases/${caseId}/audit-logs`);
  },

  queryCopilot: async (caseId: string, question: string, context?: any) => {
    return request<{
      answer: string;
      citations: string[];
      confidenceScore: number;
      recommendedActions: string[];
      queriedAt: string;
      officer: string;
    }>(`/api/cases/${caseId}/query`, {
      method: "POST",
      body: JSON.stringify({ question, context }),
    });
  },
};

// Phase 1 — Core Investigation Engine (Sec 172 / 41 / 102 / 173)
export const proceedingsApi = {
  // Case diary
  getDiary: async (caseId: string) => {
    return request<{ entries: any[] }>(`/api/cases/${caseId}/diary`);
  },
  createDiaryEntry: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; entry: any }>(`/api/cases/${caseId}/diary`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  signDiary: async (caseId: string, entryId: string) => {
    return request<{ success: boolean; entry: any }>(`/api/cases/${caseId}/diary/${entryId}/sign`, {
      method: "POST",
    });
  },
  countersignDiary: async (caseId: string, entryId: string) => {
    return request<{ success: boolean; entry: any }>(`/api/cases/${caseId}/diary/${entryId}/countersign`, {
      method: "POST",
    });
  },

  // Arrest / seizure memos
  getMemos: async (caseId: string) => {
    return request<{ memos: any[] }>(`/api/cases/${caseId}/arrest-memos`);
  },
  createMemo: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; memo: any }>(`/api/cases/${caseId}/arrest-memos`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateMemo: async (caseId: string, memoId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; memo: any }>(`/api/cases/${caseId}/arrest-memos/${memoId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  // History sheets
  getHistorySheets: async (caseId: string) => {
    return request<{ sheets: any[] }>(`/api/cases/${caseId}/history-sheets`);
  },
  createHistorySheet: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; sheet: any }>(`/api/cases/${caseId}/history-sheets`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateHistorySheet: async (caseId: string, sheetId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; sheet: any }>(`/api/cases/${caseId}/history-sheets/${sheetId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  // Custody tracker
  getCustody: async (caseId: string) => {
    return request<{ records: any[] }>(`/api/cases/${caseId}/custody`);
  },
  getCustodyAlerts: async (caseId: string) => {
    return request<{ alerts: any[]; generatedAt: string }>(`/api/cases/${caseId}/custody/alerts`);
  },
  registerCustody: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; record: any }>(`/api/cases/${caseId}/custody`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  addRemand: async (caseId: string, recordId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; record: any }>(`/api/cases/${caseId}/custody/${recordId}/remand`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  fileBail: async (caseId: string, recordId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; record: any }>(`/api/cases/${caseId}/custody/${recordId}/bail`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateCustodyStatus: async (caseId: string, recordId: string, status: string) => {
    return request<{ success: boolean; record: any }>(`/api/cases/${caseId}/custody/${recordId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  // Charge sheets
  getChargeSheets: async (caseId: string) => {
    return request<{ chargeSheets: any[] }>(`/api/cases/${caseId}/charge-sheets`);
  },
  createChargeSheet: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; chargeSheet: any }>(`/api/cases/${caseId}/charge-sheets`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  draftChargeSheet: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; chargeSheet: any }>(`/api/cases/${caseId}/charge-sheets/draft`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateChargeSheet: async (caseId: string, csId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; chargeSheet: any }>(`/api/cases/${caseId}/charge-sheets/${csId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  addAnnexure: async (caseId: string, csId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; annexure: any; chargeSheet: any }>(
      `/api/cases/${caseId}/charge-sheets/${csId}/annexures`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },
  removeAnnexure: async (caseId: string, csId: string, annexId: string) => {
    return request<{ success: boolean; chargeSheet: any }>(
      `/api/cases/${caseId}/charge-sheets/${csId}/annexures/${annexId}`,
      { method: "DELETE" }
    );
  },
};

// Phase 2 — Ingestion + Approval Pipeline + Inter-department transfer
export const stagingApi = {
  ingest: async (caseId: string, payload: { source: string; content?: string; fileName?: string; url?: string }) => {
    return request<{ success: boolean; batchId: string; entityCount: number; linkCount: number; truncated: boolean; note: string }>(
      `/api/cases/${caseId}/ingest`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  getQueue: async (caseId: string, filters: { status?: string; source?: string; batchId?: string } = {}) => {
    const q = new URLSearchParams(filters as Record<string, string>).toString();
    return request<{ entities: any[]; links: any[]; batches: any[] }>(
      `/api/cases/${caseId}/staging${q ? `?${q}` : ""}`
    );
  },

  reviewEntity: async (caseId: string, stagedId: string, decision: "APPROVE" | "REJECT", note?: string) => {
    return request<{ success: boolean; mainId?: string; merged?: boolean; poolId?: string }>(
      `/api/cases/${caseId}/staging/entities/${stagedId}/review`,
      { method: "POST", body: JSON.stringify({ decision, note }) }
    );
  },

  reviewLink: async (caseId: string, stagedId: string, decision: "APPROVE" | "REJECT", note?: string) => {
    return request<{ success: boolean; linkId?: string; poolId?: string }>(
      `/api/cases/${caseId}/staging/links/${stagedId}/review`,
      { method: "POST", body: JSON.stringify({ decision, note }) }
    );
  },

  reviewBatch: async (caseId: string, batchId: string, decision: "APPROVE" | "REJECT", note?: string) => {
    return request<{ success: boolean; approved: number; rejected: number; skipped: string[] }>(
      `/api/cases/${caseId}/staging/batch/${batchId}/review`,
      { method: "POST", body: JSON.stringify({ decision, note }) }
    );
  },

  getInnocentPool: async (caseId: string, q?: string) => {
    return request<{ items: any[] }>(`/api/cases/${caseId}/innocent-pool${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  },

  readdFromPool: async (caseId: string, poolId: string) => {
    return request<{ success: boolean; batchId: string }>(`/api/cases/${caseId}/innocent-pool/${poolId}/readd`, {
      method: "POST",
    });
  },

  getTransfers: async (caseId: string) => {
    return request<{ transfers: any[] }>(`/api/cases/${caseId}/transfers`);
  },

  proposeTransfer: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; transfer: any }>(`/api/cases/${caseId}/transfers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  decideTransfer: async (caseId: string, transferId: string, decision: "accept" | "reject", note?: string) => {
    return request<{ success: boolean; transfer: any }>(`/api/cases/${caseId}/transfers/${transferId}/${decision}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },

  getMyAccess: async (caseId: string) => {
    return request<{ role: string; access: "FULL_EDIT" | "VIEW_ONLY" }>(`/api/cases/${caseId}/my-access`);
  },
};

// State-to-state collaboration (admin → admin, leads attached).
export const collabApi = {
  outbox: async () => {
    return request<{ requests: any[] }>("/api/collab/requests/outbox");
  },
  inbox: async () => {
    return request<{ requests: any[] }>("/api/collab/requests/inbox");
  },
  request: async (payload: { caseId: string; toState: string; message?: string }) => {
    return request<{ success: boolean; request: any }>("/api/collab/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  approve: async (id: string, leadId: string, notes?: string) => {
    return request<{ success: boolean; attachedLead: string; exhibitsShared: number }>(`/api/collab/requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ leadId, notes }),
    });
  },
  reject: async (id: string, notes?: string) => {
    return request<{ success: boolean }>(`/api/collab/requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },
};

// Phase 6 Req27/28 — handover + migration router.
export const migrationApi = {
  handover: async (payload: {
    caseId: string;
    toOrg: string;
    toState?: string;
    toAdminId: string;
    orderRef: string;
    reason?: string;
  }) => {
    return request<{ success: boolean; from: string; to: string; orderRef: string }>("/api/migration/handover", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  escalate: async (payload: { caseId: string; orderRef: string; cidLeadId?: string }) => {
    return request<{ success: boolean; path: string; orderRef: string }>("/api/migration/escalate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  takeover: async (payload: { caseId: string; orderRef: string; cbiLeadId?: string }) => {
    return request<{ success: boolean; path: string; orderRef: string }>("/api/migration/takeover", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// Phase 3 — SAHAYAK AI (core + document intel + evidence linker + statutes)
export const sahayakApi = {
  health: async () => {
    return request<{ providers: any[]; loraEndpoint: any; mesh?: { transport: string; tailscaleHostname: string | null; peers: any[]; knownAdapters: string[] } }>("/api/sahayak/health");
  },

  // SAHAYAK model extraction (Groq-backed, no silent fallbacks).
  extract: async (text: string, fileName?: string) => {
    return request<{
      nodes: any[];
      links: any[];
      summary: string;
      suspiciousSignals: string[];
      engine: string;
      provider: string;
      model: string;
    }>("/api/extract-entities/sahayak", {
      method: "POST",
      body: JSON.stringify({ text, fileName }),
    });
  },

  ask: async (question: string, caseId?: string, adhocContext?: string) => {
    return request<{
      answer: string;
      citations: string[];
      confidence: number;
      recommendedActions: string[];
      provider: string;
      llmUsed: boolean;
      sources: string[];
    }>("/api/sahayak/ask", {
      method: "POST",
      body: JSON.stringify({ question, caseId, adhocContext }),
    });
  },

  statutes: async (q: string, limit = 8) => {
    return request<{ query: string; hits: any[] }>(`/api/sahayak/statutes?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  parseDocument: async (fileName: string, mimeType: string, contentBase64: string) => {
    return request<{ success: boolean; document: any }>("/api/sahayak/document", {
      method: "POST",
      body: JSON.stringify({ fileName, mimeType, contentBase64 }),
    });
  },

  linkEvidence: async (caseId: string, limit = 40) => {
    return request<{ proposals: any[]; generatedAt: string }>("/api/sahayak/link-evidence", {
      method: "POST",
      body: JSON.stringify({ caseId, limit }),
    });
  },

  translate: async (text: string, targetLang: string, adapter?: string) => {
    return request<{ translated: string; provider: string }>("/api/sahayak/translate", {
      method: "POST",
      body: JSON.stringify({ text, targetLang, adapter }),
    });
  },

  summarize: async (text: string, targetLang?: string, adapter?: string) => {
    return request<{ summary: string; provider: string; llmUsed: boolean; lines?: string[]; language?: string }>(
      "/api/sahayak/summarize",
      { method: "POST", body: JSON.stringify({ text, targetLang, adapter }) }
    );
  },

  chargeAssist: async (payload: Record<string, unknown>) => {
    return request<{ legalOpinion: string; polishedFacts?: string; provider: string; llmUsed: boolean; citations: string[] }>(
      "/api/sahayak/chargesheet-assist",
      { method: "POST", body: JSON.stringify(payload) }
    );
  },
};

// Phase 5 — Cyber Crime + AI Models (mesh peers, cyber cell)
export const meshApi = {
  health: async () => {
    return request<{ providers: any[]; loraEndpoint: any; mesh: { transport: string; tailscaleHostname: string | null; peers: any[]; knownAdapters: string[] } }>(
      "/api/sahayak/health"
    );
  },
  getPeers: async () => {
    return request<{ transport: string; peers: any[]; knownAdapters: string[] }>("/api/sahayak/mesh");
  },
  addPeer: async (payload: { name: string; baseUrl: string; adapters?: string[]; models?: string[]; enabled?: boolean }) => {
    return request<{ success: boolean; peer: any }>("/api/sahayak/mesh", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  removePeer: async (peerId: string) => {
    return request<{ success: boolean }>(`/api/sahayak/mesh/${peerId}`, { method: "DELETE" });
  },
};

export const cyberApi = {
  list: async (caseId: string, kind?: string) => {
    return request<{ incidents: any[] }>(`/api/cases/${caseId}/cyber${kind ? `?kind=${kind}` : ""}`);
  },
  create: async (caseId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; incident: any }>(`/api/cases/${caseId}/cyber`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  setStatus: async (caseId: string, incidentId: string, payload: Record<string, unknown>) => {
    return request<{ success: boolean; incident: any }>(`/api/cases/${caseId}/cyber/${incidentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  trace: async (caseId: string, payload: { startLabel: string; direction: "IN" | "OUT" | "BOTH"; maxHops?: number }) => {
    return request<{ success: boolean; incident: any; trail: any }>(`/api/cases/${caseId}/cyber/trace`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  alerts: async (caseId: string) => {
    return request<{ alerts: any[]; generatedAt: string }>(`/api/cases/${caseId}/cyber/alerts`);
  },
  correlate: async (caseId: string) => {
    return request<{ clusters: any[]; burnerCount: number }>(`/api/cases/${caseId}/cyber/correlate`);
  },
};

// WebSocket Real-time subscriber
export function createCaseWebSocket(
  onUpdate: (event: RealtimeCaseUpdate) => void,
  activeCaseId?: string
): () => void {
  const token = getStoredToken() || "";
  // Same-origin by default; VITE_WS_URL or VITE_API_URL (Render) when split.
  const wsUrl = caseWsUrl(token);

  let ws: WebSocket | null = null;
  let isClosed = false;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (token && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "AUTHENTICATE", token }));
        if (activeCaseId) {
          ws.send(JSON.stringify({ type: "SUBSCRIBE_CASE", caseId: activeCaseId }));
        }
      }
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // All case mutations (graph, staging, custody, proceedings,
        // transfers) arrive as CASE_UPDATED with a distinct event_type.
        // Tunnel telemetry stays local to the CCTNS panel.
        if (data && data.type === "CASE_UPDATED") {
          onUpdate(data);
        }
      } catch (err) {
        // ignore
      }
    };

    ws.onerror = () => {};
  } catch (err) {
    // ignore
  }

  return () => {
    isClosed = true;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}
