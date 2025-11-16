import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import Landing from './components/Landing';
import CookieConsent from './components/CookieConsent';

const App = () => {
    const { user, loading } = useAuth();

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,70,85,0.25),_transparent_45%),_radial-gradient(circle_at_20%_20%,_rgba(0,246,255,0.2),_transparent_35%),_#05060f] text-slate-100">
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
