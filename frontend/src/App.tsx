import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { FirewallRules } from './pages/FirewallRules';
import { NAT } from './pages/NAT';
import { Logs } from './pages/Logs';
import { RoutingTable } from './pages/Routing';
import { Interfaces } from './pages/Interfaces';
import { DNSFiltering } from './pages/DNSFiltering';
import { BackendConsole } from './pages/BackendConsole';
import { DHCP } from './pages/DHCP';
import { UsersAuth } from './pages/UsersAuth';
import { SystemSettings } from './pages/SystemSettings';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const token = useAuthStore((state) => state.token);
    if (!token) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                    <Route index element={<Dashboard />} />
                    <Route path="interfaces" element={<Interfaces />} />
                    <Route path="dns" element={<DNSFiltering />} />
                    <Route path="rules" element={<FirewallRules />} />
                    <Route path="nat" element={<NAT />} />
                    <Route path="routing" element={<RoutingTable />} />
                    <Route path="dhcp" element={<DHCP />} />
                    <Route path="logs" element={<Logs />} />
                    <Route path="console" element={<BackendConsole />} />
                    <Route path="system" element={<SystemSettings />} />
                    <Route path="users" element={<UsersAuth />} />
                    <Route path="*" element={<div className="p-8 text-center text-gray-500">Page under construction...</div>} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
