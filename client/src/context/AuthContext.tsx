import { createContext, useContext, useEffect, useState } from 'react';

export interface User {
    id: string;
    username: string;
    avatar: string | null;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: () => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || '';

const getCleanUrl = (url: URL) => {
    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const urlToken = url.searchParams.get('token');
        const storedToken = localStorage.getItem('token');

        if (urlToken) {
            localStorage.setItem('token', urlToken);
            setToken(urlToken);
            url.searchParams.delete('token');
            window.history.replaceState({}, '', getCleanUrl(url));
        } else if (storedToken) {
            setToken(storedToken);
        } else {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const fetchUser = async (activeToken: string) => {
            try {
                const response = await fetch(`${API_URL}/api/user`, {
                    headers: {
                        Authorization: `Bearer ${activeToken}`,
                    },
                });

                if (!response.ok) {
                    throw new Error('Unauthorized');
                }

                const data = (await response.json()) as User;
                setUser(data);
            } catch (error) {
                localStorage.removeItem('token');
                setToken(null);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        if (!token) {
            setUser(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        fetchUser(token);
    }, [token]);

    const login = () => {
        if (typeof window !== 'undefined') {
            window.location.href = `${API_URL}/api/auth/discord`;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    const refreshUser = async () => {
        if (!token) return;
        const response = await fetch(`${API_URL}/api/user`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            throw new Error('Unable to refresh user');
        }
        const data = (await response.json()) as User;
        setUser(data);
    };

    return (
        <AuthContext.Provider
            value={{ user, token, loading, login, logout, refreshUser }}
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
