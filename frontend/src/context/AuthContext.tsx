import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'FINANCEIRO' | 'LEITURA';
}

export interface AuthCompany {
  id: string;
  name: string;
  cnpj: string | null;
  accountType: string; // DELTHA_CLIENT | EXTERNO
}

interface AuthResponse {
  user: AuthUser;
  company: AuthCompany;
}

interface AuthContextValue {
  user: AuthUser | null;
  company: AuthCompany | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { companyName: string; name: string; email: string; password: string; accountType: string; cnpj: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<AuthCompany | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuthResponse>('/api/auth/me')
      .then((d) => {
        setUser(d.user);
        setCompany(d.company);
      })
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const d = await api.post<AuthResponse>('/api/auth/login', { identifier, password });
    setUser(d.user);
    setCompany(d.company);
  }, []);

  const register = useCallback(
    async (data: { companyName: string; name: string; email: string; password: string; accountType: string; cnpj: string }) => {
      const d = await api.post<AuthResponse>('/api/auth/register', data);
      setUser(d.user);
      setCompany(d.company);
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout', {});
    setUser(null);
    setCompany(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, company, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
