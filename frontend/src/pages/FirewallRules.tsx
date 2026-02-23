import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Plus, Trash2, Edit2, CheckCircle, XCircle, X, Play, ShieldAlert, ShieldCheck, RefreshCw, Cpu, Shield } from 'lucide-react';
import { useAuthStore } from '../store';

interface Rule {
  id: number;
  priority: number;
  name: string;
  action: 'ALLOW' | 'BLOCK' | 'LOG';
  interface: string;
  source: string;
  destination: string;
  protocol: string;
  port: string;
  status: number;
  hits: number;
}

export const FirewallRules = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Rule | null>(null);
  const [interfaces, setInterfaces] = useState<{ id: number, name: string }[]>([]);
  const token = useAuthStore(state => state.token);

  // Form State
  const [name, setName] = useState('');
  const [action, setAction] = useState<'ALLOW' | 'BLOCK' | 'LOG'>('ALLOW');
  const [netInterface, setNetInterface] = useState('ANY');
  const [source, setSource] = useState('ANY');
  const [destination, setDestination] = useState('ANY');
  const [protocol, setProtocol] = useState('TCP');
  const [port, setPort] = useState('ANY');

  // Simulation State
  const [simSource, setSimSource] = useState('192.168.1.100');
  const [simDest, setSimDest] = useState('10.0.0.50');
  const [simPort, setSimPort] = useState('443');
  const [simProtocol, setSimProtocol] = useState('TCP');
  const [simInterface, setSimInterface] = useState('LAN');
  const [simResult, setSimResult] = useState<{ action: string, ruleId: number | null } | null>(null);

  // OS Sync State
  const [osStatus, setOsStatus] = useState<'synced' | 'error' | 'syncing' | 'unknown'>('unknown');
  const [osError, setOsError] = useState<string | null>(null);
  const [showNftRuleset, setShowNftRuleset] = useState(false);
  const [nftRuleset, setNftRuleset] = useState('');

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRules(await res.json());
    } catch (e) {
      console.error("Failed to fetch rules");
    }
  };

  const fetchInterfaces = async () => {
    try {
      const res = await fetch('/api/interfaces', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setInterfaces(await res.json());
    } catch (e) {
      console.error("Failed to fetch interfaces");
    }
  };

  const fetchNftStatus = async () => {
    try {
      const res = await fetch('/api/system/nft-status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setNftRuleset(data.nftRuleset || '');
        setOsStatus('synced');
        setOsError(null);
      } else {
        setOsStatus('error');
        setOsError('Failed to fetch nftables status');
      }
    } catch (e) {
      setOsStatus('error');
      setOsError('Backend unreachable');
    }
  };

  const handleForceApply = async () => {
    setOsStatus('syncing');
    try {
      const res = await fetch('/api/system/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOsStatus('synced');
        setOsError(null);
        setNftRuleset(data.nftRuleset || '');
      } else {
        const data = await res.json();
        setOsStatus('error');
        setOsError(data.rulesError || data.routesError || 'Unknown error');
      }
    } catch (e) {
      setOsStatus('error');
      setOsError('Failed to apply rules');
    }
  };

  useEffect(() => {
    fetchRules();
    fetchInterfaces();
    fetchNftStatus();
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(rules);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedItems = items.map((item, index) => ({ ...item, priority: index + 1 }));
    setRules(updatedItems);

    try {
      await fetch('/api/rules/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rules: updatedItems.map(r => ({ id: r.id, priority: r.priority })) })
      });
    } catch (e) {
      console.error('Failed to save order');
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      const res = await fetch(`/api/rules/${deleteCandidate.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDeleteCandidate(null);
        fetchRules();
      }
    } catch (e) {
      console.error('Failed to delete rule');
    }
  };

  const handleToggleStatus = async (rule: Rule) => {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...rule, status: rule.status ? 0 : 1 })
      });
      if (res.ok) fetchRules();
    } catch (e) {
      console.error('Failed to update status');
    }
  };

  const openModal = (rule?: Rule) => {
    if (rule) {
      setEditingRule(rule);
      setName(rule.name);
      setAction(rule.action);
      setNetInterface(rule.interface || 'ANY');
      setSource(rule.source);
      setDestination(rule.destination);
      setProtocol(rule.protocol);
      setPort(rule.port);
    } else {
      setEditingRule(null);
      setName('');
      setAction('ALLOW');
      setNetInterface('ANY');
      setSource('ANY');
      setDestination('ANY');
      setProtocol('TCP');
      setPort('ANY');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      priority: editingRule ? editingRule.priority : rules.length + 1,
      name, action, interface: netInterface, source, destination, protocol, port,
      status: editingRule ? editingRule.status : 1
    };

    try {
      const url = editingRule ? `/api/rules/${editingRule.id}` : '/api/rules';
      const method = editingRule ? 'PUT' : 'POST';

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
        fetchRules();
      }
    } catch (err) {
      console.error('Failed to save rule');
    }
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimResult(null);
    try {
      const res = await fetch('/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source: simSource,
          destination: simDest,
          port: simPort,
          protocol: simProtocol,
          interface: simInterface
        })
      });
      if (res.ok) {
        setSimResult(await res.json());
      }
    } catch (err) {
      console.error('Simulation failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Firewall Rules</h2>
          <p className="text-gray-500 text-sm mt-1">Manage inbound and outbound traffic policies</p>
        </div>
        <div className="flex items-center gap-2">
          {/* OS Sync Status */}
          <div className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-bold border ${osStatus === 'synced' ? 'bg-green-50 text-green-700 border-green-200' :
            osStatus === 'error' ? 'bg-red-50 text-red-600 border-red-200' :
              osStatus === 'syncing' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
            <Cpu className="w-3.5 h-3.5" />
            {osStatus === 'synced' && 'nftables Synced'}
            {osStatus === 'error' && (osError || 'Sync Error')}
            {osStatus === 'syncing' && 'Syncing...'}
            {osStatus === 'unknown' && 'Checking...'}
          </div>
          <button onClick={handleForceApply} disabled={osStatus === 'syncing'} className="h-9 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white px-3 rounded-lg text-xs font-medium flex items-center transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${osStatus === 'syncing' ? 'animate-spin' : ''}`} />
            Force Apply
          </button>
          <button onClick={() => { setShowNftRuleset(!showNftRuleset); if (!showNftRuleset) fetchNftStatus(); }} className="h-9 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 rounded-lg text-xs font-medium flex items-center transition-colors border border-gray-200">
            <Cpu className="w-3.5 h-3.5 mr-1.5" />
            {showNftRuleset ? 'Hide' : 'Show'} nft Ruleset
          </button>
          <button onClick={() => openModal()} className="h-9 bg-primary hover:bg-[#00796B] text-white px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Rule
          </button>
        </div>
      </div>

      {/* nftables Ruleset Viewer */}
      {showNftRuleset && (
        <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-700 p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-300 flex items-center">
              <Cpu className="w-4 h-4 text-green-400 mr-2" />
              Live nftables Ruleset (Container OS)
            </h3>
            <button onClick={fetchNftStatus} className="text-gray-400 hover:text-white text-xs flex items-center transition-colors">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </button>
          </div>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto bg-gray-950 rounded-lg p-4 border border-gray-800">
            {nftRuleset || 'Loading...'}
          </pre>
        </div>
      )}

      {/* Simulation Sandbox */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700 flex items-center uppercase tracking-wider">
            <Play className="w-4 h-4 text-primary mr-2" />
            Rule Sandbox
          </h3>
          {simResult && (
            <div className={`h-8 px-3 rounded-lg flex items-center text-xs font-bold ${simResult.action === 'BLOCK' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'
              }`}>
              {simResult.action === 'BLOCK' ? <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
              {simResult.action} {typeof simResult.ruleId === 'number' ? `(Rule #${simResult.ruleId})` : '(Default Policy)'}
            </div>
          )}
        </div>
        <form onSubmit={handleSimulate} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Interface</label>
            <select value={simInterface} onChange={e => setSimInterface(e.target.value)} className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all">
              {interfaces.map(iface => <option key={iface.id} value={iface.name}>{iface.name}</option>)}
              <option value="wg0">wg0</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Protocol</label>
            <select value={simProtocol} onChange={e => setSimProtocol(e.target.value)} className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all">
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
              <option value="ICMP">ICMP</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Source IP</label>
            <input type="text" value={simSource} onChange={e => setSimSource(e.target.value)} className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Dest IP</label>
            <input type="text" value={simDest} onChange={e => setSimDest(e.target.value)} className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Port</label>
            <input type="text" value={simPort} onChange={e => setSimPort(e.target.value)} className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all" />
          </div>
          <div className="flex-shrink-0">
            <button type="submit" className="h-9 bg-gray-800 hover:bg-gray-900 text-white px-5 rounded-lg font-medium transition-colors text-sm whitespace-nowrap">
              Test Packet
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Title Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Traffic Policy Rules</h3>
              <p className="text-xs text-gray-400 mt-0.5">Drag to reorder · Rules are evaluated top-to-bottom</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="rules-list">
              {(provided) => (
                <table className="w-full text-left border-collapse" {...provided.droppableProps} ref={provided.innerRef}>
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-widest text-gray-400 font-extrabold">
                      <th className="px-3 py-3.5 w-10"></th>
                      <th className="px-3 py-3.5 w-14 text-center">#</th>
                      <th className="px-3 py-3.5">Rule Name</th>
                      <th className="px-3 py-3.5 w-24">Action</th>
                      <th className="px-3 py-3.5">Interface</th>
                      <th className="px-3 py-3.5">Source</th>
                      <th className="px-3 py-3.5">Destination</th>
                      <th className="px-3 py-3.5">Proto / Port</th>
                      <th className="px-3 py-3.5 w-20 text-right">Hits</th>
                      <th className="px-3 py-3.5 w-16 text-center">Active</th>
                      <th className="px-3 py-3.5 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-gray-400">No custom rules configured. Add a rule to get started.</td></tr>
                    ) : (
                      rules.map((rule, index) => (
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
                                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${rule.action === 'ALLOW' ? 'bg-green-100 text-green-700' :
                                  rule.action === 'BLOCK' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                  {rule.action}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-600">{rule.interface || 'ANY'}</td>
                              <td className="px-3 py-3 text-sm text-gray-600 font-mono">{rule.source}</td>
                              <td className="px-3 py-3 text-sm text-gray-600 font-mono">{rule.destination}</td>
                              <td className="px-3 py-3 text-sm">
                                <span className="font-medium text-gray-800">{rule.protocol}</span>
                                <span className="text-gray-400 mx-1">/</span>
                                <span className="text-gray-500">{rule.port}</span>
                              </td>
                              <td className="px-3 py-3 text-right text-sm text-gray-500 font-mono">{rule.hits.toLocaleString()}</td>
                              <td className="px-3 py-3 text-center">
                                <button onClick={() => handleToggleStatus(rule)} className={`${rule.status ? 'text-green-500' : 'text-gray-300'} hover:opacity-80 transition-opacity`}>
                                  {rule.status ? <CheckCircle className="w-5 h-5 mx-auto" /> : <XCircle className="w-5 h-5 mx-auto" />}
                                </button>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => openModal(rule)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
                                  <button onClick={() => setDeleteCandidate(rule)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                    {/* Default Policy Row */}
                    <tr className="bg-gray-50/70 border-t-2 border-gray-200">
                      <td className="px-3 py-3"></td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 text-xs font-bold text-gray-400">∞</span>
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-500 italic text-sm">Default Policy</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-green-100 text-green-700">
                          ALLOW
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-400 italic">ANY</td>
                      <td className="px-3 py-3 text-sm text-gray-400 italic font-mono">ANY</td>
                      <td className="px-3 py-3 text-sm text-gray-400 italic font-mono">ANY</td>
                      <td className="px-3 py-3 text-sm text-gray-400 italic">ANY</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-400">-</td>
                      <td className="px-3 py-3 text-center">
                        <ShieldCheck className="w-5 h-5 mx-auto text-gray-300" />
                      </td>
                      <td className="px-3 py-3"></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">{editingRule ? 'Edit Firewall Rule' : 'New Firewall Rule'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Allow Web Traffic" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source (IP or Subnet)</label>
                  <input type="text" value={source} onChange={e => setSource(e.target.value)} required placeholder="e.g. ANY or 192.168.1.0/24" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
                  <select value={protocol} onChange={e => setProtocol(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                    <option value="ANY">ANY</option>
                    <option value="TCP">TCP</option>
                    <option value="UDP">UDP</option>
                    <option value="ICMP">ICMP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                  <select value={action} onChange={e => setAction(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                    <option value="ALLOW">ALLOW</option>
                    <option value="BLOCK">BLOCK</option>
                    <option value="LOG">LOG</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Destination (IP or Subnet)</label>
                  <input type="text" value={destination} onChange={e => setDestination(e.target.value)} required placeholder="e.g. ANY or 10.0.0.5" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port Range</label>
                  <input type="text" value={port} onChange={e => setPort(e.target.value)} required placeholder="e.g. ANY or 80, 443" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>
              </div>
              <div className="mt-8 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">Save Rule</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {deleteCandidate && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Delete Firewall Rule</h3>
              <button onClick={() => setDeleteCandidate(null)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600">
                Delete rule <span className="font-semibold text-gray-800">&ldquo;{deleteCandidate.name}&rdquo;</span>?
              </p>
              <p className="mt-1 text-xs text-gray-400">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteCandidate(null)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-100 transition-colors">Cancel</button>
              <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">Delete Rule</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
