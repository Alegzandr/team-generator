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
        <div className="fixed bottom-4 left-1/2 z-50 w-[90%] max-w-3xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
                {t('cookie.title')}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {t('cookie.description')}
            </p>
            <div className="mt-4 flex justify-end">
                <button
                    onClick={handleAccept}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                    {t('cookie.accept')}
                </button>
            </div>
        </div>
    );
};

export default CookieConsent;
