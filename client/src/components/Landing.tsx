import LoginButton from './LoginButton';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

const Landing = () => {
    const { t } = useLanguage();

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12 text-slate-900 dark:text-slate-100">
            <div className="flex flex-col gap-4 text-center">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    {t('app.title')}
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-300">{t('app.tagline')}</p>
                <div className="mt-6 flex justify-center">
                    <LoginButton />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('app.gdpr')}</p>
            </div>
            <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/70 sm:grid-cols-3">
                {(['landing.step1', 'landing.step2', 'landing.step3'] as TranslationKey[]).map((key) => (
                    <div
                        key={key}
                        className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                    >
                        {t(key)}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Landing;
