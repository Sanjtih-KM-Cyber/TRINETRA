import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { AppLocale, LANGUAGES, isRTL, translate, I18nKey } from "../services/i18n";

interface LanguageContextType {
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  t: (key: I18nKey) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "crim_intel_locale";

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as AppLocale | null;
      if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
    } catch {
      /* ignore */
    }
    return "en";
  });

  const setLocale = useCallback((l: AppLocale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
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
    () => ({ locale, setLocale, t, dir: (isRTL(locale) ? "rtl" : "ltr") as "ltr" | "rtl" }),
    [locale, setLocale, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
