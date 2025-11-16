import { createContext, useContext, useEffect, useState } from 'react';

export interface User {
    id: string;
    username: string;
    avatar: string | null;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: () => void;
    logout: (options?: { silent?: boolean }) => Promise<void>;
    refreshUser: () => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || '';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchCurrentUser = async () => {
        const response = await fetch(`${API_URL}/api/user`, {
            credentials: 'include',
        });

        if (!response.ok) {
            setUser(null);
            throw new Error('Unauthorized');
        }

        const data = (await response.json()) as User;
        setUser(data);
        return data;
    };

    useEffect(() => {
        const restoreSession = async () => {
            try {
                await fetchCurrentUser();
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        restoreSession();
    }, []);

    const login = () => {
        if (typeof window !== 'undefined') {
            window.location.href = `${API_URL}/api/auth/discord`;
        }
    };

    const logout = async (options?: { silent?: boolean }) => {
        if (!options?.silent) {
            try {
                await fetch(`${API_URL}/api/auth/logout`, {
                    method: 'POST',
                    credentials: 'include',
                });
            } catch {
                // ignore network errors during logout
            }
        }
        setUser(null);
    };

    const refreshUser = async () => {
        return fetchCurrentUser();
    };

    return (
        <AuthContext.Provider
            value={{ user, loading, login, logout, refreshUser }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
