import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Shield, Terminal, Wifi, Route, Hammer, Play, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store';

type SystemDump = {
    rules: any[];
    natRules: any[];
    routes: any[];
    dnsRules: any[];
    countryRules: any[];
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

type ActiveLease = {
    expires: string;
    mac: string;
    ip: string;
    hostname: string;
    clientId: string;
};

export const BackendConsole = () => {
    const token = useAuthStore((state) => state.token);
    const [dump, setDump] = useState<SystemDump | null>(null);
    const [status, setStatus] = useState<NftStatus | null>(null);
    const [activeLeases, setActiveLeases] = useState<ActiveLease[]>([]);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastApplyMessage, setLastApplyMessage] = useState<string>('');
    const [showRawDump, setShowRawDump] = useState(false);
    const [shellCommand, setShellCommand] = useState('ip -br addr');
    const [shellRunning, setShellRunning] = useState(false);
    const [shellOutput, setShellOutput] = useState('');
    const [shellError, setShellError] = useState('');
    const [shellExitCode, setShellExitCode] = useState<number | null>(null);
    const [shellTimedOut, setShellTimedOut] = useState(false);

    const fetchAll = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const [dumpRes, statusRes, leasesRes] = await Promise.all([
                fetch('/api/system/dump', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/system/nft-status', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/dhcp/active-leases', { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (!dumpRes.ok || !statusRes.ok || !leasesRes.ok) {
                throw new Error('One or more diagnostics endpoints failed');
            }

            const [dumpData, statusData, leasesData] = await Promise.all([
                dumpRes.json(),
                statusRes.json(),
                leasesRes.json(),
            ]);

            setDump(dumpData);
            setStatus(statusData);
            setActiveLeases(Array.isArray(leasesData) ? leasesData : []);
        } catch (e) {
            console.error('Failed to fetch diagnostics', e);
            setError('Failed to load diagnostics from backend.');
        } finally {
            setLoading(false);
        }
    };

    const handleForceApply = async () => {
        if (!token) return;
        setApplying(true);
        setLastApplyMessage('');
        try {
            const res = await fetch('/api/system/apply', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setLastApplyMessage('Apply completed successfully.');
            } else {
                const data = await res.json().catch(() => ({}));
                setLastApplyMessage(`Apply failed: ${data.rulesError || data.routesError || data.dnsError || 'Unknown error'}`);
            }
        } catch {
            setLastApplyMessage('Apply failed: backend unreachable.');
        } finally {
            setApplying(false);
            fetchAll();
        }
    };

    useEffect(() => {
        fetchAll();
        const id = setInterval(fetchAll, 7000);
        return () => clearInterval(id);
    }, [token]);

    const runShellCommand = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!token || shellRunning) return;
        const command = shellCommand.trim();
        if (!command) return;

        setShellRunning(true);
        setShellOutput('');
        setShellError('');
        setShellExitCode(null);
        setShellTimedOut(false);

        try {
            const res = await fetch('/api/system/shell', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ command })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setShellError(data?.error || 'Command failed');
                return;
            }

            setShellOutput(String(data?.stdout || ''));
            setShellError(String(data?.stderr || ''));
            setShellExitCode(typeof data?.exitCode === 'number' ? data.exitCode : null);
            setShellTimedOut(!!data?.timedOut);
        } catch {
            setShellError('Failed to execute command: backend unreachable.');
        } finally {
            setShellRunning(false);
        }
    };

    const diagnostics = useMemo(() => {
        const dbRuleCount = dump?.rules?.length ?? 0;
        const dbNatCount = dump?.natRules?.length ?? 0;
        const dbRouteCount = dump?.routes?.length ?? 0;
        const nftRuleset = status?.nftRuleset || '';
        const routingTable = status?.routingTable || '';
        const dnsRunning = !!status?.dnsStatus?.running;

        const nftCommentCount = (nftRuleset.match(/comment "/g) || []).length;
        const missingRoutes = (dump?.routes || []).filter((r) => r?.destination && !routingTable.includes(String(r.destination)));

        const firewallOutOfSync = dbRuleCount + dbNatCount > 0 && nftCommentCount === 0;
        const routingOutOfSync = missingRoutes.length > 0;
        const dnsOutOfSync = !dnsRunning;

        return {
            dbRuleCount,
            dbNatCount,
            dbRouteCount,
            nftCommentCount,
            missingRoutes,
            firewallOutOfSync,
            routingOutOfSync,
            dnsOutOfSync,
            dnsRunning,
        };
    }, [dump, status]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                        <Terminal className="w-6 h-6 mr-2 text-primary" />
                        Backend Diagnostics Console
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Real DB vs runtime OS state, sync checks, and apply controls</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchAll}
                        disabled={loading}
                        className="h-9 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 rounded-lg text-sm font-medium flex items-center transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={handleForceApply}
                        disabled={applying}
                        className="h-9 bg-gray-900 text-white hover:bg-black px-3 rounded-lg text-sm font-medium flex items-center transition-colors disabled:opacity-50"
                    >
                        <Hammer className={`w-4 h-4 mr-1.5 ${applying ? 'animate-pulse' : ''}`} />
                        Force Apply
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {lastApplyMessage && (
                <div className={`rounded-lg px-4 py-3 text-sm border ${lastApplyMessage.includes('success') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {lastApplyMessage}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">DB Rules</div>
                    <div className="mt-2 text-2xl font-bold text-gray-800">{diagnostics.dbRuleCount + diagnostics.dbNatCount}</div>
                    <div className="text-xs text-gray-500 mt-1">{diagnostics.dbRuleCount} firewall + {diagnostics.dbNatCount} NAT</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Runtime nft Entries</div>
                    <div className="mt-2 text-2xl font-bold text-gray-800">{diagnostics.nftCommentCount}</div>
                    <div className="text-xs text-gray-500 mt-1">Rules with managed comments</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">DB Routes</div>
                    <div className="mt-2 text-2xl font-bold text-gray-800">{diagnostics.dbRouteCount}</div>
                    <div className="text-xs text-gray-500 mt-1">{diagnostics.missingRoutes.length} missing from runtime table</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-bold">Active DHCP Leases</div>
                    <div className="mt-2 text-2xl font-bold text-gray-800">{activeLeases.length}</div>
                    <div className="text-xs text-gray-500 mt-1">Live from dnsmasq lease file</div>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Drift Summary</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center text-gray-700"><Shield className="w-4 h-4 mr-2 text-gray-500" />Firewall Rules Sync</span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${diagnostics.firewallOutOfSync ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {diagnostics.firewallOutOfSync ? <AlertTriangle className="w-3.5 h-3.5 mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                            {diagnostics.firewallOutOfSync ? 'OUT OF SYNC' : 'IN SYNC'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center text-gray-700"><Route className="w-4 h-4 mr-2 text-gray-500" />Routing Sync</span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${diagnostics.routingOutOfSync ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {diagnostics.routingOutOfSync ? <AlertTriangle className="w-3.5 h-3.5 mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                            {diagnostics.routingOutOfSync ? 'MISSING ROUTES' : 'IN SYNC'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center text-gray-700"><Wifi className="w-4 h-4 mr-2 text-gray-500" />dnsmasq Runtime</span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${diagnostics.dnsOutOfSync ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {diagnostics.dnsOutOfSync ? <AlertTriangle className="w-3.5 h-3.5 mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                            {diagnostics.dnsRunning ? 'RUNNING' : 'STOPPED'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center">
                            <Database className="w-4 h-4 mr-2 text-primary" />
                            DB Snapshot
                        </h3>
                        <button
                            onClick={() => setShowRawDump((v) => !v)}
                            className="text-xs font-medium px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                        >
                            {showRawDump ? 'Hide Raw' : 'Show Raw'}
                        </button>
                    </div>
                    <div className="p-4 space-y-2 text-sm text-gray-700">
                        <div>Firewall Rules: <span className="font-semibold">{diagnostics.dbRuleCount}</span></div>
                        <div>NAT Rules: <span className="font-semibold">{diagnostics.dbNatCount}</span></div>
                        <div>Routes: <span className="font-semibold">{diagnostics.dbRouteCount}</span></div>
                        <div>DNS Rules: <span className="font-semibold">{dump?.dnsRules?.length ?? 0}</span></div>
                        <div>Country Rules: <span className="font-semibold">{dump?.countryRules?.length ?? 0}</span></div>
                    </div>
                    {showRawDump && (
                        <div className="px-4 pb-4">
                            <pre className="text-xs whitespace-pre-wrap bg-gray-900 text-green-400 rounded-lg p-4 overflow-auto max-h-80">
                                {JSON.stringify(dump, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Active DHCP Leases</h3>
                    </div>
                    <div className="overflow-auto max-h-[330px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold bg-gray-50/60">
                                    <th className="px-3 py-2">IP</th>
                                    <th className="px-3 py-2">MAC</th>
                                    <th className="px-3 py-2">Hostname</th>
                                    <th className="px-3 py-2">Expires</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeLeases.length === 0 ? (
                                    <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">No active leases.</td></tr>
                                ) : (
                                    activeLeases.map((lease, i) => (
                                        <tr key={`${lease.ip}-${i}`} className="border-b border-gray-50">
                                            <td className="px-3 py-2 text-xs font-mono text-gray-800">{lease.ip}</td>
                                            <td className="px-3 py-2 text-xs font-mono text-gray-600">{lease.mac}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{lease.hostname || '—'}</td>
                                            <td className="px-3 py-2 text-xs text-gray-500">{lease.expires === 'never' ? 'never' : new Date(lease.expires).toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-black/30 text-sm font-mono text-gray-300">dnsmasq Active Config</div>
                    <pre className="p-4 text-xs text-yellow-200 whitespace-pre-wrap overflow-auto max-h-[320px]">{status?.dnsStatus?.config || '(no data)'}</pre>
                </div>
                <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-black/30 text-sm font-mono text-gray-300">dnsmasq Recent Log</div>
                    <pre className="p-4 text-xs text-purple-200 whitespace-pre-wrap overflow-auto max-h-[320px]">{status?.dnsStatus?.logTail || '(no data)'}</pre>
                </div>
            </div>

            <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 bg-black/30 flex items-center justify-between">
                    <span className="text-sm font-mono text-gray-300">Firewall Container Shell</span>
                    <div className="flex items-center gap-2 text-xs">
                        {shellExitCode !== null && (
                            <span className={`px-2 py-1 rounded border ${shellExitCode === 0 ? 'text-green-300 border-green-700/50 bg-green-900/20' : 'text-red-300 border-red-700/50 bg-red-900/20'}`}>
                                exit {shellExitCode}{shellTimedOut ? ' (timeout)' : ''}
                            </span>
                        )}
                    </div>
                </div>
                <form onSubmit={runShellCommand} className="p-4 border-b border-gray-800 bg-black/20">
                    <div className="flex flex-col md:flex-row gap-2">
                        <input
                            type="text"
                            value={shellCommand}
                            onChange={(e) => setShellCommand(e.target.value)}
                            placeholder="Run command in backend container (e.g. ip route)"
                            className="flex-1 bg-[#111827] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                            type="submit"
                            disabled={shellRunning}
                            className="h-10 px-4 bg-primary hover:bg-[#00796B] disabled:opacity-60 text-white rounded text-sm font-semibold flex items-center justify-center"
                        >
                            <Play className={`w-4 h-4 mr-1.5 ${shellRunning ? 'animate-pulse' : ''}`} />
                            {shellRunning ? 'Running...' : 'Run'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShellOutput('');
                                setShellError('');
                                setShellExitCode(null);
                                setShellTimedOut(false);
                            }}
                            className="h-10 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-semibold flex items-center justify-center"
                        >
                            <Trash2 className="w-4 h-4 mr-1.5" />
                            Clear
                        </button>
                    </div>
                </form>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
                    <div className="border-r border-gray-800">
                        <div className="px-4 py-2 text-xs uppercase tracking-wider text-gray-400 bg-black/30 border-b border-gray-800">STDOUT</div>
                        <pre className="p-4 text-xs text-green-200 whitespace-pre-wrap overflow-auto max-h-[320px]">{shellOutput || '(no output)'}</pre>
                    </div>
                    <div>
                        <div className="px-4 py-2 text-xs uppercase tracking-wider text-gray-400 bg-black/30 border-b border-gray-800">STDERR</div>
                        <pre className="p-4 text-xs text-red-200 whitespace-pre-wrap overflow-auto max-h-[320px]">{shellError || '(no error output)'}</pre>
                    </div>
                </div>
            </div>
        </div>
    );
};
