import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import Landing from './components/Landing';
import CookieConsent from './components/CookieConsent';

const App = () => {
    const { user, loading } = useAuth();

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
            <CookieConsent />
            {loading ? (
                <div className="flex h-screen items-center justify-center text-slate-500">
                    Loading…
                </div>
            ) : user ? (
                <Dashboard />
            ) : (
                <Landing />
            )}
        </div>
    );
};

export default App;
