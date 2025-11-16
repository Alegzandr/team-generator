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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05060f]/90 p-4 backdrop-blur">
            <div className="valorant-panel w-full max-w-lg border-white/15 bg-black/70">
                <h3 className="text-xl font-semibold">
                    {t('results.modalTitle')}
                </h3>
                <p className="mt-1 text-sm text-slate-100">
                    {t('results.modalSubtitle')}
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                        <p className="text-sm font-semibold text-slate-100">
                            {teamNames.teamA || t('teams.teamA')}
                        </p>
                        <input
                            type="number"
                            min={0}
                            value={teamAScore}
                            onChange={(e) => handleScoreChange('A', Number(e.target.value))}
                            className="valorant-input mt-2 w-full"
                        />
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                        <p className="text-sm font-semibold text-slate-100">
                            {teamNames.teamB || t('teams.teamB')}
                        </p>
                        <input
                            type="number"
                            min={0}
                            value={teamBScore}
                            onChange={(e) => handleScoreChange('B', Number(e.target.value))}
                            className="valorant-input mt-2 w-full"
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="valorant-btn-outline px-6 py-2 text-xs"
                    >
                        {t('actions.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="valorant-btn-primary px-6 py-2 text-xs"
                    >
                        {t('actions.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MatchResultModal;
