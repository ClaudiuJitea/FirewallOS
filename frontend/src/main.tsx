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

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
