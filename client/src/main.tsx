import { createRoot } from 'react-dom/client';
import './index.css';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import ToastStack from './components/ToastStack.tsx';

createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
        <ToastProvider>
            <LanguageProvider>
                <AuthProvider>
                    <App />
                    <ToastStack />
                </AuthProvider>
            </LanguageProvider>
        </ToastProvider>
    </BrowserRouter>
);
