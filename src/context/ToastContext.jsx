import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Toast from "../components/ui/Toast";
import { useMediaQuery } from "../hooks/useMediaQuery";

const ToastContext = createContext(null);
const MAX_TOASTS = 3;
const DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message, variant = "info") => {
      const id = nextId.current++;
      // Newest first, capped at MAX_TOASTS
      setToasts((prev) => [{ id, message, variant }, ...prev].slice(0, MAX_TOASTS));
      setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: "fixed",
          right: 24,
          bottom: isMobile ? 80 : 24,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 1000,
        }}
      >
        {toasts.map((x) => (
          <Toast key={x.id} message={x.message} variant={x.variant} onClose={() => dismiss(x.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// toast.show(message, 'success' | 'error' | 'info')
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
