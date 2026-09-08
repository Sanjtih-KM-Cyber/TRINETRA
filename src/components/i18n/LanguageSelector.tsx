import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { LANGUAGES } from "../../services/i18n";
import { Globe } from "lucide-react";

export const LanguageSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { locale, setLocale } = useLanguage();
  return (
    <label className={`inline-flex items-center gap-1.5 ${compact ? "" : "px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"}`}>
      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="bg-transparent text-[11px] font-mono text-slate-200 focus:outline-none max-w-[150px]"
        title="Interface language — 22 scheduled + English"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-slate-900 text-slate-100">
            {l.nativeLabel} ({l.code.toUpperCase()})
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSelector;
