import React, { useState, useEffect, useRef } from 'react';
import { Pause, Play, Download, Filter, X } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  action: 'ALLOW' | 'BLOCK' | 'LOG';
  source: string;
  destination: string;
  protocol: string;
  port: number | string;
  interface: string;
  country: string;
}

export const Logs = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Advanced Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterProtocol, setFilterProtocol] = useState<string>('ALL');
  const [filterIp, setFilterIp] = useState<string>('');
  const [filterPort, setFilterPort] = useState<string>('');
  const [filterInterface, setFilterInterface] = useState<string>('');
  const [filterCountry, setFilterCountry] = useState<string>('');

  useEffect(() => {
    if (isPaused) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.NODE_ENV === 'development' ? `ws://localhost:3000/api/logs` : `${protocol}//${window.location.host}/api/logs`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setLogs((prev) => {
          const newLogs = [...prev, data];
          if (newLogs.length > 100) newLogs.shift();
          return newLogs;
        });
      };
    } catch (e) {
      console.error("Failed to connect to log stream", e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  const filteredLogs = logs.filter(log => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    if (filterProtocol !== 'ALL' && log.protocol !== filterProtocol) return false;
    if (filterIp && !log.source.includes(filterIp) && !log.destination.includes(filterIp)) return false;
    if (filterPort && log.port.toString() !== filterPort) return false;
    if (filterInterface && !log.interface.toLowerCase().includes(filterInterface.toLowerCase())) return false;
    if (filterCountry && !log.country.toLowerCase().includes(filterCountry.toLowerCase())) return false;
    return true;
  });

  const clearFilters = () => {
    setFilterAction('ALL');
    setFilterProtocol('ALL');
    setFilterIp('');
    setFilterPort('');
    setFilterInterface('');
    setFilterCountry('');
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Live Traffic Logs</h2>
          <p className="text-gray-500 text-sm mt-1">Real-time connection monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center transition-colors ${isPaused ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-warning/20 text-warning hover:bg-warning/30'
              }`}
          >
            {isPaused ? <Play className="w-4 h-4 mr-1.5" /> : <Pause className="w-4 h-4 mr-1.5" />}
            {isPaused ? 'Resume Stream' : 'Pause Stream'}
          </button>
          <button className="h-9 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 flex-1 flex flex-col overflow-hidden font-mono text-sm leading-relaxed">
        <div className="flex flex-col border-b border-gray-800 bg-black/20 shrink-0">
          <div className="flex items-center space-x-4 p-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors border ${showFilters ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-gray-400 hover:text-gray-200 border-white/10 hover:bg-white/10'}`}
            >
              <Filter className="w-4 h-4" />
              <span className="font-semibold text-xs tracking-wide">Advanced Filters</span>
            </button>
            <div className="flex-1"></div>
            {(filterAction !== 'ALL' || filterProtocol !== 'ALL' || filterIp || filterPort || filterInterface || filterCountry) && (
              <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-white flex items-center transition-colors">
                <X className="w-3 h-3 mr-1" /> Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="p-4 pt-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 bg-black/10">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Action</label>
                <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="w-full bg-[#181825] border border-gray-700 rounded px-2 py-1.5 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value="ALL">All Actions</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="BLOCK">BLOCK</option>
                  <option value="LOG">LOG</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Protocol</label>
                <select value={filterProtocol} onChange={e => setFilterProtocol(e.target.value)} className="w-full bg-[#181825] border border-gray-700 rounded px-2 py-1.5 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value="ALL">All Protocols</option>
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                  <option value="ICMP">ICMP</option>
                  <option value="ICMP6">ICMP6</option>
                  <option value="ARP">ARP</option>
                  <option value="IP6">IP6</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">IP Address</label>
                <input type="text" value={filterIp} onChange={e => setFilterIp(e.target.value)} placeholder="Source or Dest IP" className="w-full bg-[#181825] border border-gray-700 rounded px-2 py-1.5 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Port</label>
                <input type="text" value={filterPort} onChange={e => setFilterPort(e.target.value)} placeholder="e.g. 443" className="w-full bg-[#181825] border border-gray-700 rounded px-2 py-1.5 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Interface</label>
                <input type="text" value={filterInterface} onChange={e => setFilterInterface(e.target.value)} placeholder="e.g. eth0" className="w-full bg-[#181825] border border-gray-700 rounded px-2 py-1.5 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Country</label>
                <input type="text" value={filterCountry} onChange={e => setFilterCountry(e.target.value)} placeholder="e.g. US, RO" className="w-full bg-[#181825] border border-gray-700 rounded px-2 py-1.5 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none placeholder-gray-600" />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-10">No matching logs found...</div>
          ) : (
            filteredLogs.map((log, i) => (
              <div key={i} className="flex items-center space-x-3 hover:bg-white/5 py-1 px-2 rounded transition-colors group">
                <span className="text-gray-500 shrink-0 w-24 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`w-14 font-bold shrink-0 text-xs uppercase tracking-wider ${log.action === 'ALLOW' ? 'text-green-500' : log.action === 'BLOCK' ? 'text-red-500' : 'text-yellow-400'}`}>
                  {log.action}
                </span>
                <span className="text-blue-400/80 w-10 shrink-0 text-xs font-semibold">{log.protocol}</span>
                <span className="text-gray-300 flex-1 flex items-center text-sm">
                  <span className="text-[#a6e3a1]">{log.source}</span>
                  <span className="text-gray-600 mx-2 text-xs">→</span>
                  <span className="text-[#89b4fa]">{log.destination}</span>
                  <span className="text-[#f9e2af] ml-1">:{log.port}</span>
                </span>
                {log.country && log.country !== 'Unknown' && (
                  <span className="text-[#cba6f7] shrink-0 text-xs font-bold bg-[#cba6f7]/10 px-1.5 py-0.5 rounded border border-[#cba6f7]/20">{log.country}</span>
                )}
                <span className="text-gray-500 shrink-0 text-xs w-16 text-right opacity-0 group-hover:opacity-100 transition-opacity">{log.interface}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
