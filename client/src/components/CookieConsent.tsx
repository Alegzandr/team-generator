import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const STORAGE_KEY = 'team-generator-cookie-consent';

const CookieConsent = () => {
    const { t } = useLanguage();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const accepted = localStorage.getItem(STORAGE_KEY);
        setVisible(!accepted);
    }, []);

    if (!visible) {
        return null;
    }

    const handleAccept = () => {
        localStorage.setItem(STORAGE_KEY, 'accepted');
        setVisible(false);
    };

    return (
        <div className="valorant-panel fixed bottom-4 left-1/2 z-50 w-[92%] max-w-3xl -translate-x-1/2 rounded-2xl border-white/20 bg-black/60 p-5 backdrop-blur-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-lg font-semibold text-white">{t('cookie.title')}</p>
                    <p className="text-sm text-slate-100">{t('cookie.description')}</p>
                </div>
                <button
                    onClick={handleAccept}
                    className="valorant-btn-primary px-6 py-2 text-xs"
                >
                    {t('cookie.accept')}
                </button>
            </div>
        </div>
    );
};

export default CookieConsent;
