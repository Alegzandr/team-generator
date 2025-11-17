const STORAGE_KEY = 'team-generator:referral';
const REF_PARAM = 'invite';

const safeLocalStorage = () => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null;
        }
        return window.localStorage;
    } catch {
        return null;
    }
};

export const captureReferralFromUrl = () => {
    if (typeof window === 'undefined') return;
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
        const url = new URL(window.location.href);
        const ref = url.searchParams.get(REF_PARAM);
        if (ref) {
            storage.setItem(STORAGE_KEY, ref);
            url.searchParams.delete(REF_PARAM);
            window.history.replaceState({}, '', url.toString());
        }
    } catch {
        // ignore parsing failures
    }
};

export const getStoredReferral = () => {
    const storage = safeLocalStorage();
    if (!storage) return null;
    return storage.getItem(STORAGE_KEY);
};

export const clearStoredReferral = () => {
    const storage = safeLocalStorage();
    if (!storage) return;
    storage.removeItem(STORAGE_KEY);
};
