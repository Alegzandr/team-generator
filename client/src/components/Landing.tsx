import LoginButton from './LoginButton';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

const Landing = () => {
    const { t } = useLanguage();

    const showcase = {
        teamA: ['Neon Shift', 'Crimson Viper', 'Mara Nova'],
        teamB: ['Solstice', 'Phantom Ivy', 'Eclipse'],
    };

    return (
        <div className="app-shell flex flex-col gap-10 py-16 text-white">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                <section className="valorant-panel valorant-panel--glow relative overflow-hidden">
                    <div className="valorant-chip text-xs font-semibold tracking-[0.12em]">
                        {t('app.tagline')}
                    </div>
                    <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
                        {t('app.title')}
                    </h1>
                    <p className="mt-4 text-lg text-slate-100">{t('players.selectHelp')}</p>
                    <div className="mt-8 flex flex-wrap gap-4">
                        <LoginButton />
                        <div className="flex flex-wrap gap-6 text-xs tracking-[0.12em] text-slate-200">
                            <div>
                                <p className="text-3xl font-bold text-white">5v5</p>
                                <p>{t('teams.balanceInfo')}</p>
                            </div>
                            <div>
                                <p className="text-3xl font-bold text-white">+Momentum</p>
                                <p>{t('players.momentumTooltip')}</p>
                            </div>
                        </div>
                    </div>
                    <p className="mt-6 text-sm text-slate-200">{t('app.gdpr')}</p>
                </section>
                <section className="valorant-panel relative overflow-hidden">
                    <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#ff4655]/40 blur-3xl" />
                    <div className="pointer-events-none absolute bottom-0 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-[#00f6ff]/30 blur-3xl" />
                    <p className="text-xs tracking-[0.18em] text-slate-200">
                        {t('teams.title')}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">
                        {t('teams.balanceInfo')}
                    </h3>
                    <div className="mt-6 space-y-4">
                        {(['teamA', 'teamB'] as const).map((teamKey) => (
                            <div key={teamKey} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs tracking-[0.15em] text-slate-200">
                                            {teamKey === 'teamA' ? t('teams.teamA') : t('teams.teamB')}
                                        </p>
                                        <p className="text-lg font-semibold">
                                            {teamKey === 'teamA' ? 'Attackers' : 'Defenders'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs tracking-[0.12em] text-slate-200">
                                            {t('teams.totalSkill')}
                                        </p>
                                        <p className="text-2xl font-bold text-cyan-300">
                                            {teamKey === 'teamA' ? '32.4' : '32.1'}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-100">
                                    {showcase[teamKey].map((name) => (
                                        <span
                                            key={name}
                                            className="rounded-full border border-white/15 px-3 py-1 text-[0.65rem] tracking-[0.12em]"
                                        >
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
                {(['landing.step1', 'landing.step2', 'landing.step3'] as TranslationKey[]).map((key, index) => (
                    <div key={key} className="valorant-card">
                        <p className="text-xs tracking-[0.15em] text-slate-200">
                            {`0${index + 1}`}
                        </p>
                        <p className="mt-3 text-sm text-slate-50">{t(key)}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Landing;
