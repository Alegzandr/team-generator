import { useId } from 'react';

interface SkillSelectorProps {
    value: number;
    onChange: (value: number) => void;
    name?: string;
    compact?: boolean;
}

const options = Array.from({ length: 11 }, (_, index) => index);

const SkillSelector = ({ value, onChange, name, compact = false }: SkillSelectorProps) => {
    const groupId = name ?? useId();

    return (
        <div className="flex gap-2" role="radiogroup" aria-label="Skill rating selector">
            {options.map((option) => {
                const selected = value === option;
                const inputId = `${groupId}-${option}`;
                return (
                    <div key={option} className="flex-1">
                        <input
                            type="radio"
                            id={inputId}
                            name={groupId}
                            value={option}
                            checked={selected}
                            onChange={() => onChange(option)}
                            className="sr-only"
                        />
                        <label
                            htmlFor={inputId}
                            className={`block cursor-pointer rounded-2xl border px-2 py-2 text-center text-sm font-semibold tracking-[0.08em] transition ${
                                selected
                                    ? 'border-[#ff5c8a]/40 bg-[#ff5c8a]/20 text-white shadow-[0_6px_20px_rgba(255,92,138,0.25)]'
                                    : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/40 hover:text-white'
                            } ${compact ? 'py-1 text-xs' : ''}`}
                        >
                            {option}
                        </label>
                    </div>
                );
            })}
        </div>
    );
};

export default SkillSelector;
