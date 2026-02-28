"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const network_1 = require("../network");
const child_process_1 = require("child_process");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
function getPhysicalInterfaces() {
    try {
        const out = (0, child_process_1.execSync)('ip -o link show', { encoding: 'utf-8', timeout: 10000 });
        return out
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
            // Format: "2: eth0@if53: <...> mtu ... state UP ..."
            const m = line.match(/^\d+:\s+([^:]+):.*\bstate\s+(\S+)/i);
            if (!m)
                return null;
            const rawName = m[1];
            const name = rawName.split('@')[0];
            const state = (m[2] || 'UNKNOWN').toUpperCase();
            if (!name || name === 'lo')
                return null;
            return { name, state };
        })
            .filter((x) => !!x);
    }
    catch {
        return [];
    }
}
// Discover physical interfaces available in the runtime container.
router.get('/available-physical', async (_req, res) => {
    try {
        const configuredInterfaces = await (0, db_1.allQuery)('SELECT name, physical_interface FROM interfaces ORDER BY name ASC');
        const configuredByPhysical = new Map();
        for (const row of configuredInterfaces) {
            const physical = String(row.physical_interface || '').trim();
            const logical = String(row.name || '').trim();
            if (!physical || !logical)
                continue;
            const list = configuredByPhysical.get(physical) || [];
            list.push(logical);
            configuredByPhysical.set(physical, list);
        }
        const found = getPhysicalInterfaces();
        const result = found.map((iface) => {
            const inUseBy = configuredByPhysical.get(iface.name) || [];
            return {
                name: iface.name,
                state: iface.state,
                configured: inUseBy.length > 0,
                inUseBy,
            };
        });
        // Also include interfaces referenced in DB but not currently visible in kernel output.
        for (const [physical, inUseBy] of configuredByPhysical.entries()) {
            if (result.some((x) => x.name === physical))
                continue;
            result.push({
                name: physical,
                state: 'MISSING',
                configured: true,
                inUseBy,
            });
        }
        res.json(result.sort((a, b) => a.name.localeCompare(b.name)));
    }
    catch {
        res.status(500).json({ error: 'Failed to discover physical interfaces' });
    }
});
// Get all interfaces
router.get('/', async (req, res) => {
    try {
        const interfaces = await (0, db_1.allQuery)('SELECT * FROM interfaces ORDER BY name ASC');
        const runtimeIpv4 = (0, network_1.getRuntimeIpv4ByInterface)();
        const hydrated = interfaces.map((iface) => {
            const physical = String(iface.physical_interface || '').trim();
            const fallback = runtimeIpv4[physical];
            const hasIp = String(iface.ip_address || '').trim().length > 0;
            const hasNetmask = String(iface.netmask || '').trim().length > 0;
            return {
                ...iface,
                ip_address: hasIp ? iface.ip_address : (fallback?.ip_address || ''),
                netmask: hasNetmask ? iface.netmask : (fallback?.netmask || ''),
            };
        });
        res.json(hydrated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch interfaces' });
    }
});
// Create a new interface
router.post('/', async (req, res) => {
    const { name, physical_interface, ip_address, netmask, status } = req.body;
    try {
        const result = await (0, db_1.runQuery)('INSERT INTO interfaces (name, physical_interface, ip_address, netmask, status) VALUES (?, ?, ?, ?, ?)', [name, physical_interface, ip_address, netmask, status ?? 1]);
        const created = await (0, db_1.getQuery)('SELECT * FROM interfaces WHERE id = ?', [result.lastInsertRowid]);
        await (0, network_1.applyInterfaceConfig)(created);
        res.status(201).json({ id: result.lastInsertRowid, name, physical_interface, ip_address, netmask, status: status ?? 1 });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create interface' });
    }
});
// Update an interface
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, physical_interface, ip_address, netmask, status } = req.body;
    try {
        await (0, db_1.runQuery)('UPDATE interfaces SET name = ?, physical_interface = ?, ip_address = ?, netmask = ?, status = ? WHERE id = ?', [name, physical_interface, ip_address, netmask, status, id]);
        const updated = await (0, db_1.getQuery)('SELECT * FROM interfaces WHERE id = ?', [id]);
        await (0, network_1.applyInterfaceConfig)(updated);
        res.json({ id: Number(id), name, physical_interface, ip_address, netmask, status });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update interface' });
    }
});
// Delete an interface
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await (0, db_1.runQuery)('DELETE FROM interfaces WHERE id = ?', [id]);
        // Reapply remaining interfaces to keep runtime state in sync.
        await (0, network_1.applyAllInterfaceConfigs)();
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete interface' });
    }
});
exports.default = router;
