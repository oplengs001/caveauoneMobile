import { apiFetch } from '@/lib/api';
import { clearToken, getToken } from '@/lib/auth';
import { AppUser } from '@/types';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: any | null;
  profile: AppUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) {
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
          return;
        }

        const data = await apiFetch('/auth/me');
        if (!cancelled) {
          const userData = data?.user || data;
          setUser(userData);
          setProfile(userData as AppUser);
        }
      } catch (err) {
        console.error('Auth bootstrap error:', err);
        // Token invalid — clear it
        await clearToken();
        if (!cancelled) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
