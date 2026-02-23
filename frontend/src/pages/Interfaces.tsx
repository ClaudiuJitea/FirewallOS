import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, X, Network } from 'lucide-react';
import { useAuthStore } from '../store';

interface Interface {
    id: number;
    name: string;
    physical_interface: string;
    ip_address: string;
    netmask: string;
    status: number;
}

interface PhysicalInterfaceOption {
    name: string;
    state: string;
    configured: boolean;
    inUseBy: string[];
}

export const Interfaces = () => {
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [availablePhysical, setAvailablePhysical] = useState<PhysicalInterfaceOption[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingInterface, setEditingInterface] = useState<Interface | null>(null);
    const token = useAuthStore(state => state.token);

    // Form State
    const [name, setName] = useState('');
    const [physicalInterface, setPhysicalInterface] = useState('');
    const [ipAddress, setIpAddress] = useState('');
    const [netmask, setNetmask] = useState('255.255.255.0');

    const fetchInterfaces = async () => {
        try {
            const res = await fetch('/api/interfaces', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setInterfaces(await res.json());
        } catch (e) {
            console.error("Failed to fetch interfaces");
        }
    };

    const fetchAvailablePhysicalInterfaces = async () => {
        try {
            const res = await fetch('/api/interfaces/available-physical', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setAvailablePhysical(await res.json());
        } catch {
            console.error("Failed to fetch available physical interfaces");
        }
    };

    useEffect(() => {
        fetchInterfaces();
        fetchAvailablePhysicalInterfaces();
    }, [token]);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this interface?')) return;
        try {
            const res = await fetch(`/api/interfaces/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) fetchInterfaces();
        } catch (e) {
            console.error('Failed to delete interface');
        }
    };

    const handleToggleStatus = async (iface: Interface) => {
        try {
            const res = await fetch(`/api/interfaces/${iface.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ ...iface, status: iface.status ? 0 : 1 })
            });
            if (res.ok) fetchInterfaces();
        } catch (e) {
            console.error('Failed to update status');
        }
    };

    const openModal = (iface?: Interface) => {
        fetchAvailablePhysicalInterfaces();
        if (iface) {
            setEditingInterface(iface);
            setName(iface.name);
            setPhysicalInterface(iface.physical_interface);
            setIpAddress(iface.ip_address);
            setNetmask(iface.netmask);
        } else {
            setEditingInterface(null);
            setName('');
            setPhysicalInterface('');
            setIpAddress('');
            setNetmask('255.255.255.0');
        }
        setIsModalOpen(true);
    };

    const physicalOptions = React.useMemo(() => {
        const map = new Map<string, PhysicalInterfaceOption>();
        for (const item of availablePhysical) map.set(item.name, item);

        if (editingInterface?.physical_interface && !map.has(editingInterface.physical_interface)) {
            map.set(editingInterface.physical_interface, {
                name: editingInterface.physical_interface,
                state: 'MISSING',
                configured: true,
                inUseBy: [editingInterface.name],
            });
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [availablePhysical, editingInterface]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            name, physical_interface: physicalInterface, ip_address: ipAddress, netmask,
            status: editingInterface ? editingInterface.status : 1
        };

        try {
            const url = editingInterface ? `/api/interfaces/${editingInterface.id}` : '/api/interfaces';
            const method = editingInterface ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setIsModalOpen(false);
                fetchInterfaces();
            }
        } catch (err) {
            console.error('Failed to save interface');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Network Interfaces</h2>
                    <p className="text-gray-500 text-sm mt-1">Manage physical and logical network interfaces</p>
                </div>
                <button onClick={() => openModal()} className="h-9 bg-primary hover:bg-[#00796B] text-white px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Interface
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Table Title Bar */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600">
                            <Network className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-800">Configured Interfaces</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Physical and logical network interfaces</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
                        {interfaces.length} {interfaces.length === 1 ? 'interface' : 'interfaces'}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-widest text-gray-400 font-extrabold">
                                <th className="px-3 py-3.5">Name</th>
                                <th className="px-3 py-3.5">Physical Device</th>
                                <th className="px-3 py-3.5">IP Address</th>
                                <th className="px-3 py-3.5">Netmask</th>
                                <th className="px-3 py-3.5 w-16 text-center">Active</th>
                                <th className="px-3 py-3.5 w-24 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {interfaces.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No interfaces configured. Add an interface to get started.</td></tr>
                            ) : (
                                interfaces.map((iface) => (
                                    <tr key={iface.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                                        <td className="px-3 py-3 font-medium text-gray-800 text-sm">{iface.name}</td>
                                        <td className="px-3 py-3 text-sm text-gray-600 font-mono">{iface.physical_interface}</td>
                                        <td className="px-3 py-3 text-sm text-gray-600 font-mono">{iface.ip_address}</td>
                                        <td className="px-3 py-3 text-sm text-gray-600 font-mono">{iface.netmask}</td>
                                        <td className="px-3 py-3 text-center">
                                            <button onClick={() => handleToggleStatus(iface)} className={`${iface.status ? 'text-green-500' : 'text-gray-300'} hover:opacity-80 transition-opacity`}>
                                                {iface.status ? <CheckCircle className="w-5 h-5 mx-auto" /> : <XCircle className="w-5 h-5 mx-auto" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => openModal(iface)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(iface.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">{editingInterface ? 'Edit Interface' : 'New Interface'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. WAN" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Physical Interface</label>
                                    <select
                                        value={physicalInterface}
                                        onChange={e => setPhysicalInterface(e.target.value)}
                                        required
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                    >
                                        <option value="">Select detected interface...</option>
                                        {physicalOptions.map((iface) => (
                                            <option key={iface.name} value={iface.name}>
                                                {iface.name} [{iface.state}]
                                                {iface.inUseBy.length > 0 ? ` - in use by ${iface.inUseBy.join(', ')}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Detected from container runtime. If an interface is marked as in use, only reuse it intentionally.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                                    <input type="text" value={ipAddress} onChange={e => setIpAddress(e.target.value)} required placeholder="e.g. 192.168.1.10" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Netmask</label>
                                    <input type="text" value={netmask} onChange={e => setNetmask(e.target.value)} required placeholder="e.g. 255.255.255.0" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                            </div>
                            <div className="mt-8 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">Save Interface</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
