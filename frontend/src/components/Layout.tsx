import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Shield, Activity, Network, ScrollText, LogOut, Search, Bell, User as UserIcon, Menu, X, Route as RouteIcon, Home, Settings, Users, Globe, Terminal, Wifi } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useAuthStore } from '../store';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const Layout = () => {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const token = useAuthStore((state) => state.token);
    const navigate = useNavigate();
    const [systemMetrics, setSystemMetrics] = React.useState<{ cpuPercent: number; ramUsedMb: number; ramTotalMb: number } | null>(null);
    const [isLoggingOut, setIsLoggingOut] = React.useState(false);

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
        } catch {
            // Ignore network failures; local logout still proceeds.
        } finally {
            logout();
            navigate('/login', { replace: true });
            // Force navigation so stale routed UI cannot remain visible.
            window.location.replace('/login');
        }
    };

    const navItems = [
        { to: '/', icon: Home, label: 'Dashboard' },
        { to: '/interfaces', icon: Activity, label: 'Interfaces' },
        { to: '/rules', icon: Shield, label: 'Firewall Rules' },
        { to: '/nat', icon: Network, label: 'NAT & Port Forwarding' },
        { to: '/routing', icon: RouteIcon, label: 'Routing' },
        { to: '/dns', icon: Globe, label: 'DNS Filtering' },
        { to: '/dhcp', icon: Wifi, label: 'DHCP Server' },
        { to: '/logs', icon: ScrollText, label: 'Live Logs' },
        { to: '/console', icon: Terminal, label: 'Backend Console' },
        { to: '/system', icon: Settings, label: 'System Settings' },
        { to: '/users', icon: Users, label: 'Users & Auth' },
    ];

    React.useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await fetch('/api/system/metrics', { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setSystemMetrics({
                        cpuPercent: data.cpuPercent ?? 0,
                        ramUsedMb: data.ramUsedMb ?? 0,
                        ramTotalMb: data.ramTotalMb ?? 0
                    });
                }
            } catch {
                // Keep previous values if fetch fails.
            }
        };

        fetchMetrics();
        const id = setInterval(fetchMetrics, 5000);
        return () => clearInterval(id);
    }, [token]);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            {/* Sidebar */}
            <aside className="w-72 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800 flex flex-col justify-between hidden md:flex shrink-0 shadow-2xl z-10 relative">
                {/* Decorative glow */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-primary/5 blur-3xl pointer-events-none"></div>

                <div>
                    <div className="h-20 flex items-center px-6 font-bold text-2xl tracking-tight border-b border-slate-800/60 text-white relative z-10">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-[#00796B] flex items-center justify-center shadow-lg shadow-primary/20 mr-3 border border-primary/30">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        Firewall<span className="text-primary font-light ml-1">OS</span>
                    </div>
                    <nav className="p-4 space-y-1.5 mt-2 relative z-10">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group border border-transparent",
                                        isActive
                                            ? "bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/5"
                                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 hover:border-slate-700/50"
                                    )
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <item.icon className={cn(
                                            "w-5 h-5 mr-3 transition-colors duration-200",
                                            isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300"
                                        )} />
                                        {item.label}
                                        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(20,184,166,0.8)]"></div>}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                </div>
                <div className="p-4 border-t border-slate-800/60 relative z-10 space-y-3">
                    <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-800/50 flex items-center mb-2">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold mr-3 border border-slate-600">
                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{user?.username || 'Admin'}</p>
                            <p className="text-xs text-slate-400 truncate">Administrator</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="flex items-center justify-center w-full px-4 py-2.5 rounded-xl text-sm font-bold text-slate-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 border border-transparent transition-all group"
                    >
                        <LogOut className="w-4 h-4 mr-2 group-hover:text-red-400 transition-colors" />
                        {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Topbar */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center">
                        <button className="md:hidden mr-4 text-gray-500 hover:text-gray-700">
                            <Menu className="w-6 h-6" />
                        </button>
                        <h1 className="text-xl font-semibold text-gray-800">
                            Navigation Path
                        </h1>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center bg-gray-100 rounded-full px-3 py-1 text-sm font-medium text-gray-600">
                            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                            CPU: {systemMetrics?.cpuPercent ?? 0}% | RAM: {((systemMetrics?.ramUsedMb ?? 0) / 1024).toFixed(1)}GB
                        </div>
                        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                            <Bell className="w-5 h-5" />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-6">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
