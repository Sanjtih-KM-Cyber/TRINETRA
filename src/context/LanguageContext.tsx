import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AppLocale, LANGUAGES, isRTL, translate, I18nKey } from "../services/i18n";

interface LanguageContextType {
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  /** Bind the store to an officer id — loads their saved language; null = logged out. */
  setOwnerId: (id: string | null) => void;
  t: (key: I18nKey) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const GLOBAL_KEY = "crim_intel_locale";
const userKey = (id: string) => `crim_intel_locale_${id}`;

function validOrNull(v: unknown): AppLocale | null {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v) ? (v as AppLocale) : null;
}

function readStored(key: string): AppLocale | null {
  try {
    return validOrNull(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStored(GLOBAL_KEY) || "en");
  const ownerRef = useRef<string | null>(null);

  const setOwnerId = useCallback((id: string | null) => {
    if (ownerRef.current === id) return;
    ownerRef.current = id;
    // Switching officer (or logging out) loads that officer's saved language.
    // Per-officer choice wins; the shared-browser default is the fallback.
    const next = (id && readStored(userKey(id))) || readStored(GLOBAL_KEY) || "en";
    setLocaleState((prev) => (prev === next ? prev : next));
  }, []);

  const setLocale = useCallback((l: AppLocale) => {
    setLocaleState(l);
    try {
      if (ownerRef.current) localStorage.setItem(userKey(ownerRef.current), l);
      localStorage.setItem(GLOBAL_KEY, l);

      const currentTrans = document.cookie.split('; ').find(row => row.startsWith('googtrans='));
      const targetTrans = `googtrans=/en/${l}`;
      if (currentTrans !== targetTrans) {
        document.cookie = `${targetTrans}; path=/; domain=${window.location.hostname}`;
        document.cookie = `${targetTrans}; path=/`;
        window.location.reload();
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
  }, [locale]);

  const t = useCallback((key: I18nKey) => translate(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, setOwnerId, t, dir: (isRTL(locale) ? "rtl" : "ltr") as "ltr" | "rtl" }),
    [locale, setLocale, setOwnerId, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
