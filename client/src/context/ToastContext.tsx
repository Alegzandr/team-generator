import { createContext, useContext, useMemo, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    message: string;
    variant: ToastVariant;
}

interface ToastContextType {
    toasts: ToastMessage[];
    pushToast: (message: string, variant?: ToastVariant) => void;
    dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const createId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const pushToast = (message: string, variant: ToastVariant = 'info') => {
        const id = createId();
        setToasts((prev) => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 5000);
    };

    const dismissToast = (id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    };

    const value = useMemo(
        () => ({
            toasts,
            pushToast,
            dismissToast,
        }),
        [toasts]
    );

    return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};
