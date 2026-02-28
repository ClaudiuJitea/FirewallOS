import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Pause, Play, Download, Filter, X, Search, ChevronDown, ArrowDown, Zap } from 'lucide-react';

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

/** Max entries kept in the raw (unfiltered) ring-buffer. */
const MAX_RAW_BUFFER = 2000;
/**
 * Max entries kept in the **filtered** accumulator.
 * This is independent of the raw buffer – filtered results have their own
 * retention so rare-protocol entries aren't evicted by majority traffic.
 */
const MAX_FILTERED_BUFFER = 2000;
/** How many rows to render in the DOM at most (performance cap). */
const MAX_VISIBLE_ROWS = 500;
/** How often (ms) batched WebSocket messages are flushed into React state. */
const FLUSH_INTERVAL_MS = 250;
/** Debounce delay for text filter inputs. */
const DEBOUNCE_MS = 200;

// ---------------------------------------------------------------------------
// Filter config – a plain object that can be passed into the matching fn
// ---------------------------------------------------------------------------
interface FilterConfig {
  action: string;
  protocol: string;
  text: string;
  ip: string;
  port: string;
  iface: string;
  country: string;
}

const EMPTY_FILTER: FilterConfig = {
  action: 'ALL',
  protocol: 'ALL',
  text: '',
  ip: '',
  port: '',
  iface: '',
  country: '',
};

function isFilterActive(f: FilterConfig): boolean {
  return (
    f.action !== 'ALL' ||
    f.protocol !== 'ALL' ||
    !!f.text.trim() ||
    !!f.ip.trim() ||
    !!f.port.trim() ||
    !!f.iface.trim() ||
    !!f.country.trim()
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeProtocol(value: string): string {
  return (value || '').trim().toUpperCase();
}

function protocolMatches(logProtocol: string, selectedProtocol: string): boolean {
  const selected = normalizeProtocol(selectedProtocol);
  if (selected === 'ALL') return true;
  const current = normalizeProtocol(logProtocol);
  if (selected === 'ICMP') return current === 'ICMP' || current === 'ICMP6';
  if (selected === 'OTHER') return !['TCP', 'UDP', 'ICMP', 'ICMP6', 'ARP', 'IP6'].includes(current);
  return current === selected;
}

function portMatches(logPort: number | string, filterValue: string): boolean {
  const query = filterValue.trim().toLowerCase();
  if (!query) return true;
  const portText = String(logPort ?? '').trim().toLowerCase();
  if (!portText) return false;
  const tokens = query.split(',').map((x) => x.trim()).filter(Boolean);
  if (tokens.length === 0) return true;
  const numericPort = Number(portText);
  for (const token of tokens) {
    if (/^\d+$/.test(token)) { if (portText === token) return true; continue; }
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range && !Number.isNaN(numericPort)) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (numericPort >= Math.min(start, end) && numericPort <= Math.max(start, end)) return true;
      continue;
    }
    if (portText.includes(token)) return true;
  }
  return false;
}

/**
 * Check whether a single log entry passes the given filter config.
 * Extracted so both the flush callback and filter-change handler can share it.
 */
function logMatchesFilter(log: LogEntry, f: FilterConfig): boolean {
  if (f.action !== 'ALL' && (log.action || '').toUpperCase() !== f.action.toUpperCase()) return false;
  if (!protocolMatches(log.protocol, f.protocol)) return false;

  const search = f.text.trim().toLowerCase();
  if (search) {
    const haystack = [
      log.timestamp, log.action, log.protocol, log.source,
      log.destination, String(log.port), log.interface, log.country,
    ].map((x) => String(x || '').toLowerCase()).join(' ');
    if (!haystack.includes(search)) return false;
  }

  const ipQuery = f.ip.trim().toLowerCase();
  if (ipQuery) {
    const src = String(log.source || '').toLowerCase();
    const dst = String(log.destination || '').toLowerCase();
    if (!src.includes(ipQuery) && !dst.includes(ipQuery)) return false;
  }

  if (!portMatches(log.port, f.port)) return false;

  const ifaceQuery = f.iface.trim().toLowerCase();
  if (ifaceQuery && !String(log.interface || '').toLowerCase().includes(ifaceQuery)) return false;

  const countryQuery = f.country.trim().toLowerCase();
  if (countryQuery && !String(log.country || '').toLowerCase().includes(countryQuery)) return false;

  return true;
}

