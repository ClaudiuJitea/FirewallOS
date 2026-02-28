"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocket = setupWebSocket;
const child_process_1 = require("child_process");
const ws_1 = require("ws");
const pty = __importStar(require("node-pty"));
const ipaddr_js_1 = __importDefault(require("ipaddr.js"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const network_1 = require("../network");
let captureProc = null;
let captureBuffer = '';
const clients = new Set();
let rulesCache = [];
let interfaceMapCache = {};
let rulesCacheUpdatedAt = 0;
let rulesCacheLoading = null;
function normalizeIpWithPort(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return { ip: '' };
    // IPv4 format in tcpdump usually looks like a.b.c.d.port
    const maybeIpv4Port = trimmed.match(/^(\d+\.\d+\.\d+\.\d+)\.(\d+)$/);
    if (maybeIpv4Port) {
        return { ip: maybeIpv4Port[1], port: Number(maybeIpv4Port[2]) };
    }
    return { ip: trimmed };
}
function hasPortSuffix(value) {
    return /^(\d+\.\d+\.\d+\.\d+)\.(\d+)$/.test(value.trim());
}
function parseTcpdumpLine(line) {
    // IPv4 examples:
    // 13:30:00.111111 eth1 In  IP 10.0.0.2.55712 > 8.8.8.8.53: UDP, length 32
    // 13:30:00.111111 eth1 In  IP 10.0.0.2 > 10.0.0.1: ICMP echo request, id 1, seq 1, length 64
    const m4 = line.match(/^\S+\s+(\S+)\s+\S+\s+IP\s+(\S+)\s+>\s+(\S+):\s+(.*)$/);
    if (m4) {
        const iface = m4[1];
        const srcRaw = m4[2];
        const dstRaw = m4[3];
        const details = m4[4].toUpperCase();
        let protocol = 'OTHER';
        if (details.includes('ICMP'))
            protocol = 'ICMP';
        else if (details.includes('UDP'))
            protocol = 'UDP';
        else if (details.includes('TCP'))
            protocol = 'TCP';
        else {
            // tcpdump frequently omits explicit "UDP/TCP" token for app-level payload lines
            // (e.g. DNS: "1234+ A? google.com. ..."). Infer protocol heuristically.
            const srcHasPort = hasPortSuffix(srcRaw);
            const dstHasPort = hasPortSuffix(dstRaw);
            if (details.includes('FLAGS ['))
                protocol = 'TCP';
            else if (srcHasPort || dstHasPort)
                protocol = 'UDP';
        }
        const src = normalizeIpWithPort(srcRaw);
        const dst = normalizeIpWithPort(dstRaw);
        return {
            iface,
            source: src.ip,
            destination: dst.ip,
            protocol,
            srcPort: src.port,
            dstPort: dst.port,
        };
    }
    // IPv6 example:
    // 13:30:00.111111 eth0 In  IP6 fe80::1.546 > ff02::1:2.547: dhcp6 solicit
    const m6 = line.match(/^\S+\s+(\S+)\s+\S+\s+IP6\s+(\S+)\s+>\s+(\S+):\s+(.*)$/);
    if (m6) {
        const iface = m6[1];
        const srcRaw = m6[2].trim();
        const dstRaw = m6[3].trim();
        const details = m6[4].toUpperCase();
        let protocol = 'IP6';
        if (details.includes('ICMP6'))
            protocol = 'ICMP6';
        else if (details.includes('UDP'))
            protocol = 'UDP';
        else if (details.includes('TCP'))
            protocol = 'TCP';
        return {
            iface,
            source: srcRaw,
            destination: dstRaw,
            protocol,
        };
    }
    // ARP examples:
    // 13:30:00.111111 eth1 In  ARP, Request who-has 10.0.0.1 tell 10.0.0.2, length 46
    // 13:30:00.111111 eth1 In  ARP, Reply 10.0.0.1 is-at 02:42:..., length 28
    const ma = line.match(/^\S+\s+(\S+)\s+\S+\s+ARP,\s+(.*)$/i);
    if (ma) {
        const iface = ma[1];
        const details = ma[2];
        const req = details.match(/who-has\s+(\S+)\s+tell\s+(\S+)/i);
        if (req) {
            return {
                iface,
                source: req[2],
                destination: req[1],
                protocol: 'ARP',
            };
        }
        const rep = details.match(/Reply\s+(\S+)\s+is-at\s+(\S+)/i);
        if (rep) {
            return {
                iface,
                source: rep[1],
                destination: rep[2],
                protocol: 'ARP',
            };
        }
        return {
            iface,
            source: 'arp',
            destination: 'arp',
            protocol: 'ARP',
        };
    }
    // Generic fallback so we don't silently drop unknown traffic lines.
    const mg = line.match(/^\S+\s+(\S+)\s+\S+\s+(.+)$/);
    if (!mg)
        return null;
    return {
        iface: mg[1],
        source: '-',
        destination: '-',
        protocol: 'OTHER',
    };
}
function ipMatches(testIpStr, ruleTargetStr) {
    if (!ruleTargetStr || ruleTargetStr.toUpperCase() === 'ANY')
        return true;
    try {
        const testIp = ipaddr_js_1.default.process(testIpStr);
        const targets = ruleTargetStr.split(',').map((t) => t.trim()).filter(Boolean);
        for (const target of targets) {
            if (target.includes('/')) {
                const cidr = ipaddr_js_1.default.parseCIDR(target);
                if (testIp.match(cidr))
                    return true;
            }
            else {
                const parsedTarget = ipaddr_js_1.default.process(target);
                if (testIp.toNormalizedString() === parsedTarget.toNormalizedString())
                    return true;
            }
        }
    }
    catch {
        return false;
    }
    return false;
}
function portMatches(packet, rulePort) {
    if (!rulePort || rulePort.toUpperCase() === 'ANY')
        return true;
    if (packet.protocol === 'ICMP' || packet.protocol === 'ICMP6' || packet.protocol === 'ARP' || packet.protocol === 'OTHER')
        return true;
    if (typeof packet.dstPort !== 'number')
        return false;
    const requestedPort = packet.dstPort;
    const parts = rulePort.split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
        if (/^\d+$/.test(part)) {
            if (Number(part) === requestedPort)
                return true;
            continue;
        }
        const range = part.match(/^(\d+)-(\d+)$/);
        if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            if (requestedPort >= start && requestedPort <= end)
                return true;
        }
    }
    return false;
}
async function refreshRulesCacheIfNeeded() {
    const now = Date.now();
    if (now - rulesCacheUpdatedAt < 2000 && rulesCache.length > 0)
        return;
    if (rulesCacheLoading)
        return rulesCacheLoading;
    rulesCacheLoading = (async () => {
        const [rules, ifaceMap] = await Promise.all([
            (0, db_1.allQuery)('SELECT * FROM rules WHERE status = 1 ORDER BY priority ASC'),
            (0, network_1.getInterfaceNameMap)(),
        ]);
        rulesCache = (rules || []);
        interfaceMapCache = ifaceMap || {};
        rulesCacheUpdatedAt = Date.now();
    })()
        .catch((err) => {
        console.error('[ws] Failed to refresh rule cache:', err);
    })
        .finally(() => {
        rulesCacheLoading = null;
    });
    return rulesCacheLoading;
}
function classifyPacket(packet) {
    // Non-L3/L4 traffic types are observed but not evaluated by firewall IP rules.
    if (!['TCP', 'UDP', 'ICMP'].includes(packet.protocol))
        return 'LOG';
    let action = 'ALLOW';
    for (const rule of rulesCache) {
        const ruleInterface = (rule.interface || 'ANY').trim();
        if (ruleInterface.toUpperCase() !== 'ANY') {
            const resolvedRuleIface = interfaceMapCache[ruleInterface] || ruleInterface;
            if (resolvedRuleIface !== packet.iface)
                continue;
        }
        const ruleProto = (rule.protocol || 'ANY').toUpperCase();
        if (ruleProto !== 'ANY' && ruleProto !== packet.protocol)
            continue;
        if (!ipMatches(packet.source, rule.source))
            continue;
        if (!ipMatches(packet.destination, rule.destination))
            continue;
        if (!portMatches(packet, rule.port))
            continue;
        const normalizedAction = (rule.action || 'ALLOW').toUpperCase();
        if (normalizedAction === 'BLOCK')
            action = 'BLOCK';
        else if (normalizedAction === 'LOG')
            action = 'LOG';
        else
            action = 'ALLOW';
        break;
    }
    return action;
}
async function buildTrafficLog(packet) {
    await refreshRulesCacheIfNeeded();
    return {
        timestamp: new Date().toISOString(),
        action: classifyPacket(packet),
        source: packet.source,
        destination: packet.destination,
        protocol: packet.protocol,
        port: packet.dstPort ?? packet.srcPort ?? (packet.protocol === 'ICMP' ? 'icmp' : ''),
        interface: packet.iface,
        country: 'Unknown',
    };
}
/** Pending broadcast queue – flushed at regular intervals. */
let broadcastQueue = [];
let broadcastTimer = null;
const BROADCAST_INTERVAL_MS = 150;
function flushBroadcastQueue() {
    if (broadcastQueue.length === 0)
        return;
    const batch = broadcastQueue;
    broadcastQueue = [];
    // Send each log entry as a separate JSON message so the client
    // parser stays simple (one JSON.parse per message).
    for (const client of clients) {
        if (client.readyState === client.OPEN) {
            for (const log of batch) {
                client.send(JSON.stringify(log));
            }
        }
    }
}
function startBroadcastTimer() {
    if (broadcastTimer)
        return;
    broadcastTimer = setInterval(flushBroadcastQueue, BROADCAST_INTERVAL_MS);
}
function stopBroadcastTimer() {
    if (broadcastTimer) {
        clearInterval(broadcastTimer);
        broadcastTimer = null;
    }
    flushBroadcastQueue(); // flush remaining
}
function broadcast(log) {
    broadcastQueue.push(log);
}
function stopCapture() {
    if (!captureProc)
        return;
    captureProc.kill('SIGTERM');
    captureProc = null;
    captureBuffer = '';
    stopBroadcastTimer();
}
function startCapture() {
    if (captureProc)
        return;
    // Capture only packet headers (-s 96); -l makes output line-buffered for streaming.
    captureProc = (0, child_process_1.spawn)('tcpdump', ['-l', '-n', '-i', 'any', '-s', '96'], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const proc = captureProc;
    startBroadcastTimer();
    proc.stdout.on('data', (chunk) => {
        captureBuffer += chunk.toString('utf-8');
        const lines = captureBuffer.split('\n');
        captureBuffer = lines.pop() ?? '';
        for (const line of lines) {
            const parsed = parseTcpdumpLine(line.trim());
            if (!parsed)
                continue;
            void buildTrafficLog(parsed)
                .then((log) => broadcast(log))
                .catch((err) => console.error('[ws] Failed to parse/classify packet:', err));
        }
    });
    proc.stderr.on('data', (chunk) => {
        // Keep stderr for diagnostics only.
        const msg = chunk.toString('utf-8').trim();
        if (msg)
            console.warn(`[ws/tcpdump] ${msg}`);
    });
    proc.on('exit', () => {
        captureProc = null;
        captureBuffer = '';
        stopBroadcastTimer();
        // Auto-restart capture if clients are still connected.
        if (clients.size > 0)
            startCapture();
    });
}
function setupWebSocket(server) {
    const logsWss = new ws_1.WebSocketServer({ noServer: true });
    logsWss.on('connection', (ws) => {
        clients.add(ws);
        if (clients.size === 1)
            startCapture();
        console.log('Client connected to live log stream');
        ws.on('close', () => {
            clients.delete(ws);
            if (clients.size === 0)
                stopCapture();
            console.log('Client disconnected from live log stream');
        });
    });
    const shellWss = new ws_1.WebSocketServer({ noServer: true });
    shellWss.on('connection', (ws, req) => {
        const JWT_SECRET = process.env.JWT_SECRET || 'supersecretfirewallkey';
        const url = new URL(req.url || '/api/shell', 'http://localhost');
        const token = (url.searchParams.get('token') || '').trim();
        if (!token) {
            ws.close(1008, 'Missing token');
            return;
        }
        try {
            jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch {
            ws.close(1008, 'Invalid token');
            return;
        }
        // Spawn a real PTY shell session
        let shell = null;
        try {
            shell = pty.spawn('/bin/bash', ['--login'], {
                name: 'xterm-256color',
                cols: 120,
                rows: 30,
                cwd: '/',
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                },
            });
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            ws.send(JSON.stringify({ type: 'error', message: `Failed to spawn shell: ${errMsg}` }));
            ws.close(1011, 'Shell spawn failed');
            return;
        }
        const currentShell = shell;
        // Notify the frontend that the shell is ready
        ws.send(JSON.stringify({ type: 'ready', pid: currentShell.pid }));
        // Forward PTY output to the WebSocket
        currentShell.onData((data) => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'output', data }));
            }
        });
        currentShell.onExit(({ exitCode, signal }) => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'exit', code: exitCode, signal }));
                ws.close(1000, 'Shell exited');
            }
            shell = null;
        });
        // Handle messages from the frontend
        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString('utf-8'));
            }
            catch {
                // If it's not JSON, treat it as raw terminal input
                if (shell)
                    shell.write(raw.toString('utf-8'));
                return;
            }
            if (!shell) {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Shell process is not running' }));
                }
                return;
            }
            const action = String(msg?.action || '').toLowerCase();
            if (action === 'input') {
                const data = String(msg?.data || '');
                if (data)
                    shell.write(data);
                return;
            }
            if (action === 'resize') {
                const cols = Number(msg?.cols) || 120;
                const rows = Number(msg?.rows) || 30;
                shell.resize(cols, rows);
                return;
            }
            if (action === 'signal') {
                const signal = String(msg?.signal || 'SIGINT').toUpperCase();
                if (signal === 'SIGINT') {
                    // Send Ctrl+C character
                    shell.write('\x03');
                }
                else if (signal === 'SIGTERM') {
                    shell.kill('SIGTERM');
                }
                return;
            }
        });
        ws.on('close', () => {
            if (shell) {
                shell.kill('SIGTERM');
                shell = null;
            }
        });
    });
    server.on('upgrade', (req, socket, head) => {
        let pathname = '';
        try {
            const url = new URL(req.url || '/', 'http://localhost');
            pathname = url.pathname;
        }
        catch {
            socket.destroy();
            return;
        }
        if (pathname === '/api/logs') {
            logsWss.handleUpgrade(req, socket, head, (ws) => {
                logsWss.emit('connection', ws, req);
            });
            return;
        }
        if (pathname === '/api/shell') {
            shellWss.handleUpgrade(req, socket, head, (ws) => {
                shellWss.emit('connection', ws, req);
            });
            return;
        }
        socket.destroy();
    });
}
