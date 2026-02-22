import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, X, Route as RouteIcon, Cpu, RefreshCw, Terminal } from 'lucide-react';
import { useAuthStore } from '../store';

interface StaticRoute {
  id: number;
  destination: string;
  gateway: string;
  interface: string;
  metric: number;
  status: number;
  description: string;
}

export const RoutingTable = () => {
  const [routes, setRoutes] = useState<StaticRoute[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<StaticRoute | null>(null);
  const [interfaces, setInterfaces] = useState<{ id: number, name: string }[]>([]);
  const token = useAuthStore(state => state.token);
  const [osStatus, setOsStatus] = useState<'synced' | 'error' | 'unknown'>('unknown');
  const [systemRoutes, setSystemRoutes] = useState<string>('');
  const [showSystemRoutes, setShowSystemRoutes] = useState(true);

  // Form State
  const [destination, setDestination] = useState('');
  const [gateway, setGateway] = useState('');
  const [iface, setIface] = useState('WAN');
  const [metric, setMetric] = useState(1);
  const [description, setDescription] = useState('');

  const fetchRoutes = async () => {
    try {
      const res = await fetch('/api/routing', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setRoutes(await res.json());
    } catch (e) {
      console.error("Failed to fetch routes");
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

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/nft-status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setOsStatus('synced');
        setSystemRoutes(data.routingTable || '');
      } else {
        setOsStatus('error');
      }
    } catch { setOsStatus('error'); }
  };

  useEffect(() => {
    fetchRoutes();
    fetchInterfaces();
    fetchStatus();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this route?')) return;
    try {
      const res = await fetch(`/api/routing/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchRoutes();
    } catch (e) {
      console.error('Failed to delete route');
    }
  };

  const handleToggleStatus = async (routeObj: StaticRoute) => {
    try {
      const res = await fetch(`/ api / routing / ${routeObj.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...routeObj, status: routeObj.status ? 0 : 1 })
      });
      if (res.ok) fetchRoutes();
    } catch (e) {
      console.error('Failed to update status');
    }
  };

  const openModal = (routeObj?: StaticRoute) => {
    if (routeObj) {
      setEditingRoute(routeObj);
      setDestination(routeObj.destination);
      setGateway(routeObj.gateway);
      setIface(routeObj.interface);
      setMetric(routeObj.metric);
      setDescription(routeObj.description || '');
    } else {
      setEditingRoute(null);
      setDestination('');
      setGateway('');
      setIface('WAN');
      setMetric(1);
      setDescription('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      destination, gateway, interface: iface, metric, description,
      status: editingRoute ? editingRoute.status : 1
    };

    try {
      const url = editingRoute ? `/ api / routing / ${editingRoute.id}` : '/api/routing';
      const method = editingRoute ? 'PUT' : 'POST';

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
        fetchRoutes();
      }
    } catch (err) {
      console.error('Failed to save route');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Static Routing</h2>
          <p className="text-gray-500 text-sm mt-1">Manage IP routing table and gateways</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-bold border ${osStatus === 'synced' ? 'bg-green-50 text-green-700 border-green-200' :
            osStatus === 'error' ? 'bg-red-50 text-red-600 border-red-200' :
              'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
            <Cpu className="w-3.5 h-3.5" />
            {osStatus === 'synced' ? 'ip route Synced' : osStatus === 'error' ? 'Sync Error' : 'Checking...'}
          </div>
          <button onClick={() => openModal()} className="h-9 bg-primary hover:bg-[#00796B] text-white px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Route
          </button>
        </div>
      </div>

      {/* System Routes (Live from OS) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowSystemRoutes(!showSystemRoutes)}
          className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-bold text-gray-700">System Routes (OS)</span>
            <span className="text-xs text-gray-400">— live from container kernel</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); fetchStatus(); }}
              className="p-1 text-gray-400 hover:text-primary rounded transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-gray-400">{showSystemRoutes ? '▲' : '▼'}</span>
          </div>
        </button>
        {showSystemRoutes && (
          <div className="p-4">
            <pre className="bg-gray-900 text-green-400 text-xs font-mono p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
              {systemRoutes || 'Loading...'}
            </pre>
          </div>
        )}
      </div>

      {/* Managed Routes (from DB) */}
      <div>
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Managed Routes (Table 100)</h3>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                <th className="px-3 py-3 w-10"><RouteIcon className="w-4 h-4 text-gray-400" /></th>
                <th className="px-3 py-3">Destination IP / CIDR</th>
                <th className="px-3 py-3">Gateway</th>
                <th className="px-3 py-3">Interface</th>
                <th className="px-3 py-3 w-16 text-center">Metric</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3 w-16 text-center">Status</th>
                <th className="px-3 py-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No static routes configured.</td></tr>
              ) : (
                routes.map((routeObj) => (
                  <tr key={routeObj.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3 font-medium text-gray-800 text-sm font-mono">{routeObj.destination}</td>
                    <td className="px-3 py-3 text-sm text-gray-600 font-mono">{routeObj.gateway || 'Direct'}</td>
                    <td className="px-3 py-3 text-sm text-gray-600 font-mono">{routeObj.interface}</td>
                    <td className="px-3 py-3 text-center text-sm font-medium text-gray-500">{routeObj.metric}</td>
                    <td className="px-3 py-3 text-sm text-gray-500">{routeObj.description || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => handleToggleStatus(routeObj)} className={`${routeObj.status ? 'text-green-500' : 'text-gray-300'} hover:opacity-80 transition-opacity`}>
                        {routeObj.status ? <CheckCircle className="w-5 h-5 mx-auto" /> : <XCircle className="w-5 h-5 mx-auto" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openModal(routeObj)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(routeObj.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">{editingRoute ? 'Edit Static Route' : 'New Static Route'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Destination IP / CIDR</label>
                  <input type="text" value={destination} onChange={e => setDestination(e.target.value)} required placeholder="e.g. 10.10.10.0/24 or 0.0.0.0/0" className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gateway</label>
                  <input type="text" value={gateway} onChange={e => setGateway(e.target.value)} placeholder="e.g. 192.168.1.1 (leave empty for direct interface)" className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interface</label>
                  <select value={iface} onChange={e => setIface(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                    {interfaces.length === 0 && <option value="WAN">WAN</option>}
                    {interfaces.map(i => (
                      <option key={i.id} value={i.name}>{i.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Metric</label>
                  <input type="number" value={metric} onChange={e => setMetric(Number(e.target.value))} required min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note" className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all" />
                </div>
              </div>
              <div className="mt-8 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[#00796B] transition-colors shadow-lg shadow-primary/20">Save Route</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
