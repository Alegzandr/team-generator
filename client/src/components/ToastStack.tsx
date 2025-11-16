import { useToast } from '../context/ToastContext';

const variantStyles: Record<string, string> = {
    success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100 shadow-[0_0_25px_rgba(16,185,129,0.3)]',
    error: 'border-[#ff4655]/40 bg-[#ff4655]/10 text-[#ff9aa4] shadow-[0_0_30px_rgba(255,70,85,0.35)]',
    info: 'border-white/15 bg-white/10 text-slate-100 shadow-[0_0_25px_rgba(15,23,42,0.6)]',
};

const ToastStack = () => {
    const { toasts, dismissToast } = useToast();

    return (
        <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-3">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3 font-semibold tracking-[0.08em] ${variantStyles[toast.variant]}`}
                >
                    <span className="flex-1 text-xs">{toast.message}</span>
                    <button
                        onClick={() => dismissToast(toast.id)}
                        className="text-sm text-slate-200 transition hover:text-white"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastStack;
