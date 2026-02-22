import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, X, Cpu, Wifi, Monitor, RefreshCw, Clock } from 'lucide-react';
import { useAuthStore } from '../store';

interface DhcpPool {
    id: number;
    interface: string;
    range_start: string;
    range_end: string;
    subnet_mask: string;
    gateway: string;
    dns_servers: string;
    lease_time: number;
    domain: string;
    status: number;
}

interface StaticLease {
    id: number;
    pool_id: number;
    mac_address: string;
    ip_address: string;
    hostname: string;
    description: string;
    status: number;
}

interface ActiveLease {
    expires: string;
    mac: string;
    ip: string;
    hostname: string;
    clientId: string;
}

export const DHCP = () => {
    const token = useAuthStore(state => state.token);
    const [pools, setPools] = useState<DhcpPool[]>([]);
    const [staticLeases, setStaticLeases] = useState<StaticLease[]>([]);
    const [activeLeases, setActiveLeases] = useState<ActiveLease[]>([]);
    const [dhcpStatus, setDhcpStatus] = useState<'synced' | 'error' | 'unknown'>('unknown');
    const [interfaces, setInterfaces] = useState<{ id: number; name: string }[]>([]);

    // Pool Modal
    const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
    const [editingPool, setEditingPool] = useState<DhcpPool | null>(null);
    const [poolIface, setPoolIface] = useState('');
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');
    const [subnetMask, setSubnetMask] = useState('255.255.255.0');
    const [gateway, setGateway] = useState('');
    const [dnsServers, setDnsServers] = useState('8.8.8.8,8.8.4.4');
    const [leaseTime, setLeaseTime] = useState(86400);
    const [domain, setDomain] = useState('');

    // Lease Modal
    const [isLeaseModalOpen, setIsLeaseModalOpen] = useState(false);
    const [editingLease, setEditingLease] = useState<StaticLease | null>(null);
    const [leasePoolId, setLeasePoolId] = useState<number>(0);
    const [macAddress, setMacAddress] = useState('');
    const [ipAddress, setIpAddress] = useState('');
    const [hostname, setHostname] = useState('');
    const [description, setDescription] = useState('');

    const fetchPools = async () => {
        try {
            const res = await fetch('/api/dhcp/pools', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setPools(await res.json());
        } catch (e) { console.error('Failed to fetch pools'); }
    };

    const fetchStaticLeases = async () => {
        try {
            const res = await fetch('/api/dhcp/leases', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setStaticLeases(await res.json());
        } catch (e) { console.error('Failed to fetch static leases'); }
    };

    const fetchActiveLeases = async () => {
        try {
            const res = await fetch('/api/dhcp/active-leases', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setActiveLeases(await res.json());
        } catch (e) { console.error('Failed to fetch active leases'); }
    };

    const fetchInterfaces = async () => {
        try {
            const res = await fetch('/api/interfaces', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setInterfaces(await res.json());
        } catch (e) { console.error('Failed to fetch interfaces'); }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/system/nft-status', { headers: { Authorization: `Bearer ${token}` } });
            setDhcpStatus(res.ok ? 'synced' : 'error');
        } catch { setDhcpStatus('error'); }
    };

    useEffect(() => {
        if (!token) return;
        fetchPools();
        fetchStaticLeases();
        fetchActiveLeases();
        fetchInterfaces();
        fetchStatus();

        const activeLeaseTimer = setInterval(fetchActiveLeases, 5000);
        return () => clearInterval(activeLeaseTimer);
    }, [token]);

    // Pool CRUD
    const openPoolModal = (pool?: DhcpPool) => {
        if (pool) {
            setEditingPool(pool);
            setPoolIface(pool.interface);
            setRangeStart(pool.range_start);
            setRangeEnd(pool.range_end);
            setSubnetMask(pool.subnet_mask);
            setGateway(pool.gateway);
            setDnsServers(pool.dns_servers);
            setLeaseTime(pool.lease_time);
            setDomain(pool.domain || '');
        } else {
            setEditingPool(null);
            setPoolIface(interfaces[0]?.name || '');
            setRangeStart('');
            setRangeEnd('');
            setSubnetMask('255.255.255.0');
            setGateway('');
            setDnsServers('8.8.8.8,8.8.4.4');
            setLeaseTime(86400);
            setDomain('');
        }
        setIsPoolModalOpen(true);
    };

    const handleSavePool = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            interface: poolIface, range_start: rangeStart, range_end: rangeEnd,
            subnet_mask: subnetMask, gateway, dns_servers: dnsServers,
            lease_time: leaseTime, domain, status: editingPool ? editingPool.status : 1
        };
        try {
            const url = editingPool ? `/api/dhcp/pools/${editingPool.id}` : '/api/dhcp/pools';
            const method = editingPool ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) { setIsPoolModalOpen(false); fetchPools(); fetchStatus(); }
        } catch (err) { console.error('Failed to save pool'); }
    };

    const handleDeletePool = async (id: number) => {
        if (!confirm('Delete this DHCP pool and all its static leases?')) return;
        try {
            const res = await fetch(`/api/dhcp/pools/${id}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) { fetchPools(); fetchStaticLeases(); }
        } catch (e) { console.error('Failed to delete pool'); }
    };

    const handleTogglePool = async (pool: DhcpPool) => {
        try {
            await fetch(`/api/dhcp/pools/${pool.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...pool, status: pool.status ? 0 : 1 })
            });
            fetchPools();
        } catch (e) { console.error('Failed to toggle pool'); }
    };

    // Static Lease CRUD
    const openLeaseModal = (lease?: StaticLease) => {
        if (lease) {
            setEditingLease(lease);
            setLeasePoolId(lease.pool_id);
            setMacAddress(lease.mac_address);
            setIpAddress(lease.ip_address);
            setHostname(lease.hostname);
            setDescription(lease.description);
        } else {
            setEditingLease(null);
            setLeasePoolId(pools[0]?.id || 0);
            setMacAddress('');
            setIpAddress('');
            setHostname('');
            setDescription('');
        }
        setIsLeaseModalOpen(true);
    };

    const handleSaveLease = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            pool_id: leasePoolId, mac_address: macAddress, ip_address: ipAddress,
            hostname, description, status: editingLease ? editingLease.status : 1
        };
        try {
            const url = editingLease ? `/api/dhcp/leases/${editingLease.id}` : '/api/dhcp/leases';
            const method = editingLease ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) { setIsLeaseModalOpen(false); fetchStaticLeases(); }
        } catch (err) { console.error('Failed to save lease'); }
    };

    const handleDeleteLease = async (id: number) => {
        if (!confirm('Delete this static lease?')) return;
        try {
            const res = await fetch(`/api/dhcp/leases/${id}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) fetchStaticLeases();
        } catch (e) { console.error('Failed to delete lease'); }
    };

    const handleToggleLease = async (lease: StaticLease) => {
        try {
            await fetch(`/api/dhcp/leases/${lease.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...lease, status: lease.status ? 0 : 1 })
            });
            fetchStaticLeases();
        } catch (e) { console.error('Failed to toggle lease'); }
    };

    const formatLeaseTime = (seconds: number) => {
        if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`;
        if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
        return `${Math.round(seconds / 60)}m`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">DHCP Server</h2>
                    <p className="text-gray-500 text-sm mt-1">Manage IP address pools, static leases, and active clients</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-bold border ${dhcpStatus === 'synced' ? 'bg-green-50 text-green-700 border-green-200' :
                        dhcpStatus === 'error' ? 'bg-red-50 text-red-600 border-red-200' :
                            'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                        <Cpu className="w-3.5 h-3.5" />
                        {dhcpStatus === 'synced' ? 'dnsmasq Active' : dhcpStatus === 'error' ? 'DHCP Error' : 'Checking...'}
                    </div>
                    <button onClick={() => openPoolModal()} className="h-9 bg-primary hover:bg-[#00796B] text-white px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-lg shadow-primary/20">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add Pool
                    </button>
                </div>
            </div>

            {/* DHCP Pools */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-sm font-bold text-gray-700 flex items-center uppercase tracking-wider">
                        <Wifi className="w-4 h-4 text-primary mr-2" />
                        Address Pools
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                                <th className="px-3 py-3">Interface</th>
                                <th className="px-3 py-3">IP Range</th>
                                <th className="px-3 py-3">Subnet Mask</th>
                                <th className="px-3 py-3">Gateway</th>
                                <th className="px-3 py-3">DNS</th>
                                <th className="px-3 py-3 w-20">Lease</th>
                                <th className="px-3 py-3 w-16 text-center">Status</th>
                                <th className="px-3 py-3 w-24 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pools.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No DHCP pools configured. Add a pool to start serving addresses.</td></tr>
                            ) : (
                                pools.map(pool => (
                                    <tr key={pool.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                                        <td className="px-3 py-3">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-blue-100 text-blue-700">
                                                {pool.interface || 'ANY'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-sm font-mono text-gray-700">
                                            {pool.range_start} — {pool.range_end}
                                        </td>
                                        <td className="px-3 py-3 text-sm font-mono text-gray-600">{pool.subnet_mask}</td>
                                        <td className="px-3 py-3 text-sm font-mono text-gray-600">{pool.gateway || '—'}</td>
                                        <td className="px-3 py-3 text-sm text-gray-500 max-w-[160px] truncate">{pool.dns_servers}</td>
                                        <td className="px-3 py-3 text-sm text-gray-500 font-medium">{formatLeaseTime(pool.lease_time)}</td>
                                        <td className="px-3 py-3 text-center">
                                            <button onClick={() => handleTogglePool(pool)} className={`${pool.status ? 'text-green-500' : 'text-gray-300'} hover:opacity-80 transition-opacity`}>
                                                {pool.status ? <CheckCircle className="w-5 h-5 mx-auto" /> : <XCircle className="w-5 h-5 mx-auto" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => openPoolModal(pool)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => handleDeletePool(pool.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Static Leases + Active Leases side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Static Leases */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center uppercase tracking-wider">
                            <Monitor className="w-4 h-4 text-primary mr-2" />
                            Static Leases (Reservations)
                        </h3>
                        <button onClick={() => openLeaseModal()} className="h-8 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 rounded-lg text-xs font-medium flex items-center transition-colors border border-gray-200">
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Reservation
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                                    <th className="px-3 py-3">MAC Address</th>
                                    <th className="px-3 py-3">IP Address</th>
                                    <th className="px-3 py-3">Hostname</th>
                                    <th className="px-3 py-3 w-16 text-center">Status</th>
                                    <th className="px-3 py-3 w-20 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staticLeases.length === 0 ? (
                                    <tr><td colSpan={5} className="p-6 text-center text-gray-400 text-sm">No static leases.</td></tr>
                                ) : (
                                    staticLeases.map(lease => (
                                        <tr key={lease.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                                            <td className="px-3 py-3 text-sm font-mono text-gray-700">{lease.mac_address}</td>
                                            <td className="px-3 py-3 text-sm font-mono text-gray-600">{lease.ip_address}</td>
                                            <td className="px-3 py-3 text-sm text-gray-600">{lease.hostname || '—'}</td>
                                            <td className="px-3 py-3 text-center">
                                                <button onClick={() => handleToggleLease(lease)} className={`${lease.status ? 'text-green-500' : 'text-gray-300'} hover:opacity-80 transition-opacity`}>
                                                    {lease.status ? <CheckCircle className="w-4 h-4 mx-auto" /> : <XCircle className="w-4 h-4 mx-auto" />}
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => openLeaseModal(lease)} className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => handleDeleteLease(lease.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Active Leases */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center uppercase tracking-wider">
                            <Clock className="w-4 h-4 text-primary mr-2" />
                            Active Leases (Live)
                        </h3>
                        <button onClick={fetchActiveLeases} className="h-8 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 rounded-lg text-xs font-medium flex items-center transition-colors border border-gray-200">
                            <RefreshCw className="w-3.5 h-3.5 mr-1" />
                            Refresh
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                                    <th className="px-3 py-3">IP Address</th>
                                    <th className="px-3 py-3">MAC Address</th>
                                    <th className="px-3 py-3">Hostname</th>
                                    <th className="px-3 py-3">Expires</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeLeases.length === 0 ? (
                                    <tr><td colSpan={4} className="p-6 text-center text-gray-400 text-sm">No active leases.</td></tr>
                                ) : (
                                    activeLeases.map((lease, i) => (
                                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                                            <td className="px-3 py-3 text-sm font-mono text-gray-700 font-medium">{lease.ip}</td>
                                            <td className="px-3 py-3 text-sm font-mono text-gray-600">{lease.mac}</td>
                                            <td className="px-3 py-3 text-sm text-gray-600">{lease.hostname || '—'}</td>
                                            <td className="px-3 py-3 text-xs text-gray-500">
                                                {lease.expires === 'never' ? (
                                                    <span className="text-green-600 font-medium">Static</span>
                                                ) : (
                                                    new Date(lease.expires).toLocaleString()
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Pool Modal */}
            {isPoolModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">{editingPool ? 'Edit DHCP Pool' : 'New DHCP Pool'}</h3>
                            <button onClick={() => setIsPoolModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSavePool} className="p-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Interface</label>
                                    <select value={poolIface} onChange={e => setPoolIface(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                                        <option value="">ANY</option>
                                        {interfaces.map(iface => <option key={iface.id} value={iface.name}>{iface.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Subnet Mask</label>
                                    <input type="text" value={subnetMask} onChange={e => setSubnetMask(e.target.value)} required placeholder="255.255.255.0" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Range Start</label>
                                    <input type="text" value={rangeStart} onChange={e => setRangeStart(e.target.value)} required placeholder="192.168.1.100" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Range End</label>
                                    <input type="text" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} required placeholder="192.168.1.200" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gateway</label>
                                    <input type="text" value={gateway} onChange={e => setGateway(e.target.value)} placeholder="192.168.1.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Lease Time (sec)</label>
                                    <input type="number" value={leaseTime} onChange={e => setLeaseTime(parseInt(e.target.value) || 86400)} min={60} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">DNS Servers</label>
                                    <input type="text" value={dnsServers} onChange={e => setDnsServers(e.target.value)} placeholder="8.8.8.8,8.8.4.4" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Domain (optional)</label>
                                    <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="local.lan" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsPoolModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">Save Pool</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Static Lease Modal */}
            {isLeaseModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">{editingLease ? 'Edit Static Lease' : 'New Static Lease'}</h3>
                            <button onClick={() => setIsLeaseModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSaveLease} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pool</label>
                                    <select value={leasePoolId} onChange={e => setLeasePoolId(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                                        <option value={0}>No pool</option>
                                        {pools.map(p => <option key={p.id} value={p.id}>{p.interface} ({p.range_start} - {p.range_end})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                                    <input type="text" value={macAddress} onChange={e => setMacAddress(e.target.value)} required placeholder="AA:BB:CC:DD:EE:FF" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                                    <input type="text" value={ipAddress} onChange={e => setIpAddress(e.target.value)} required placeholder="192.168.1.50" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Hostname (optional)</label>
                                    <input type="text" value={hostname} onChange={e => setHostname(e.target.value)} placeholder="server-01" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Web server" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsLeaseModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">Save Lease</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
