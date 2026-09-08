import React from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceInput } from "../../services/voiceInput";
import { useLanguage } from "../../context/LanguageContext";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  title?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ onTranscript, title }) => {
  const { locale } = useLanguage();
  const { listening, start, stop, supported, error } = useVoiceInput({
    locale,
    onResult: onTranscript,
  });

  if (!supported) return null;

  return (
    <button
      type="button"
      title={title ?? `Voice input (${locale.toUpperCase()})${error ? ` — ${error}` : ""}`}
      onClick={() => (listening ? stop() : start())}
      className={`p-2 rounded-lg border transition-colors ${
        listening
          ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
          : "bg-slate-800 border-slate-700 text-slate-300 hover:text-slate-100"
      }`}
    >
      {listening ? <Loader2 className="w-4 h-4 animate-spin" /> : error ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
};

export default VoiceInputButton;
