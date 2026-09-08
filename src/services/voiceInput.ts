import { useState, useCallback, useRef, useEffect } from "react";
import { AppLocale, LANGUAGES, speechCode } from "./i18n";

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  const ctor =
    (w["SpeechRecognition"] as new () => SpeechRecognitionInstance | undefined) ??
    (w["webkitSpeechRecognition"] as new () => SpeechRecognitionInstance | undefined) ??
    null;
  return ctor ?? null;
}

export function isVoiceSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export function supportedVoiceLocales(): string[] {
  // Web Speech API accepts any BCP-47 tag; Chrome supports all 22 scheduled + English.
  return LANGUAGES.map((l) => l.bcp47);
}

interface UseVoiceInputOptions {
  locale?: AppLocale;
  onResult?: (transcript: string) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { locale = "en", onResult } = options;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const start = useCallback(
    (overrideLocale?: AppLocale) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError("Voice input is not supported in this browser. Use Chrome or Edge.");
        return;
      }
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      const rec = new Ctor();
      rec.lang = speechCode(overrideLocale ?? locale);
      rec.continuous = false;
      rec.interimResults = true;
      setError(null);
      setTranscript("");
      rec.onresult = (e) => {
        const results = Array.from(e.results as unknown as ArrayLike<{ transcript: string }>);
        const text = results.map((r) => r[0]?.transcript ?? "").join(" ").trim();
        setTranscript(text);
        if (text) onResultRef.current?.(text);
      };
      rec.onerror = (e) => {
        setError(e.error === "not-allowed" ? "Microphone permission denied." : `Voice error: ${e.error}`);
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        setError("Could not start voice capture.");
      }
    },
    [locale]
  );

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { listening, transcript, error, start, stop, supported: isVoiceSupported() };
}
