import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getToken, setToken } from "../api/http";
import { clearLookups } from "../utils/lookup";
import { getMe, login as loginApi, register as registerApi } from "../api/auth.api";

const AuthContext = createContext(null);

const pickUser = (data) => data?.user ?? data ?? null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [sessionMessage, setSessionMessage] = useState("");

  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then((res) => setUser(pickUser(res.data)))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setSessionMessage("Your session expired. Please sign in again.");
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const finish = (res) => {
    setToken(res.data.token);
    setUser(pickUser(res.data));
    setSessionMessage("");
    return res;
  };

  const login = useCallback(async (payload) => finish(await loginApi(payload)), []);
  const register = useCallback(async (payload) => finish(await registerApi(payload)), []);
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearLookups();
  }, []);

  const role = (user?.role || "").toLowerCase();

  return (
    <AuthContext.Provider
      value={{ user, role, isAuthed: !!getToken() && !!user, loading, sessionMessage, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
