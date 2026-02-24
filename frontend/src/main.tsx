import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { useAuthStore } from './store'

const nativeFetch = window.fetch.bind(window);
let isHandlingUnauthorized = false;

const toUrlString = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
};

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await nativeFetch(input, init);
    const url = toUrlString(input);
    const isApiRequest = url.startsWith('/api/') || url.includes('/api/');
    const isAuthRoute = url.includes('/api/auth/login') || url.includes('/api/auth/logout');

    if (response.status === 401 && isApiRequest && !isAuthRoute && !isHandlingUnauthorized) {
        isHandlingUnauthorized = true;
        useAuthStore.getState().logout();
        window.location.replace('/login');
    }

    return response;
};

const restoreGlobalInteractivity = (): void => {
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;

    if (bodyStyle.pointerEvents === 'none') bodyStyle.pointerEvents = '';
    if (bodyStyle.userSelect === 'none') bodyStyle.userSelect = '';
    if (bodyStyle.cursor === 'grabbing' || bodyStyle.cursor === '-webkit-grabbing') bodyStyle.cursor = '';
    if (rootStyle.cursor === 'grabbing' || rootStyle.cursor === '-webkit-grabbing') rootStyle.cursor = '';
};

window.addEventListener('pointerup', restoreGlobalInteractivity, { passive: true });
window.addEventListener('blur', restoreGlobalInteractivity, { passive: true });
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) restoreGlobalInteractivity();
});
restoreGlobalInteractivity();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
