import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { Shield, AlertCircle } from 'lucide-react';

export const Login = () => {
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('admin');
    const [error, setError] = useState('');
    const login = useAuthStore((state) => state.login);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (res.ok) {
                const data = await res.json();
                login(data.token, data.user);
                navigate('/');
            } else {
                setError('Invalid credentials');
            }
        } catch (err) {
            setError('Connection failed. Please check backend availability.');
        }
    };

    return (
        <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="flex justify-center mb-8">
                        <div className="bg-primary/20 p-4 rounded-full">
                            <Shield className="w-12 h-12 text-primary" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-center text-white mb-2">Firewall Manager</h2>
                    <p className="text-text-muted text-center mb-8">Enter your credentials to access the system</p>

                    {error && (
                        <div className="bg-danger/10 border border-danger/50 text-danger px-4 py-3 rounded-lg mb-6 flex items-center text-sm">
                            <AlertCircle className="w-5 h-5 mr-2" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-2">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-[#1E1E2E] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#1E1E2E] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-primary hover:bg-[#00796B] text-white font-medium py-3 rounded-lg transition-colors shadow-lg shadow-primary/20"
                        >
                            Sign In
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
