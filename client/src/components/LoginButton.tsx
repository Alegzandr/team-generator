import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const LoginButton = () => {
    const { login } = useAuth();
    const { t } = useLanguage();

    return (
        <button
            onClick={login}
            className="rounded-full bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-indigo-500"
        >
            {t('actions.login')}
        </button>
    );
};

export default LoginButton;
