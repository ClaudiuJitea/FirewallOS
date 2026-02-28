import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, Play, ShieldAlert, X, AlertOctagon, CheckCircle2, Cpu } from 'lucide-react';
import { useAuthStore } from '../store';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import * as isoCountries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

isoCountries.registerLocale(enLocale);

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface DNSRule {
    id: number;
    domain: string;
    action: 'ALLOW' | 'BLOCK';
    status: number;
}

interface CountryRule {
    id: number;
    country_code: string;
    action: 'ALLOW' | 'BLOCK';
    status: number;
}

interface DNSLog {
    id: number;
    domain: string;
    ip_address: string;
    country_code: string;
    latitude: number | null;
    longitude: number | null;
    action: 'ALLOW' | 'BLOCK';
    timestamp: string;
}

const ZONE_MAP: Record<string, string[]> = {
    'Europe': ['RO', 'DE', 'FR', 'GB', 'IT', 'ES', 'PL', 'UA', 'NL', 'BE', 'SE', 'DK', 'FI', 'NO', 'AT', 'CH', 'GR', 'PT', 'CZ', 'HU', 'IE'],
    'North America': ['US', 'CA', 'MX'],
    'Asia': ['CN', 'JP', 'IN', 'KR', 'ID', 'PH', 'VN', 'TR', 'TH', 'PK', 'BD', 'IQ', 'IR', 'SA', 'MY', 'IL', 'AE', 'SG'],
    'South America': ['BR', 'AR', 'CO', 'PE', 'VE', 'CL', 'EC', 'BO', 'PY', 'UY'],
    'Africa': ['NG', 'EG', 'ZA', 'KE', 'MA', 'DZ', 'GH', 'ET', 'TZ'],
    'Oceania': ['AU', 'NZ', 'FJ']
};

