import { apiFetch } from '@/lib/api';
import { clearToken, getToken } from '@/lib/auth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { AppUser } from '@/types';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: any | null;
  profile: AppUser | null;
  loading: boolean;
  refreshProfile: () => Promise<AppUser | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { expoPushToken } = usePushNotifications();

  const refreshProfile = async (): Promise<AppUser | null> => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        setProfile(null);
        return null;
      }

      const data = await apiFetch('/auth/me');
      const userData = (data?.user || data) as AppUser;
      setUser(userData);
      setProfile(userData);

      if (expoPushToken?.data) {
        apiFetch('/auth/me', {
          method: 'POST',
          body: JSON.stringify({ pushToken: expoPushToken.data }),
        }).catch((err) => console.error('Error syncing push token:', err));
      }

      return userData;
    } catch (err) {
      console.error('Auth refresh error:', err);
      await clearToken();
      setUser(null);
      setProfile(null);
      return null;
    }
  };

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

  useEffect(() => {
    if (user && expoPushToken?.data) {
      apiFetch('/auth/me', {
        method: 'POST',
        body: JSON.stringify({ pushToken: expoPushToken.data }),
      }).catch((err) => console.error('Error syncing push token:', err));
    }
  }, [user, expoPushToken?.data]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
