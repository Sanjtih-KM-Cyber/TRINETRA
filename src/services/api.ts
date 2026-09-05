import { UserAccount, AccessRequest, CaseMember, RealtimeCaseUpdate } from "../types";

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
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

  login: async (identifier: string, password: string) => {
    const res = await request<{
      token: string;
      user: UserAccount;
      authorized_cases: any[];
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  requestAccess: async (formData: {
    full_name: string;
    official_id: string;
    official_email: string;
    agency: string;
    designation?: string;
    department: string;
    requested_role: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR";
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

  approveCaseAccessRequest: async (id: string, notes?: string) => {
    return request<{ success: boolean; message: string; member: CaseMember }>(`/api/admin/case-access-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  rejectCaseAccessRequest: async (id: string, notes?: string) => {
    return request<{ success: boolean; message: string }>(`/api/admin/case-access-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  approveRequest: async (id: string, notes?: string, defaultCaseId?: string, assignedRole?: "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR") => {
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
    return request<{ success: boolean; message: string }>(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  getCases: async () => {
    return request<{ cases: any[] }>("/api/admin/cases");
  },

  getCaseMembers: async (caseId: string) => {
    return request<{ members: CaseMember[] }>(`/api/admin/cases/${caseId}/members`);
  },

  assignCaseMember: async (caseId: string, userId: string) => {
    return request<{ success: boolean; member: CaseMember }>(`/api/admin/cases/${caseId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
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

// WebSocket Real-time subscriber
export function createCaseWebSocket(
  onUpdate: (event: RealtimeCaseUpdate) => void,
  activeCaseId?: string
): () => void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getStoredToken() || "";
  const wsUrl = `${protocol}//${window.location.host}/ws/case-updates?token=${encodeURIComponent(token)}`;

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
        if (data.type === "CASE_UPDATED") {
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
