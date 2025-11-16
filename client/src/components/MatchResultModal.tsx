import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface Props {
    teamNames: { teamA: string; teamB: string };
    open: boolean;
    initialScores?: { teamA: number; teamB: number };
    onClose: () => void;
    onConfirm: (scores: { teamA: number; teamB: number }) => void;
}

const MatchResultModal = ({ teamNames, open, initialScores, onClose, onConfirm }: Props) => {
    const { t } = useLanguage();
    const [teamAScore, setTeamAScore] = useState(initialScores?.teamA ?? 0);
    const [teamBScore, setTeamBScore] = useState(initialScores?.teamB ?? 0);

    useEffect(() => {
        if (open) {
            setTeamAScore(initialScores?.teamA ?? 0);
            setTeamBScore(initialScores?.teamB ?? 0);
        }
    }, [open, initialScores]);

    if (!open) return null;

    const handleScoreChange = (team: 'A' | 'B', value: number) => {
        const clamped = Math.max(0, value);
        if (team === 'A') {
            setTeamAScore(clamped);
        } else {
            setTeamBScore(clamped);
        }
    };

    const handleConfirm = () => {
        onConfirm({ teamA: teamAScore, teamB: teamBScore });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {t('results.modalTitle')}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t('results.modalSubtitle')}
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
                            {teamNames.teamA || t('teams.teamA')}
                        </p>
                        <input
                            type="number"
                            min={0}
                            value={teamAScore}
                            onChange={(e) => handleScoreChange('A', Number(e.target.value))}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>
                    <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
                            {teamNames.teamB || t('teams.teamB')}
                        </p>
                        <input
                            type="number"
                            min={0}
                            value={teamBScore}
                            onChange={(e) => handleScoreChange('B', Number(e.target.value))}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    >
                        {t('actions.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                        {t('actions.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MatchResultModal;
