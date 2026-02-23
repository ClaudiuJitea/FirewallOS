import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Plus, Trash2, Edit2, CheckCircle, XCircle, Cpu, X, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { useAuthStore } from '../store';

interface NatRule {
    id: number;
    priority: number;
    type: string;
    name: string;
    interface: string;
    original_source: string;
    original_destination: string;
    protocol: string;
    original_port: string;
    translated_ip: string;
    translated_port: string;
    status: number;
    hits: number;
}

export const NAT = () => {
    const [rules, setRules] = useState<NatRule[]>([]);
    const token = useAuthStore(state => state.token);
    const [osStatus, setOsStatus] = useState<'synced' | 'error' | 'syncing' | 'unknown'>('unknown');
    const [interfaces, setInterfaces] = useState<{ id: number; name: string }[]>([]);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<NatRule | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [type, setType] = useState<'SNAT' | 'DNAT'>('DNAT');
    const [netInterface, setNetInterface] = useState('ANY');
    const [protocol, setProtocol] = useState('TCP');
    const [originalSource, setOriginalSource] = useState('0.0.0.0/0');
    const [originalDestination, setOriginalDestination] = useState('0.0.0.0/0');
    const [originalPort, setOriginalPort] = useState('');
    const [translatedIp, setTranslatedIp] = useState('');
    const [translatedPort, setTranslatedPort] = useState('');

    const fetchRules = async () => {
        try {
            const res = await fetch('/api/nat', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setRules(await res.json());
        } catch (e) {
            console.error("Failed to fetch NAT rules");
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/system/nft-status', { headers: { Authorization: `Bearer ${token}` } });
            setOsStatus(res.ok ? 'synced' : 'error');
        } catch { setOsStatus('error'); }
    };

    const fetchInterfaces = async () => {
        try {
            const res = await fetch('/api/interfaces', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setInterfaces(await res.json());
        } catch (e) { console.error('Failed to fetch interfaces'); }
    };

    useEffect(() => { fetchRules(); fetchStatus(); fetchInterfaces(); }, []);

    const openModal = (rule?: NatRule) => {
        if (rule) {
            setEditingRule(rule);
            setName(rule.name);
            setType(rule.type as 'SNAT' | 'DNAT');
            setNetInterface(rule.interface || 'ANY');
            setProtocol(rule.protocol || 'TCP');
            setOriginalSource(rule.original_source || '0.0.0.0/0');
            setOriginalDestination(rule.original_destination || '0.0.0.0/0');
            setOriginalPort(rule.original_port || '');
            setTranslatedIp(rule.translated_ip || '');
            setTranslatedPort(rule.translated_port || '');
        } else {
            setEditingRule(null);
            setName('');
            setType('DNAT');
            setNetInterface('ANY');
            setProtocol('TCP');
            setOriginalSource('0.0.0.0/0');
            setOriginalDestination('0.0.0.0/0');
            setOriginalPort('');
            setTranslatedIp('');
            setTranslatedPort('');
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            priority: editingRule ? editingRule.priority : (rules.length + 1),
            type, name,
            interface: netInterface,
            original_source: originalSource,
            original_destination: originalDestination,
            protocol,
            original_port: originalPort,
            translated_ip: translatedIp,
            translated_port: translatedPort,
            status: editingRule ? editingRule.status : 1
        };
        try {
            const url = editingRule ? `/api/nat/${editingRule.id}` : '/api/nat';
            const method = editingRule ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsModalOpen(false);
                fetchRules();
                fetchStatus();
            }
        } catch (err) {
            console.error('Failed to save NAT rule');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this NAT rule?')) return;
        try {
            const res = await fetch(`/api/nat/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) fetchRules();
        } catch (e) { console.error('Failed to delete NAT rule'); }
    };

    const handleToggleStatus = async (rule: NatRule) => {
        try {
            await fetch(`/api/nat/${rule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...rule, status: rule.status ? 0 : 1 })
            });
            fetchRules();
        } catch (e) { console.error('Failed to toggle status'); }
    };

    const handleForceApply = async () => {
        setOsStatus('syncing');
        try {
            const res = await fetch('/api/system/apply-rules', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            setOsStatus(res.ok ? 'synced' : 'error');
        } catch { setOsStatus('error'); }
    };

    const onDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(rules);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        const updatedItems = items.map((item, index) => ({ ...item, priority: index + 1 }));
        setRules(updatedItems);

        // Persist reorder
        try {
            await fetch('/api/nat/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ rules: updatedItems.map(r => ({ id: r.id, priority: r.priority })) })
            });
        } catch (e) { console.error('Failed to reorder'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">NAT & Port Forwarding</h2>
                    <p className="text-gray-500 text-sm mt-1">Manage Source NAT (Masquerade) and Destination NAT (Port Forwarding)</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-bold border ${osStatus === 'synced' ? 'bg-green-50 text-green-700 border-green-200' :
                        osStatus === 'error' ? 'bg-red-50 text-red-600 border-red-200' :
                            osStatus === 'syncing' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                        <Cpu className="w-3.5 h-3.5" />
                        {osStatus === 'synced' && 'nftables Synced'}
                        {osStatus === 'error' && 'Sync Error'}
                        {osStatus === 'syncing' && 'Syncing...'}
                        {osStatus === 'unknown' && 'Checking...'}
                    </div>
                    <button onClick={handleForceApply} disabled={osStatus === 'syncing'} className="h-9 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white px-3 rounded-lg text-xs font-medium flex items-center transition-colors">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${osStatus === 'syncing' ? 'animate-spin' : ''}`} />
                        Force Apply
                    </button>
                    <button onClick={() => openModal()} className="h-9 bg-primary hover:bg-[#00796B] text-white px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-lg shadow-primary/20">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add NAT Rule
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Table Title Bar */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-50 text-purple-600">
                            <ArrowLeftRight className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-800">NAT Translation Rules</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Drag to reorder · DNAT (Port Forward) and SNAT (Masquerade)</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-bold">
                        {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="nat-rules-list">
                            {(provided) => (
                                <table className="w-full text-left border-collapse" {...provided.droppableProps} ref={provided.innerRef}>
                                    <thead>
                                        <tr className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-widest text-gray-400 font-extrabold">
                                            <th className="px-3 py-3.5 w-10"></th>
                                            <th className="px-3 py-3.5 w-14 text-center">#</th>
                                            <th className="px-3 py-3.5">Rule Name</th>
                                            <th className="px-3 py-3.5 w-24">Type</th>
                                            <th className="px-3 py-3.5">Original (Src / Dst / Port)</th>
                                            <th className="px-3 py-3.5">Translated (IP / Port)</th>
                                            <th className="px-3 py-3.5 w-16 text-center">Active</th>
                                            <th className="px-3 py-3.5 w-24 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rules.length === 0 && (
                                            <tr><td colSpan={8} className="p-8 text-center text-gray-400">No NAT rules configured. Add a rule to get started.</td></tr>
                                        )}
                                        {rules.map((rule, index) => (
                                            <Draggable key={rule.id.toString()} draggableId={rule.id.toString()} index={index}>
                                                {(provided, snapshot) => (
                                                    <tr
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${snapshot.isDragging ? 'bg-blue-50/50 shadow-lg' : ''}`}
                                                    >
                                                        <td className="px-3 py-3 text-gray-400" {...provided.dragHandleProps}>
                                                            <GripVertical className="w-4 h-4 cursor-grab" />
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-bold text-gray-500">{rule.priority}</span>
                                                        </td>
                                                        <td className="px-3 py-3 font-medium text-gray-800 text-sm">{rule.name}</td>
                                                        <td className="px-3 py-3">
                                                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${rule.type === 'DNAT' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-purple-100 text-purple-700'
                                                                }`}>
                                                                {rule.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 text-sm text-gray-600">
                                                            <div className="mb-0.5"><span className="text-gray-400">If:</span> {rule.interface} <span className="text-gray-400 ml-2">Proto:</span> {rule.protocol}</div>
                                                            <div className="mb-0.5"><span className="text-gray-400">Src:</span> <span className="font-mono">{rule.original_source}</span></div>
                                                            <div><span className="text-gray-400">Dst:</span> <span className="font-mono">{rule.original_destination}</span> <span className="text-gray-400">Port:</span> {rule.original_port}</div>
                                                        </td>
                                                        <td className="px-3 py-3 text-sm text-gray-600">
                                                            <div className="font-medium text-gray-900 bg-gray-100 px-2 py-1 inline-block rounded-md font-mono text-xs">{rule.translated_ip} : {rule.translated_port}</div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <button onClick={() => handleToggleStatus(rule)} className={`${rule.status ? 'text-green-500' : 'text-gray-300'} hover:opacity-80 transition-opacity`}>
                                                                {rule.status ? <CheckCircle className="w-5 h-5 mx-auto" /> : <XCircle className="w-5 h-5 mx-auto" />}
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button onClick={() => openModal(rule)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
                                                                <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </tbody>
                                </table>
                            )}
                        </Droppable>
                    </DragDropContext>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">{editingRule ? 'Edit NAT Rule' : 'New NAT Rule'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Port Forward SSH" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select value={type} onChange={e => setType(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                                        <option value="DNAT">DNAT (Port Forward)</option>
                                        <option value="SNAT">SNAT (Masquerade)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Interface</label>
                                    <select value={netInterface} onChange={e => setNetInterface(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                                        <option value="ANY">ANY</option>
                                        {interfaces.map(iface => (
                                            <option key={iface.id} value={iface.name}>{iface.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
                                    <select value={protocol} onChange={e => setProtocol(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                                        <option value="TCP">TCP</option>
                                        <option value="UDP">UDP</option>
                                        <option value="ANY">ANY</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Original Port</label>
                                    <input type="text" value={originalPort} onChange={e => setOriginalPort(e.target.value)} placeholder="e.g. 8080" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Original Source</label>
                                    <input type="text" value={originalSource} onChange={e => setOriginalSource(e.target.value)} placeholder="0.0.0.0/0" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Original Destination</label>
                                    <input type="text" value={originalDestination} onChange={e => setOriginalDestination(e.target.value)} placeholder="0.0.0.0/0" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Translated IP</label>
                                    <input type="text" value={translatedIp} onChange={e => setTranslatedIp(e.target.value)} required placeholder="e.g. 192.168.1.100" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Translated Port</label>
                                    <input type="text" value={translatedPort} onChange={e => setTranslatedPort(e.target.value)} placeholder="e.g. 22" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">{editingRule ? 'Update Rule' : 'Create Rule'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
