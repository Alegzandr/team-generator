import { useId } from 'react';

interface SkillSelectorProps {
    value: number;
    onChange: (value: number) => void;
    name?: string;
    compact?: boolean;
}

const options = [1, 2, 3, 4, 5];

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
                            className={`block cursor-pointer rounded-xl border px-2 py-2 text-center text-sm font-semibold transition ${
                                selected
                                    ? 'border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300'
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
