import { createContext, useContext } from "react";
import { useAuth } from "../hooks/useAuth";

// useAuth() registers its own auth listener and may create the profile row, so it
// must run exactly once. Components read the shared result from here instead.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside <AuthProvider>");
  return ctx;
}
