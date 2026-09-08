import React, { useState } from "react";
import { LANGUAGES } from "../../services/i18n";
import { useVoiceInput } from "../../services/voiceInput";
import { useLanguage } from "../../context/LanguageContext";
import { Mic, Loader2, MicOff } from "lucide-react";

interface DictationFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}

/** Multilingual dictation textarea — Web Speech API across all 22 scheduled languages + English. */
export const DictationField: React.FC<DictationFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  required = false,
}) => {
  const { locale } = useLanguage();
  const [voiceLocale, setVoiceLocale] = useState(locale);
  const { listening, start, stop, supported, error } = useVoiceInput({
    locale: voiceLocale,
    onResult: (tx) => onChange(value ? `${value} ${tx}` : tx),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-semibold text-slate-300">
          {label} {required && <span className="text-amber-400">*</span>}
        </label>
        {supported && (
          <div className="flex items-center gap-1.5">
            <select
              value={voiceLocale}
              onChange={(e) => setVoiceLocale(e.target.value as typeof voiceLocale)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-[10px] font-mono text-slate-300 focus:outline-none max-w-[110px]"
              title="Dictation language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-slate-900">
                  {l.nativeLabel}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => (listening ? stop() : start())}
              title={error || `Dictate in ${voiceLocale.toUpperCase()}`}
              className={`p-1.5 rounded-lg border transition-colors ${
                listening
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:text-slate-100"
              }`}
            >
              {listening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : error ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
      />
      {listening && <div className="text-[10px] font-mono text-rose-300 mt-1 animate-pulse">● Listening ({voiceLocale.toUpperCase()}) — speak now…</div>}
    </div>
  );
};

export default DictationField;
