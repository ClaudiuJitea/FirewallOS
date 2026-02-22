import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Eraser, Hammer, RefreshCw, RotateCcw, Server, Shield, Wifi } from 'lucide-react';
import { useAuthStore } from '../store';

type SystemInfo = {
    hostname: string;
    uptime: string;
    kernel: string;
    osName: string;
    nodeVersion: string;
    memory: string;
    diskRoot: string;
    now: string;
};

type NftStatus = {
    nftRuleset: string;
    routingTable: string;
    dnsStatus: {
        running: boolean;
        config: string;
        logTail: string;
    };
};

export const SystemSettings = () => {
    const token = useAuthStore((state) => state.token);
    const [info, setInfo] = useState<SystemInfo | null>(null);
    const [status, setStatus] = useState<NftStatus | null>(null);
    const [dump, setDump] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busyAction, setBusyAction] = useState<string>('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const authHeaders = { Authorization: `Bearer ${token}` };

    const fetchAll = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [infoRes, statusRes, dumpRes] = await Promise.all([
                fetch('/api/system/info', { headers: authHeaders }),
                fetch('/api/system/nft-status', { headers: authHeaders }),
                fetch('/api/system/dump', { headers: authHeaders }),
            ]);
            if (!infoRes.ok || !statusRes.ok || !dumpRes.ok) {
                throw new Error('One or more endpoints failed');
            }
            const [infoData, statusData, dumpData] = await Promise.all([
                infoRes.json(),
                statusRes.json(),
                dumpRes.json(),
            ]);
            setInfo(infoData);
            setStatus(statusData);
            setDump(dumpData);
        } catch (e) {
            console.error('Failed to fetch system settings', e);
            setMessage({ type: 'error', text: 'Failed to fetch system settings data.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!token) return;
        fetchAll();
    }, [token]);

    const runAction = async (id: string, url: string, label: string) => {
        setBusyAction(id);
        setMessage(null);
        try {
            const res = await fetch(url, { method: 'POST', headers: authHeaders });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || body.rulesError || body.routesError || body.dnsError || body.dhcpError || 'Unknown error');
            }
            setMessage({ type: 'success', text: `${label} completed.` });
            await fetchAll();
        } catch (e: any) {
            setMessage({ type: 'error', text: `${label} failed: ${e.message}` });
        } finally {
            setBusyAction('');
        }
    };

    const exportSnapshot = () => {
        const blob = new Blob([JSON.stringify(dump || {}, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `firewall-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const serviceRows = [
        { name: 'Firewall Runtime (nftables)', ok: !String(status?.nftRuleset || '').includes('Unable to retrieve'), icon: Shield },
        { name: 'DNS/DHCP Service (dnsmasq)', ok: !!status?.dnsStatus?.running, icon: Wifi },
        { name: 'Backend API', ok: !!info, icon: Server },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">System Settings</h2>
                    <p className="text-gray-500 text-sm mt-1">Service reset, runtime recovery, and system maintenance</p>
                </div>
                <button
                    onClick={fetchAll}
                    disabled={loading}
                    className="h-9 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 rounded-lg text-sm font-medium flex items-center transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {message && (
                <div className={`rounded-lg px-4 py-3 text-sm border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {message.text}
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Service Health</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {serviceRows.map((row) => (
                        <div key={row.name} className="border border-gray-100 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-medium text-gray-700 flex items-center">
                                    <row.icon className="w-4 h-4 mr-2 text-gray-500" />
                                    {row.name}
                                </div>
                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${row.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {row.ok ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
                                    {row.ok ? 'OK' : 'ERROR'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Maintenance Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <button
                        onClick={() => runAction('apply', '/api/system/apply', 'Apply configuration to runtime')}
                        disabled={!!busyAction}
                        className="h-10 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                        <Hammer className="w-4 h-4 mr-1.5" />
                        Apply Runtime
                    </button>
                    <button
                        onClick={() => runAction('reset', '/api/system/reset-runtime', 'Runtime reset')}
                        disabled={!!busyAction}
                        className="h-10 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                        Reset Runtime Services
                    </button>
                    <button
                        onClick={() => runAction('dnsmasq', '/api/system/services/restart-dnsmasq', 'DNS/DHCP service restart')}
                        disabled={!!busyAction}
                        className="h-10 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                        <Wifi className="w-4 h-4 mr-1.5" />
                        Restart DNS/DHCP
                    </button>
                    <button
                        onClick={() => runAction('clearlog', '/api/system/logs/dnsmasq/clear', 'dnsmasq log clear')}
                        disabled={!!busyAction}
                        className="h-10 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                        <Eraser className="w-4 h-4 mr-1.5" />
                        Clear DNS Logs
                    </button>
                </div>
                {busyAction && (
                    <p className="text-xs text-gray-500 mt-2">Running action: {busyAction}...</p>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">System Information</h3>
                    <div className="space-y-2 text-sm text-gray-700">
                        <div>Host: <span className="font-semibold">{info?.hostname || '—'}</span></div>
                        <div>Uptime: <span className="font-semibold">{info?.uptime || '—'}</span></div>
                        <div>OS: <span className="font-semibold">{info?.osName || '—'}</span></div>
                        <div>Kernel: <span className="font-semibold">{info?.kernel || '—'}</span></div>
                        <div>Node.js: <span className="font-semibold">{info?.nodeVersion || '—'}</span></div>
                        <div className="font-mono text-xs text-gray-600 mt-2">{info?.memory || '—'}</div>
                        <div className="font-mono text-xs text-gray-600">{info?.diskRoot || '—'}</div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Configuration Snapshot</h3>
                    <div className="space-y-2 text-sm text-gray-700 mb-4">
                        <div>Firewall rules: <span className="font-semibold">{dump?.rules?.length ?? 0}</span></div>
                        <div>NAT rules: <span className="font-semibold">{dump?.natRules?.length ?? 0}</span></div>
                        <div>Routes: <span className="font-semibold">{dump?.routes?.length ?? 0}</span></div>
                        <div>DNS rules: <span className="font-semibold">{dump?.dnsRules?.length ?? 0}</span></div>
                        <div>Country rules: <span className="font-semibold">{dump?.countryRules?.length ?? 0}</span></div>
                    </div>
                    <button
                        onClick={exportSnapshot}
                        className="h-9 bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 px-3 rounded-lg text-sm font-medium flex items-center transition-colors"
                    >
                        <Database className="w-4 h-4 mr-1.5" />
                        Export Snapshot JSON
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-black/30 text-sm font-mono text-gray-300">Runtime nftables Ruleset</div>
                    <pre className="p-4 text-xs text-green-400 whitespace-pre-wrap overflow-auto max-h-[300px]">{status?.nftRuleset || '(loading...)'}</pre>
                </div>
                <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-black/30 text-sm font-mono text-gray-300">Routing Table</div>
                    <pre className="p-4 text-xs text-blue-300 whitespace-pre-wrap overflow-auto max-h-[300px]">{status?.routingTable || '(loading...)'}</pre>
                </div>
            </div>
        </div>
    );
};