export const DNSFiltering = () => {
    const [rules, setRules] = useState<DNSRule[]>([]);
    const [countryRules, setCountryRules] = useState<CountryRule[]>([]);
    const [logs, setLogs] = useState<DNSLog[]>([]);
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<DNSRule | null>(null);
    const token = useAuthStore(state => state.token);
    const [dnsStatus, setDnsStatus] = useState<'synced' | 'error' | 'unknown'>('unknown');

    // Map Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, countryCode: string, countryName: string } | null>(null);

    // Form State for Rules
    const [domain, setDomain] = useState('');
    const [action, setAction] = useState<'ALLOW' | 'BLOCK'>('BLOCK');
    const [status, setStatus] = useState(1);

    // Form State for Simulator
    const [testDomain, setTestDomain] = useState('');
    const [simulating, setSimulating] = useState(false);
    const [simResult, setSimResult] = useState<DNSLog | null>(null);

    const fetchRulesAndCountry = async () => {
        if (!token) return;
        try {
            const [rulesRes, countryRulesRes] = await Promise.all([
                fetch('/api/dns/rules', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
                fetch('/api/dns/country-rules', { headers: { Authorization: `Bearer ${token}` } })
            ]);
            if (rulesRes.ok) setRules(await rulesRes.json());
            if (countryRulesRes.ok) setCountryRules(await countryRulesRes.json());
        } catch (e) {
            console.error("Failed to fetch DNS rules/country rules");
        }
    };

    const fetchDnsLogs = async () => {
        if (!token) return;
        try {
            const logsRes = await fetch('/api/dns/logs', {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            if (logsRes.ok) setLogs(await logsRes.json());
        } catch (e) {
            console.error("Failed to fetch DNS logs");
        }
    };

    const fetchDnsStatus = async () => {
        try {
            const res = await fetch('/api/system/nft-status', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setDnsStatus(data.dnsStatus?.running ? 'synced' : 'error');
            } else {
                setDnsStatus('error');
            }
        } catch { setDnsStatus('error'); }
    };

    useEffect(() => {
        if (!token) return;
        fetchRulesAndCountry();
        fetchDnsLogs();
        fetchDnsStatus();
        const logsInterval = setInterval(fetchDnsLogs, 1500);
        const metadataInterval = setInterval(fetchRulesAndCountry, 10000);

        const handleClickOutside = () => setContextMenu(null);
        document.addEventListener('click', handleClickOutside);

        return () => {
            clearInterval(logsInterval);
            clearInterval(metadataInterval);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [token]);

    const handleDeleteRule = async (id: number) => {
        if (!confirm('Delete this rule?')) return;
        try {
            const res = await fetch(`/api/dns/rules/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                fetchRulesAndCountry();
                fetchDnsLogs();
            }
        } catch (e) {
            console.error('Failed to delete rule');
        }
    };

    const handleToggleRuleStatus = async (rule: DNSRule) => {
        try {
            const res = await fetch(`/api/dns/rules/${rule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...rule, status: rule.status ? 0 : 1 })
            });
            if (res.ok) {
                fetchRulesAndCountry();
                fetchDnsLogs();
            }
        } catch (e) {
            console.error('Failed to update rule status');
        }
    };

    const openRuleModal = (rule?: DNSRule) => {
        if (rule) {
            setEditingRule(rule);
            setDomain(rule.domain);
            setAction(rule.action);
            setStatus(rule.status);
        } else {
            setEditingRule(null);
            setDomain('');
            setAction('BLOCK');
            setStatus(1);
        }
        setIsRuleModalOpen(true);
    };

    const handleSaveRule = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = { domain, action, status };
        try {
            const url = editingRule ? `/api/dns/rules/${editingRule.id}` : '/api/dns/rules';
            const method = editingRule ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsRuleModalOpen(false);
                fetchRulesAndCountry();
                fetchDnsLogs();
            }
        } catch (err) {
            console.error('Failed to save DNS rule');
        }
    };

    const handleSimulate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!testDomain) return;
        setSimulating(true);
        setSimResult(null);
        try {
            const res = await fetch('/api/dns/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ domain: testDomain })
            });
            if (res.ok) {
                const result = await res.json();
                setSimResult(result);
                fetchDnsLogs(); // Refresh feed immediately
                fetchRulesAndCountry();
            }
        } catch (err) {
            console.error('Failed to simulate');
        } finally {
            setSimulating(false);
        }
    };

    const handleCountryRule = async (countryCode: string, action: 'ALLOW' | 'BLOCK') => {
        try {
            // First check if rule already exists and delete it
            const existingRule = countryRules.find(r => r.country_code === countryCode);
            if (existingRule) {
                await fetch(`/api/dns/country-rules/${existingRule.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            // Create new rule
            await fetch('/api/dns/country-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ country_code: countryCode, action, status: 1 })
            });

            fetchRulesAndCountry();
            fetchDnsLogs();
            setContextMenu(null);
        } catch (e) {
            console.error('Failed to set country rule');
        }
    };

    const handleClearCountryRule = async (countryCode: string) => {
        const existingRule = countryRules.find(r => r.country_code === countryCode);
        if (!existingRule) return;

        try {
            await fetch(`/api/dns/country-rules/${existingRule.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchRulesAndCountry();
            fetchDnsLogs();
            setContextMenu(null);
        } catch (e) {
            console.error('Failed to clear country rule');
        }
    };

    const handleZoneRule = async (zone: string, action: 'ALLOW' | 'BLOCK') => {
        const countries = ZONE_MAP[zone];
        if (!countries) return;

        try {
            // Very naive batch processing: could be optimized later in backend
            await Promise.all(countries.map(async (code) => {
                const existingRule = countryRules.find(r => r.country_code === code);
                if (existingRule) {
                    await fetch(`/api/dns/country-rules/${existingRule.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                }
                await fetch('/api/dns/country-rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ country_code: code, action, status: 1 })
                });
            }));
            fetchRulesAndCountry();
            fetchDnsLogs();
        } catch (e) {
            console.error('Failed to set zone rules');
        }
    };

    const getIsoA2 = (geo: any): string => {
        if (geo.id) {
            const alpha2 = isoCountries.numericToAlpha2(geo.id);
            if (alpha2) return alpha2;
        }
        return geo.properties?.iso_a2 || 'Unknown';
    };

    const handleMapContextMenu = (e: React.MouseEvent, geo: any) => {
        e.preventDefault();
        const countryName = geo.properties.name || isoCountries.getName(getIsoA2(geo), "en");
        const countryCode = getIsoA2(geo);

        if (countryCode !== 'Unknown') {
            setContextMenu({ x: e.clientX, y: e.clientY, countryCode: countryCode, countryName });
        }
    };

    const getGeographyColor = (geo: any) => {
        const countryCode = getIsoA2(geo);
        const rule = countryRules.find(r => r.country_code === countryCode && r.status === 1);
        if (rule) {
            return rule.action === 'BLOCK' ? '#fca5a5' : '#86efac'; // Faint red/green
        }
        return '#EAEAEC'; // Default
    };

    const getGeographyHoverColor = (geo: any) => {
        const countryCode = getIsoA2(geo);
        const rule = countryRules.find(r => r.country_code === countryCode && r.status === 1);
        if (rule) {
            return rule.action === 'BLOCK' ? '#f87171' : '#4ade80'; // Darker red/green
        }
        return '#D6D6DA'; // Default hover
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">DNS Filtering & GEO IP</h2>
                    <p className="text-gray-500 text-sm mt-1">Block domains and visualize blocked traffic</p>
                </div>
                <div className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-bold border ${dnsStatus === 'synced' ? 'bg-green-50 text-green-700 border-green-200' :
                    dnsStatus === 'error' ? 'bg-red-50 text-red-600 border-red-200' :
                        'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                    <Cpu className="w-3.5 h-3.5" />
                    {dnsStatus === 'synced' ? 'dnsmasq Active' : dnsStatus === 'error' ? 'dnsmasq Error' : 'Checking...'}
                </div>
            </div>

            {/* GEO IP: Full-width map */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <ShieldAlert className="w-5 h-5 mr-2 text-primary" /> Global Traffic Map
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '380px' }}>
                    <ComposableMap projection="geoMercator" height={340}>
                        <ZoomableGroup center={[0, 20]} zoom={1} minZoom={1} maxZoom={8}>
                            <Geographies geography={geoUrl}>
                                {({ geographies }) =>
                                    geographies.map((geo) => (
                                        <Geography
                                            key={geo.rsmKey}
                                            geography={geo}
                                            fill={getGeographyColor(geo)}
                                            stroke="#FFFFFF"
                                            strokeWidth={0.5}
                                            onContextMenu={(e) => handleMapContextMenu(e, geo)}
                                            style={{
                                                default: { outline: 'none' },
                                                hover: { fill: getGeographyHoverColor(geo), outline: 'none', cursor: 'context-menu' },
                                                pressed: { outline: 'none' },
                                            }}
                                        />
                                    ))
                                }
                            </Geographies>
                            {logs.filter(log => log.latitude !== null && log.longitude !== null).slice().reverse().map((log, idx) => (
                                <Marker key={idx} coordinates={[log.longitude!, log.latitude!]}>
                                    <circle r={3} fill={log.action === 'BLOCK' ? '#ef4444' : '#22c55e'} stroke="#fff" strokeWidth={0.5} opacity={1} />
                                </Marker>
                            ))}
                        </ZoomableGroup>
                    </ComposableMap>
                </div>
                <div className="mt-3 flex justify-between items-center text-xs text-gray-500 font-medium">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-red-300 mr-2"></span>Blocked Country</div>
                        <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-green-300 mr-2"></span>Allowed Country</div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>Blocked Query</div>
                        <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>Allowed Query</div>
                    </div>
                </div>
            </div>

            {/* Config Row: Zone Config | Filter Rules | DNS Simulator */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Quick Zone Config */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <h3 className="text-base font-bold text-gray-800 mb-3">Quick Zone Config</h3>
                    <div className="space-y-2">
                        {Object.entries(ZONE_MAP).map(([zone, countries]) => {
                            const blockCount = countries.filter(code => countryRules.some(r => r.country_code === code && r.action === 'BLOCK')).length;
                            const allowCount = countries.filter(code => countryRules.some(r => r.country_code === code && r.action === 'ALLOW')).length;

                            let zoneState: 'MIXED' | 'BLOCK' | 'ALLOW' | 'NONE' = 'NONE';
                            if (blockCount > 0 && allowCount > 0) zoneState = 'MIXED';
                            else if (blockCount === countries.length) zoneState = 'BLOCK';
                            else if (allowCount === countries.length) zoneState = 'ALLOW';
                            else if (blockCount > 0) zoneState = 'MIXED';
                            else if (allowCount > 0) zoneState = 'MIXED';

                            return (
                                <div key={zone} className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors border ${zoneState === 'BLOCK' ? 'bg-red-50 border-red-200' :
                                    zoneState === 'ALLOW' ? 'bg-green-50 border-green-200' :
                                        zoneState === 'MIXED' ? 'bg-amber-50 border-amber-200' :
                                            'bg-gray-50 border-gray-100 hover:border-gray-200'
                                    }`}>
                                    <div className="flex flex-col">
                                        <span className={`text-sm font-bold ${zoneState === 'BLOCK' ? 'text-red-700' :
                                            zoneState === 'ALLOW' ? 'text-green-700' :
                                                zoneState === 'MIXED' ? 'text-amber-700' :
                                                    'text-gray-800'
                                            }`}>{zone}</span>
                                        {zoneState === 'MIXED' && <span className="text-[10px] uppercase text-amber-600 font-bold mt-0.5">Mixed Rules</span>}
                                    </div>
                                    <div className="flex space-x-1">
                                        <button onClick={() => handleZoneRule(zone, 'BLOCK')} title="Block entirely" className={`p-1.5 rounded-full transition-colors ${zoneState === 'BLOCK' ? 'bg-red-500 text-white' : 'text-gray-400 hover:bg-red-100 hover:text-red-600'}`}>
                                            <AlertOctagon className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleZoneRule(zone, 'ALLOW')} title="Allow entirely" className={`p-1.5 rounded-full transition-colors ${zoneState === 'ALLOW' ? 'bg-green-500 text-white' : 'text-gray-400 hover:bg-green-100 hover:text-green-600'}`}>
                                            <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Filter Rules */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-base font-bold text-gray-800">Filter Rules</h3>
                        <button onClick={() => openRuleModal()} className="text-primary hover:text-[#00796B] p-1 bg-primary/10 rounded hover:bg-primary/20 transition-colors">
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-2 overflow-y-auto flex-1 max-h-[280px] pr-1">
                        {rules.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-4">No rules defined</p>
                        ) : rules.map(rule => (
                            <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-sm transition-all group">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-800 truncate">{rule.domain}</p>
                                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded mt-1 ${rule.action === 'BLOCK' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{rule.action}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => handleToggleRuleStatus(rule)} className={`p-1.5 rounded-full ${rule.status ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}>
                                        <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => openRuleModal(rule)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* DNS Query Simulator */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
                    <h3 className="text-base font-bold text-gray-800 mb-3">DNS Query Simulator</h3>
                    <form onSubmit={handleSimulate} className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Domain to test</label>
                            <input type="text" value={testDomain} onChange={e => setTestDomain(e.target.value)} required placeholder="e.g. google.com or badsite.ru" className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                        </div>
                        <button disabled={simulating} type="submit" className="bg-primary hover:bg-[#00796B] text-white px-6 py-2 rounded-lg font-medium flex items-center justify-center transition-colors disabled:opacity-70 w-full h-10">
                            {simulating ? 'Checking...' : <><Play className="w-4 h-4 mr-2" /> Simulate</>}
                        </button>
                    </form>
                    {simResult && (
                        <div className={`mt-4 p-3 rounded-lg flex items-start space-x-3 ${simResult.action === 'BLOCK' ? 'bg-red-50 text-red-800 border-l-4 border-red-500' : 'bg-green-50 text-green-800 border-l-4 border-green-500'}`}>
                            {simResult.action === 'BLOCK' ? <AlertOctagon className="w-5 h-5 shrink-0 text-red-500 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 shrink-0 text-green-500 mt-0.5" />}
                            <div className="min-w-0">
                                <h4 className="font-bold text-xs uppercase tracking-wide opacity-80">{simResult.action}</h4>
                                <p className="font-semibold text-sm truncate mt-0.5" title={simResult.domain}>{simResult.domain}</p>
                                <p className="text-xs opacity-80 mt-1">IP: <span className="font-mono bg-white/50 px-1 py-0.5 rounded">{simResult.ip_address}</span> ({simResult.country_code})</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Full-width Live Queries Feed */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Live Queries Feed</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Recent DNS answers observed from client traffic</p>
                    </div>
                    <span className="text-xs font-semibold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200">
                        {logs.length} recent
                    </span>
                </div>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                    <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wider font-extrabold text-gray-500">
                        <div className="col-span-2">Time</div>
                        <div className="col-span-4">Domain</div>
                        <div className="col-span-2">Country</div>
                        <div className="col-span-2">Resolved IP</div>
                        <div className="col-span-2 text-right">Result</div>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto">
                        {logs.length === 0 ? (
                            <div className="py-12 text-center">
                                <p className="text-sm font-medium text-gray-500">No queries logged yet</p>
                                <p className="text-xs text-gray-400 mt-1">Run DNS lookups from a client and entries will appear here.</p>
                            </div>
                        ) : logs.map(log => (
                            <div key={log.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-slate-50/80 transition-colors text-sm items-center">
                                <div className="col-span-2 text-xs text-gray-500 font-semibold tabular-nums">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </div>
                                <div className="col-span-4 min-w-0">
                                    <p className="font-semibold text-gray-800 truncate" title={log.domain}>{log.domain}</p>
                                </div>
                                <div className="col-span-2 text-xs text-gray-500 font-medium">{log.country_code}</div>
                                <div className="col-span-2 text-xs text-gray-600 font-mono truncate bg-gray-50 border border-gray-100 rounded px-2 py-1 h-fit" title={log.ip_address}>
                                    {log.ip_address}
                                </div>
                                <div className="col-span-2 flex justify-end">
                                    <span className={`shrink-0 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full tracking-wide ${log.action === 'BLOCK' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                        {log.action}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {isRuleModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">{editingRule ? 'Edit DNS Rule' : 'New DNS Rule'}</h3>
                            <button onClick={() => setIsRuleModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSaveRule} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                                    <input type="text" value={domain} onChange={e => setDomain(e.target.value)} required placeholder="e.g. *.ru or examplesite.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                    <p className="text-xs text-gray-500 mt-1">Use *.domain.com for wildcards</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                                    <select value={action} onChange={e => setAction(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                                        <option value="ALLOW">ALLOW</option>
                                        <option value="BLOCK">BLOCK</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-8 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsRuleModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">Save Rule</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Context Menu Portal */}
            {contextMenu && createPortal(
                <div
                    className="fixed z-[200] bg-white rounded-lg shadow-xl border border-gray-100 py-2 min-w-[160px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-2 border-b border-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {contextMenu.countryName} ({contextMenu.countryCode})
                    </div>
                    <button
                        onClick={() => handleCountryRule(contextMenu.countryCode, 'BLOCK')}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center"
                    >
                        <AlertOctagon className="w-4 h-4 mr-2" /> Block Country
                    </button>
                    <button
                        onClick={() => handleCountryRule(contextMenu.countryCode, 'ALLOW')}
                        className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors flex items-center"
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Allow Country
                    </button>

                    {countryRules.some(r => r.country_code === contextMenu.countryCode) && (
                        <>
                            <div className="border-t border-gray-100 my-1"></div>
                            <button
                                onClick={() => handleClearCountryRule(contextMenu.countryCode)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center"
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> Remove Rule
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};
