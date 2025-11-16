import { useToast } from '../context/ToastContext';

const variantStyles: Record<string, string> = {
    success:
        'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/70 dark:text-green-100',
    error:
        'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/70 dark:text-red-100',
    info:
        'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
};

const ToastStack = () => {
    const { toasts, dismissToast } = useToast();

    return (
        <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-3">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg ${variantStyles[toast.variant]}`}
                >
                    <span className="flex-1 text-sm font-medium">{toast.message}</span>
                    <button
                        onClick={() => dismissToast(toast.id)}
                        className="text-xs font-semibold text-slate-500 dark:text-slate-300"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastStack;
