import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const LoginButton = () => {
    const { login } = useAuth();
    const { t } = useLanguage();

    return (
        <button
            onClick={login}
            className="valorant-btn-primary px-8 py-3 text-sm tracking-[0.15em]"
        >
            {t('actions.login')}
        </button>
    );
};

export default LoginButton;
