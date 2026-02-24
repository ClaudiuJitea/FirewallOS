import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Shield, Server, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '../store';

type Metrics = {
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  activeConnections: number;
  rulesActive: number;
  blockedThreats24h: number;
  trafficHistory: Array<{ time: string; in: number; out: number }>;
  topConnections: Array<{ ip: string; port: string; count: number }>;
};

export const Dashboard = () => {
  const token = useAuthStore((state) => state.token);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/system/metrics', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setMetrics(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch dashboard metrics');
    }
  };

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 5000);
    return () => clearInterval(id);
  }, [token]);

  const cards = useMemo(() => ([
    {
      label: 'Active Connections',
      value: metrics ? metrics.activeConnections.toLocaleString() : '...',
      icon: Activity,
      color: 'text-blue-500',
      bg: 'bg-blue-100'
    },
    {
      label: 'Rules Active',
      value: metrics ? metrics.rulesActive.toLocaleString() : '...',
      icon: Shield,
      color: 'text-primary',
      bg: 'bg-primary/20'
    },
    {
      label: 'Blocked Threats (24h)',
      value: metrics ? metrics.blockedThreats24h.toLocaleString() : '...',
      icon: Zap,
      color: 'text-danger',
      bg: 'bg-danger/20'
    },
    {
      label: 'System Load',
      value: metrics ? `${metrics.cpuPercent}%` : '...',
      icon: Server,
      color: 'text-warning',
      bg: 'bg-warning/20'
    }
  ]), [metrics]);

  const chartData = metrics?.trafficHistory ?? [];
  const topConnections = useMemo(
    () =>
      (metrics?.topConnections ?? []).map((conn) => ({
        ...conn,
        ip: conn.ip.startsWith('::ffff:') ? conn.ip.slice(7) : conn.ip,
      })),
    [metrics?.topConnections]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard Overview</h2>
        <div className="text-sm text-gray-500">Last updated: {new Date().toLocaleTimeString()}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((stat, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
            <div className={`${stat.bg} ${stat.color} p-4 rounded-lg mr-4`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">{stat.label}</div>
              <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-800">Live Traffic (WAN)</h3>
            <div className="flex space-x-4 text-sm font-medium">
              <span className="flex items-center text-green-500"><ArrowDownRight className="w-4 h-4 mr-1" /> In</span>
              <span className="flex items-center text-blue-500"><ArrowUpRight className="w-4 h-4 mr-1" /> Out</span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="in" stroke="#10B981" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="out" stroke="#3B82F6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 self-start">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Top Connections</h3>
          <div className="space-y-4">
            {topConnections.map((conn, i) => (
              <div key={i} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{conn.ip}</div>
                  <div className="text-xs text-gray-500">Port {conn.port}</div>
                </div>
                <div className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  {conn.count} session{conn.count > 1 ? 's' : ''}
                </div>
              </div>
            ))}
            {topConnections.length === 0 && (
              <div className="text-sm text-gray-500">No active established connections.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
