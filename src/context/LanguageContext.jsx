import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { t as translate } from "../lib/translations";

const STORAGE_KEY = "careconnect-lang";
const LanguageContext = createContext(null);

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(readStoredLang);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "en" ? "ta" : "en";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  // t(key, vars?) — vars fills {placeholders}, e.g. t("dayOf", { n: 3, total: 30 })
  const t = useCallback(
    (key, vars) => {
      const text = translate(key, lang);
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, (m, name) => vars[name] ?? m);
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, toggleLang, t }), [lang, toggleLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
