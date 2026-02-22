import { Router } from 'express';
import { db, allQuery, runQuery } from '../db';
import { authenticate } from '../middleware/auth';
import { applyRoutes } from '../nftables';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const rules = await allQuery('SELECT * FROM routes ORDER BY id DESC');
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch routing table' });
    }
});

router.post('/', async (req, res) => {
    const { destination, gateway, interface: iface, metric, status, description } = req.body;
    try {
        const info = await runQuery(
            'INSERT INTO routes (destination, gateway, interface, metric, status, description) VALUES (?, ?, ?, ?, ?, ?)',
            [destination, gateway, iface, metric || 1, status === false ? 0 : 1, description]
        );
        res.json({ id: info.lastInsertRowid });
        applyRoutes().catch(err => console.error('[routing] Sync after create failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to create route' });
    }
});

router.put('/:id', async (req, res) => {
    const { destination, gateway, interface: iface, metric, status, description } = req.body;
    try {
        await runQuery(
            'UPDATE routes SET destination=?, gateway=?, interface=?, metric=?, status=?, description=? WHERE id=?',
            [destination, gateway, iface, metric || 1, status === false ? 0 : 1, description, req.params.id]
        );
        res.json({ success: true });
        applyRoutes().catch(err => console.error('[routing] Sync after update failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to update route' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await runQuery('DELETE FROM routes WHERE id=?', [req.params.id]);
        res.json({ success: true });
        applyRoutes().catch(err => console.error('[routing] Sync after delete failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete route' });
    }
});

export default router;
