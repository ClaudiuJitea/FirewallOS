import { execSync } from 'child_process';
import { allQuery, getQuery } from './db';

type TrafficPoint = {
  time: string;
  in: number;
  out: number;
};

type TopConnection = {
  ip: string;
  port: string;
  count: number;
};

let timer: NodeJS.Timeout | null = null;
let cpuPrevTotal = 0;
let cpuPrevIdle = 0;
let cpuPercent = 0;
let ramUsedMb = 0;
let ramTotalMb = 0;
let wanRxPrev = 0;
let wanTxPrev = 0;
let wanPrevTs = 0;
let trafficHistory: TrafficPoint[] = [];

function execShell(command: string): string {
  return execSync(command, { encoding: 'utf-8', timeout: 5000 });
}

function readCpu(): void {
  try {
    const line = execShell(`sh -lc "head -n 1 /proc/stat"`).trim();
    const parts = line.split(/\s+/).slice(1).map((x) => Number(x));
    const idle = (parts[3] || 0) + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);

    if (cpuPrevTotal > 0) {
      const totalDelta = total - cpuPrevTotal;
      const idleDelta = idle - cpuPrevIdle;
      if (totalDelta > 0) {
        cpuPercent = Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
      }
    }

    cpuPrevTotal = total;
    cpuPrevIdle = idle;
  } catch {
    // Keep last value.
  }
}

function readRam(): void {
  try {
    const content = execShell(`sh -lc "cat /proc/meminfo"`);
    const memTotal = Number((content.match(/^MemTotal:\s+(\d+)/m) || [])[1] || 0);
    const memAvailable = Number((content.match(/^MemAvailable:\s+(\d+)/m) || [])[1] || 0);
    if (memTotal > 0) {
      ramTotalMb = Math.round(memTotal / 1024);
      ramUsedMb = Math.max(0, Math.round((memTotal - memAvailable) / 1024));
    }
  } catch {
    // Keep last value.
  }
}

async function pickWanInterface(): Promise<string> {
  try {
    const wan: any = await getQuery('SELECT physical_interface FROM interfaces WHERE name = ? AND status = 1 LIMIT 1', ['WAN']);
    if (wan?.physical_interface) return String(wan.physical_interface);
  } catch {
    // Fallback below.
  }
  return 'eth0';
}

function getNetDevBytes(iface: string): { rx: number; tx: number } | null {
  try {
    const line = execShell(`sh -lc "cat /proc/net/dev | grep '${iface}:' || true"`).trim();
    if (!line) return null;
    const [, right] = line.split(':');
    const cols = right.trim().split(/\s+/);
    const rx = Number(cols[0] || 0);
    const tx = Number(cols[8] || 0);
    if (Number.isNaN(rx) || Number.isNaN(tx)) return null;
    return { rx, tx };
  } catch {
    return null;
  }
}

async function readTraffic(): Promise<void> {
  const iface = await pickWanInterface();
  const now = Date.now();
  const bytes = getNetDevBytes(iface);
  if (!bytes) return;

  if (wanPrevTs > 0 && now > wanPrevTs) {
    const dtSec = (now - wanPrevTs) / 1000;
    const inBps = Math.max(0, (bytes.rx - wanRxPrev) / dtSec);
    const outBps = Math.max(0, (bytes.tx - wanTxPrev) / dtSec);

    trafficHistory.push({
      time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      in: Math.round(inBps / 1024),
      out: Math.round(outBps / 1024),
    });
    if (trafficHistory.length > 20) {
      trafficHistory = trafficHistory.slice(-20);
    }
  }

  wanRxPrev = bytes.rx;
  wanTxPrev = bytes.tx;
  wanPrevTs = now;
}

async function sample(): Promise<void> {
  readCpu();
  readRam();
  await readTraffic();
}

export async function startSystemMetricsCollector(): Promise<void> {
  if (timer) return;
  await sample();
  timer = setInterval(() => {
    sample().catch(() => undefined);
  }, 3000);
}

async function getActiveConnections(): Promise<number> {
  try {
    const out = execShell(`sh -lc "ss -H -tun state established | wc -l"`).trim();
    return Number(out) || 0;
  } catch {
    return 0;
  }
}

async function getRulesActive(): Promise<number> {
  try {
    const row: any = await getQuery('SELECT COUNT(*) as count FROM rules WHERE status = 1');
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function getBlockedThreats24h(): Promise<number> {
  try {
    const row: any = await getQuery(
      "SELECT COUNT(*) as count FROM dns_logs WHERE action = 'BLOCK' AND timestamp >= datetime('now', '-1 day')"
    );
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function getTopConnections(): Promise<TopConnection[]> {
  try {
    const out = execShell(`sh -lc "ss -H -tun state established"`).trim();
    if (!out) return [];

    const agg = new Map<string, TopConnection>();
    const lines = out.split('\n').map((x) => x.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 5) continue;
      const peer = parts[4]; // e.g. 1.2.3.4:443

      const lastColon = peer.lastIndexOf(':');
      if (lastColon <= 0) continue;
      const ip = peer.slice(0, lastColon).replace(/^\[|\]$/g, '');
      const port = peer.slice(lastColon + 1);
      if (!ip || !port) continue;

      const key = `${ip}:${port}`;
      const current = agg.get(key);
      if (current) current.count += 1;
      else agg.set(key, { ip, port, count: 1 });
    }

    return Array.from(agg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function getSystemMetrics() {
  const [activeConnections, rulesActive, blockedThreats24h, topConnections] = await Promise.all([
    getActiveConnections(),
    getRulesActive(),
    getBlockedThreats24h(),
    getTopConnections(),
  ]);

  return {
    cpuPercent,
    ramUsedMb,
    ramTotalMb,
    activeConnections,
    rulesActive,
    blockedThreats24h,
    trafficHistory,
    topConnections,
  };
}

