import express from 'express';
import { runQuery, allQuery, getQuery } from '../db';
import { authenticate } from '../middleware/auth';
import { applyAllInterfaceConfigs, applyInterfaceConfig } from '../network';
import { execSync } from 'child_process';

const router = express.Router();

router.use(authenticate);

type PhysicalIface = {
    name: string;
    state: string;
    configured: boolean;
    inUseBy: string[];
};

function getPhysicalInterfaces(): Array<{ name: string; state: string }> {
    try {
        const out = execSync('ip -o link show', { encoding: 'utf-8', timeout: 10000 });
        return out
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                // Format: "2: eth0@if53: <...> mtu ... state UP ..."
                const m = line.match(/^\d+:\s+([^:]+):.*\bstate\s+(\S+)/i);
                if (!m) return null;
                const rawName = m[1];
                const name = rawName.split('@')[0];
                const state = (m[2] || 'UNKNOWN').toUpperCase();
                if (!name || name === 'lo') return null;
                return { name, state };
            })
            .filter((x): x is { name: string; state: string } => !!x);
    } catch {
        return [];
    }
}

// Discover physical interfaces available in the runtime container.
router.get('/available-physical', async (_req, res) => {
    try {
        const configuredInterfaces = await allQuery('SELECT name, physical_interface FROM interfaces ORDER BY name ASC');
        const configuredByPhysical = new Map<string, string[]>();
        for (const row of configuredInterfaces) {
            const physical = String(row.physical_interface || '').trim();
            const logical = String(row.name || '').trim();
            if (!physical || !logical) continue;
            const list = configuredByPhysical.get(physical) || [];
            list.push(logical);
            configuredByPhysical.set(physical, list);
        }

        const found = getPhysicalInterfaces();
        const result: PhysicalIface[] = found.map((iface) => {
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
            if (result.some((x) => x.name === physical)) continue;
            result.push({
                name: physical,
                state: 'MISSING',
                configured: true,
                inUseBy,
            });
        }

        res.json(result.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
        res.status(500).json({ error: 'Failed to discover physical interfaces' });
    }
});

// Get all interfaces
router.get('/', async (req, res) => {
    try {
        const interfaces = await allQuery('SELECT * FROM interfaces ORDER BY name ASC');
        res.json(interfaces);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch interfaces' });
    }
});

// Create a new interface
router.post('/', async (req, res) => {
    const { name, physical_interface, ip_address, netmask, status } = req.body;
    try {
        const result = await runQuery(
            'INSERT INTO interfaces (name, physical_interface, ip_address, netmask, status) VALUES (?, ?, ?, ?, ?)',
            [name, physical_interface, ip_address, netmask, status ?? 1]
        );
        const created = await getQuery('SELECT * FROM interfaces WHERE id = ?', [result.lastInsertRowid]);
        await applyInterfaceConfig(created);
        res.status(201).json({ id: result.lastInsertRowid, name, physical_interface, ip_address, netmask, status: status ?? 1 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create interface' });
    }
});

// Update an interface
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, physical_interface, ip_address, netmask, status } = req.body;
    try {
        await runQuery(
            'UPDATE interfaces SET name = ?, physical_interface = ?, ip_address = ?, netmask = ?, status = ? WHERE id = ?',
            [name, physical_interface, ip_address, netmask, status, id]
        );
        const updated = await getQuery('SELECT * FROM interfaces WHERE id = ?', [id]);
        await applyInterfaceConfig(updated);
        res.json({ id: Number(id), name, physical_interface, ip_address, netmask, status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update interface' });
    }
});

// Delete an interface
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await runQuery('DELETE FROM interfaces WHERE id = ?', [id]);
        // Reapply remaining interfaces to keep runtime state in sync.
        await applyAllInterfaceConfigs();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete interface' });
    }
});

export default router;
