import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserAccount, UserRole, CaseDataset, RealtimeCaseUpdate } from "../types";
import { authApi, getStoredToken, caseApi, createCaseWebSocket } from "../services/api";
import { vpnApi } from "../services/vpn";

interface AuthContextType {
  user: UserAccount | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  authorizedCases: any[];
  login: (identifier: string, pass: string, otp?: string) => Promise<void>;
  logout: () => Promise<void>;
  requestAccess: (formData: any) => Promise<{ success: boolean; message: string }>;
  refreshUser: () => Promise<void>;
  refreshAuthorizedCases: () => Promise<void>;
  clearMustChangePassword: () => void;
  realtimeNotification: RealtimeCaseUpdate | null;
  clearNotification: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [authorizedCases, setAuthorizedCases] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [realtimeNotification, setRealtimeNotification] = useState<RealtimeCaseUpdate | null>(null);

  const refreshAuthorizedCases = useCallback(async () => {
    try {
      const res = await caseApi.getCases();
      setAuthorizedCases(res.cases || []);
    } catch (err: any) {
      console.warn("Failed to refresh authorized cases:", err.message);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setAuthorizedCases([]);
      setIsLoading(false);
      return;
    }

    try {
      const res = await authApi.getMe();
      setUser(res.user);
      setMustChangePassword(!!(res.user as any)?.mustChangePassword);
      setAuthorizedCases(res.authorized_cases || []);
    } catch (err: any) {
      console.warn("Auth check failed:", err.message);
      setUser(null);
      setAuthorizedCases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Real-time updates subscription
  useEffect(() => {
    if (!user) return;

    const unsubscribe = createCaseWebSocket((event) => {
      setRealtimeNotification(event);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const login = async (identifier: string, pass: string, otp?: string) => {
    setIsLoading(true);
    try {
      // Phase 1 — tunnel-handshake OTP travels with badge + PIN to /api/auth/login.
      const res = await authApi.login(identifier, pass, otp);
      setUser(res.user);
      setToken(res.token);
      setMustChangePassword(!!(res as any).mustChangePassword || !!(res.user as any)?.mustChangePassword);
      setAuthorizedCases(res.authorized_cases || []);
    } finally {
      setIsLoading(false);
    }
  };

  // Sign-out tears down the VPN tunnel too, so the officer always lands
  // back on the tunnel gateway screen (Screen 1) after logging out.
  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setToken(null);
      setAuthorizedCases([]);
      await vpnApi.disconnect().catch(() => undefined);
      window.location.reload();
    }
  };

  const requestAccess = async (formData: any) => {
    return await authApi.requestAccess(formData);
  };

  const clearNotification = () => setRealtimeNotification(null);
  const clearMustChangePassword = useCallback(() => setMustChangePassword(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && user.status === "ACTIVE",
        isLoading,
        mustChangePassword,
        authorizedCases,
        login,
        logout,
        requestAccess,
        refreshUser,
        refreshAuthorizedCases,
        clearMustChangePassword,
        realtimeNotification,
        clearNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
