import { createContext, useContext, useMemo, useState } from 'react';
import { TranslationKey, translations } from '../i18n/translations';

type Language = 'en' | 'fr';

interface LanguageContextType {
    language: Language;
    setLanguage: (language: Language) => void;
    t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
    undefined
);

const STORAGE_KEY = 'team-generator-language';

const interpolate = (
    value: string,
    variables?: Record<string, string | number>
) => {
    if (!variables) return value;
    return Object.entries(variables).reduce((result, [key, val]) => {
        const pattern = new RegExp(`\\{${key}\\}`, 'g');
        return result.replace(pattern, String(val));
    }, value);
};

const resolveInitialLanguage = (): Language => {
    if (typeof window === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') {
        return stored;
    }
    return navigator.language.startsWith('fr') ? 'fr' : 'en';
};

export const LanguageProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [language, setLanguageState] = useState<Language>(resolveInitialLanguage);

    const setLanguage = (lang: Language) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, lang);
        }
        setLanguageState(lang);
    };

    const value = useMemo<LanguageContextType>(() => {
        return {
            language,
            setLanguage,
            t: (key, variables) => interpolate(translations[language][key], variables),
        };
    }, [language]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within LanguageProvider');
    }
    return context;
};