/** Debounce hook. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(h);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Active filter pill
// ---------------------------------------------------------------------------
interface FilterPillProps { label: string; value: string; onClear: () => void; }
const FilterPill: React.FC<FilterPillProps> = ({ label, value, onClear }) => (
  <span className="inline-flex items-center gap-1.5 text-xs bg-primary/15 text-primary border border-primary/25 rounded-full pl-2.5 pr-1.5 py-0.5 font-medium">
    <span className="text-gray-400 font-normal">{label}:</span>
    <span className="max-w-[120px] truncate">{value}</span>
    <button onClick={onClear} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors" aria-label={`Clear ${label} filter`}>
      <X className="w-3 h-3" />
    </button>
  </span>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const Logs = () => {
  // ---- Two separate buffers ----
  // Raw log buffer: all traffic, capped at MAX_RAW_BUFFER.
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  // Filtered accumulator: only entries that match current filters, capped at
  // MAX_FILTERED_BUFFER.  Has its own independent retention so rare traffic
  // (ICMP, ARP …) isn't evicted by majority TCP/UDP traffic.
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);

  const [isPaused, setIsPaused] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Incoming WS message buffer (pre-React)
  const incomingBufferRef = useRef<LogEntry[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolledAwayRef = useRef(false);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // ---- Filter state ----
  const [showFilters, setShowFilters] = useState(false);
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterProtocol, setFilterProtocol] = useState('ALL');
  const [filterText, setFilterText] = useState('');
  const [filterIp, setFilterIp] = useState('');
  const [filterPort, setFilterPort] = useState('');
  const [filterInterface, setFilterInterface] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  const debouncedText = useDebouncedValue(filterText, DEBOUNCE_MS);
  const debouncedIp = useDebouncedValue(filterIp, DEBOUNCE_MS);
  const debouncedPort = useDebouncedValue(filterPort, DEBOUNCE_MS);
  const debouncedInterface = useDebouncedValue(filterInterface, DEBOUNCE_MS);
  const debouncedCountry = useDebouncedValue(filterCountry, DEBOUNCE_MS);

  // A ref that always holds the latest resolved filter config so the async
  // flush callback can read it without stale closures.
  const filterRef = useRef<FilterConfig>(EMPTY_FILTER);
  useEffect(() => {
    filterRef.current = {
      action: filterAction,
      protocol: filterProtocol,
      text: debouncedText,
      ip: debouncedIp,
      port: debouncedPort,
      iface: debouncedInterface,
      country: debouncedCountry,
    };
  }, [filterAction, filterProtocol, debouncedText, debouncedIp, debouncedPort, debouncedInterface, debouncedCountry]);

  const hasActiveFilters = useMemo(
    () =>
      filterAction !== 'ALL' ||
      filterProtocol !== 'ALL' ||
      !!debouncedText.trim() ||
      !!debouncedIp.trim() ||
      !!debouncedPort.trim() ||
      !!debouncedInterface.trim() ||
      !!debouncedCountry.trim(),
    [filterAction, filterProtocol, debouncedText, debouncedIp, debouncedPort, debouncedInterface, debouncedCountry],
  );

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filterAction !== 'ALL') c++;
    if (filterProtocol !== 'ALL') c++;
    if (filterText.trim()) c++;
    if (filterIp.trim()) c++;
    if (filterPort.trim()) c++;
    if (filterInterface.trim()) c++;
    if (filterCountry.trim()) c++;
    return c;
  }, [filterAction, filterProtocol, filterText, filterIp, filterPort, filterInterface, filterCountry]);

  // ---- Rebuild filtered accumulator when filters change ----
  // We keep a ref to allLogs so we can re-seed from it synchronously.
  const allLogsRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    const f: FilterConfig = {
      action: filterAction,
      protocol: filterProtocol,
      text: debouncedText,
      ip: debouncedIp,
      port: debouncedPort,
      iface: debouncedInterface,
      country: debouncedCountry,
    };
    if (!isFilterActive(f)) {
      setFilteredLogs([]);
    } else {
      // Re-seed from current raw buffer
      const seeded = allLogsRef.current.filter((log) => logMatchesFilter(log, f));
      setFilteredLogs(seeded.length > MAX_FILTERED_BUFFER ? seeded.slice(-MAX_FILTERED_BUFFER) : seeded);
    }
  }, [filterAction, filterProtocol, debouncedText, debouncedIp, debouncedPort, debouncedInterface, debouncedCountry]);

  // ---- Batched flush ----
  const flushBuffer = useCallback(() => {
    if (incomingBufferRef.current.length === 0) return;
    const batch = incomingBufferRef.current;
    incomingBufferRef.current = [];

    // 1) Update raw buffer
    setAllLogs((prev) => {
      const combined = prev.concat(batch);
      const trimmed = combined.length > MAX_RAW_BUFFER ? combined.slice(-MAX_RAW_BUFFER) : combined;
      allLogsRef.current = trimmed;
      return trimmed;
    });

    // 2) Update filtered accumulator (only if filters are active)
    const f = filterRef.current;
    if (isFilterActive(f)) {
      const matching = batch.filter((log) => logMatchesFilter(log, f));
      if (matching.length > 0) {
        setFilteredLogs((prev) => {
          const combined = prev.concat(matching);
          return combined.length > MAX_FILTERED_BUFFER ? combined.slice(-MAX_FILTERED_BUFFER) : combined;
        });
      }
    }
  }, []);

  // ---- WebSocket lifecycle ----
  useEffect(() => {
    if (isPaused) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.NODE_ENV === 'development'
      ? 'ws://localhost:3000/api/logs'
      : `${protocol}//${window.location.host}/api/logs`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try { incomingBufferRef.current.push(JSON.parse(event.data)); } catch { /* skip */ }
      };
    } catch (e) {
      console.error('Failed to connect to log stream', e);
    }

    flushTimerRef.current = setInterval(flushBuffer, FLUSH_INTERVAL_MS);

    return () => {
      if (ws) ws.close();
      if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
      flushBuffer();
    };
  }, [isPaused, flushBuffer]);

  // ---- Throttled auto-scroll ----
  const scrollTickRef = useRef<number | null>(null);
  const displayLogs = hasActiveFilters ? filteredLogs : allLogs;

  useEffect(() => {
    if (isPaused || userScrolledAwayRef.current) return;
    if (scrollTickRef.current != null) return;
    scrollTickRef.current = requestAnimationFrame(() => {
      scrollTickRef.current = null;
      logsEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [displayLogs, isPaused]);

  // ---- Scroll detection ----
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
      userScrolledAwayRef.current = !atBottom;
      setShowScrollHint(!atBottom);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // ---- Unique values for dropdown suggestions ----
  const uniqueInterfaces = useMemo(() => {
    const s = new Set<string>();
    for (const log of allLogs) { if (log.interface && log.interface !== '—') s.add(log.interface); }
    return Array.from(s).sort();
  }, [allLogs]);

  const uniqueCountries = useMemo(() => {
    const s = new Set<string>();
    for (const log of allLogs) { if (log.country && log.country !== 'Unknown') s.add(log.country); }
    return Array.from(s).sort();
  }, [allLogs]);

  // ---- Visible rows (DOM cap) ----
  const visibleLogs = useMemo(() => {
    if (displayLogs.length <= MAX_VISIBLE_ROWS) return displayLogs;
    return displayLogs.slice(-MAX_VISIBLE_ROWS);
  }, [displayLogs]);

  // ---- Actions ----
  const clearFilters = () => {
    setFilterAction('ALL');
    setFilterProtocol('ALL');
    setFilterText('');
    setFilterIp('');
    setFilterPort('');
    setFilterInterface('');
    setFilterCountry('');
  };

  const quickFilterAction = (val: string) => setFilterAction(val);
  const quickFilterProtocol = (val: string) => setFilterProtocol(normalizeProtocol(val));
  const quickFilterIp = (val: string) => setFilterIp(val);
  const quickFilterInterface = (val: string) => setFilterInterface(val);
  const quickFilterCountry = (val: string) => setFilterCountry(val);

  const scrollToBottom = () => {
    userScrolledAwayRef.current = false;
    setShowScrollHint(false);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleExport = () => {
    if (displayLogs.length === 0) return;

    const headers = ['timestamp', 'action', 'protocol', 'source', 'destination', 'port', 'country', 'interface'];
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = displayLogs.map((log) => {
      const row = [
        String(log.timestamp ?? ''),
        String(log.action ?? ''),
        String(log.protocol ?? ''),
        String(log.source ?? ''),
        String(log.destination ?? ''),
        String(log.port ?? ''),
        String(log.country ?? ''),
        String(log.interface ?? ''),
      ];
      return row.map(escapeCsv).join(',');
    });

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `traffic-logs-${now}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---- Shared classes ----
  const selectClass = "w-full bg-[#181825] border border-gray-700 rounded-lg px-2.5 py-2 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer hover:border-gray-500 transition-colors";
  const inputClass = "w-full bg-[#181825] border border-gray-700 rounded-lg px-2.5 py-2 text-gray-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none placeholder-gray-600 hover:border-gray-500 transition-colors";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
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
          <button
            onClick={handleExport}
            disabled={displayLogs.length === 0}
            className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm border ${displayLogs.length === 0
              ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </button>
        </div>
      </div>

      {/* Terminal panel */}
      <div className="bg-[#1E1E2E] rounded-xl shadow-lg border border-gray-800 flex-1 flex flex-col overflow-hidden font-mono text-sm leading-relaxed">

        {/* Top bar */}
        <div className="flex flex-col bg-black/20 shrink-0">
          <div className="px-4 pt-4 pb-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Search traffic (IP, protocol, action, interface, country, port)"
                  className="w-full bg-[#181825] border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-gray-200 text-sm focus:ring-1 focus:ring-primary focus:outline-none placeholder-gray-500 hover:border-gray-500 transition-colors"
                />
                {filterText && (
                  <button onClick={() => setFilterText('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 transition-colors" aria-label="Clear search">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Protocol quick-toggles */}
              <div className="flex items-center gap-1.5 flex-wrap lg:justify-end">
                {['ALL', 'TCP', 'UDP', 'ICMP', 'ARP'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterProtocol(filterProtocol === p && p !== 'ALL' ? 'ALL' : p)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-150 ${filterProtocol === p
                      ? 'bg-primary/20 text-primary border-primary/40 shadow-sm shadow-primary/10'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200'
                      }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 border text-xs font-semibold ${showFilters ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-gray-400 hover:text-gray-200 border-white/10 hover:bg-white/10'
                }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-bold rounded-full leading-none">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${isPaused ? 'text-yellow-300 border-yellow-600/40 bg-yellow-900/20' : 'text-green-300 border-green-600/40 bg-green-900/20'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
              {isPaused ? 'Paused' : 'Live'}
            </span>

            {/* Active filter pills */}
            {hasActiveFilters && (
              <>
                <div className="h-4 w-px bg-gray-700 mx-1" />
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {filterAction !== 'ALL' && <FilterPill label="Action" value={filterAction} onClear={() => setFilterAction('ALL')} />}
                  {filterProtocol !== 'ALL' && <FilterPill label="Protocol" value={filterProtocol} onClear={() => setFilterProtocol('ALL')} />}
                  {filterText.trim() && <FilterPill label="Search" value={filterText} onClear={() => setFilterText('')} />}
                  {filterIp.trim() && <FilterPill label="IP" value={filterIp} onClear={() => setFilterIp('')} />}
                  {filterPort.trim() && <FilterPill label="Port" value={filterPort} onClear={() => setFilterPort('')} />}
                  {filterInterface.trim() && <FilterPill label="Interface" value={filterInterface} onClear={() => setFilterInterface('')} />}
                  {filterCountry.trim() && <FilterPill label="Country" value={filterCountry} onClear={() => setFilterCountry('')} />}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {displayLogs.length}<span className="text-gray-600"> / </span>{allLogs.length}
                  </span>
                  <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-400 flex items-center transition-colors font-medium">
                    <X className="w-3 h-3 mr-0.5" /> Clear all
                  </button>
                </div>
              </>
            )}

            {!hasActiveFilters && (
              <div className="flex-1 flex justify-end">
                <span className="text-xs text-gray-600 tabular-nums">{allLogs.length} entries</span>
              </div>
            )}
          </div>

          {/* Advanced filters panel */}
          {showFilters && (
            <div className="px-4 pb-4 pt-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-3 bg-black/20 rounded-lg border border-white/5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Action</label>
                  <div className="relative">
                    <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className={selectClass}>
                      <option value="ALL">All Actions</option>
                      <option value="ALLOW">ALLOW</option>
                      <option value="BLOCK">BLOCK</option>
                      <option value="LOG">LOG</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Protocol</label>
                  <div className="relative">
                    <select value={filterProtocol} onChange={e => setFilterProtocol(e.target.value)} className={selectClass}>
                      <option value="ALL">All Protocols</option>
                      <option value="TCP">TCP</option>
                      <option value="UDP">UDP</option>
                      <option value="ICMP">ICMP (IPv4 + IPv6)</option>
                      <option value="ICMP6">ICMP6 (IPv6 only)</option>
                      <option value="ARP">ARP</option>
                      <option value="IP6">IP6</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">IP Address</label>
                  <div className="relative">
                    <input type="text" value={filterIp} onChange={e => setFilterIp(e.target.value)} placeholder="Source or Dest IP" className={inputClass} />
                    {filterIp && <button onClick={() => setFilterIp('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 transition-colors"><X className="w-3 h-3" /></button>}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Port</label>
                  <div className="relative">
                    <input type="text" value={filterPort} onChange={e => setFilterPort(e.target.value)} placeholder="443, 80-90, icmp" className={inputClass} />
                    {filterPort && <button onClick={() => setFilterPort('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 transition-colors"><X className="w-3 h-3" /></button>}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Interface</label>
                  <div className="relative">
                    {uniqueInterfaces.length > 0 ? (
                      <>
                        <select value={filterInterface} onChange={e => setFilterInterface(e.target.value)} className={selectClass}>
                          <option value="">All Interfaces</option>
                          {uniqueInterfaces.map(iface => <option key={iface} value={iface}>{iface}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                      </>
                    ) : (
                      <input type="text" value={filterInterface} onChange={e => setFilterInterface(e.target.value)} placeholder="e.g. eth0" className={inputClass} />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Country</label>
                  <div className="relative">
                    {uniqueCountries.length > 0 ? (
                      <>
                        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} className={selectClass}>
                          <option value="">All Countries</option>
                          {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                      </>
                    ) : (
                      <input type="text" value={filterCountry} onChange={e => setFilterCountry(e.target.value)} placeholder="e.g. US, RO" className={inputClass} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto relative" ref={scrollContainerRef}>
          <table className="w-full border-collapse text-sm" style={{ minWidth: '900px' }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0a0e1f] border-b-2 border-[#3b4775]">
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Timestamp</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Action</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Protocol</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Source IP</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Destination IP</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Port</th>
                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] border-r border-[#2a334d] whitespace-nowrap">Country</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-extrabold text-[#8892b8] whitespace-nowrap">Interface</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    {allLogs.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        {isPaused ? (
                          <>
                            <Pause className="w-8 h-8 text-gray-600" />
                            <p className="text-gray-500 font-medium">Stream paused</p>
                            <p className="text-gray-600 text-xs">Click &quot;Resume Stream&quot; to start capturing traffic.</p>
                          </>
                        ) : (
                          <>
                            <Zap className="w-8 h-8 text-gray-600 animate-pulse" />
                            <p className="text-gray-500 font-medium">Waiting for traffic…</p>
                            <p className="text-gray-600 text-xs">Packets will appear here in real-time.</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Search className="w-8 h-8 text-gray-600" />
                        <p className="text-gray-500 font-medium">No matching logs yet</p>
                        <p className="text-gray-600 text-xs">
                          Matching traffic will accumulate here as it arrives.
                          {' '}{allLogs.length} total entries buffered.
                        </p>
                        <button onClick={clearFilters} className="mt-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                          Clear all filters
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                visibleLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors border-b border-[#1e2545] group">
                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap border-r border-[#1e2545]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5 border-r border-[#1e2545]">
                      <button onClick={() => quickFilterAction(log.action)} title={`Filter by ${log.action}`}
                        className={`font-bold text-xs uppercase tracking-wider cursor-pointer hover:underline decoration-dotted underline-offset-2 ${log.action === 'ALLOW' ? 'text-green-400' : log.action === 'BLOCK' ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                        {log.action}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 border-r border-[#1e2545]">
                      <button onClick={() => quickFilterProtocol(log.protocol)} title={`Filter by ${log.protocol}`}
                        className="text-blue-300 text-xs font-semibold cursor-pointer hover:underline decoration-dotted underline-offset-2">
                        {log.protocol}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 border-r border-[#1e2545]">
                      <button onClick={() => quickFilterIp(log.source)} title={`Filter by ${log.source}`}
                        className="text-[#a6e3a1] text-sm font-mono cursor-pointer hover:underline decoration-dotted underline-offset-2">
                        {log.source}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 border-r border-[#1e2545]">
                      <button onClick={() => quickFilterIp(log.destination)} title={`Filter by ${log.destination}`}
                        className="text-[#89b4fa] text-sm font-mono cursor-pointer hover:underline decoration-dotted underline-offset-2">
                        {log.destination}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-[#f9e2af] text-sm font-mono border-r border-[#1e2545]">
                      {log.port}
                    </td>
                    <td className="px-4 py-2.5 text-center border-r border-[#1e2545]">
                      {log.country && log.country !== 'Unknown' ? (
                        <button onClick={() => quickFilterCountry(log.country)} title={`Filter by ${log.country}`}
                          className="text-[#cba6f7] font-bold text-xs bg-[#cba6f7]/10 px-2 py-0.5 rounded border border-[#cba6f7]/20 cursor-pointer hover:bg-[#cba6f7]/20 transition-colors">
                          {log.country}
                        </button>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => quickFilterInterface(log.interface)} title={`Filter by ${log.interface}`}
                        className="text-gray-400 text-xs cursor-pointer hover:underline decoration-dotted underline-offset-2 hover:text-gray-200">
                        {log.interface || '—'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div ref={logsEndRef} />

          {/* Scroll-to-bottom button */}
          {showScrollHint && !isPaused && visibleLogs.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-primary/90 hover:bg-primary text-white text-xs font-semibold rounded-full shadow-lg shadow-primary/20 backdrop-blur transition-all z-30"
            >
              <ArrowDown className="w-3 h-3" />
              Jump to latest
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
