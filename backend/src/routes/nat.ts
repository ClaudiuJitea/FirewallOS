import { Router } from 'express';
import { db, allQuery, runQuery } from '../db';
import { authenticate } from '../middleware/auth';
import { applyAllRules } from '../nftables';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const rules = await allQuery('SELECT * FROM nat_rules ORDER BY priority ASC');
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch NAT rules' });
    }
});

router.post('/', async (req, res) => {
    const { priority, type, name, interface: iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status } = req.body;
    try {
        const info = await runQuery(
            'INSERT INTO nat_rules (priority, type, name, interface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [priority, type, name, iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status === false ? 0 : 1]
        );
        res.json({ id: info.lastInsertRowid });
        applyAllRules().catch(err => console.error('[nftables] Sync after NAT create failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to create NAT rule' });
    }
});

router.put('/:id', async (req, res) => {
    const { priority, type, name, interface: iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status } = req.body;
    try {
        await runQuery(
            'UPDATE nat_rules SET priority=?, type=?, name=?, interface=?, original_source=?, original_destination=?, protocol=?, original_port=?, translated_ip=?, translated_port=?, status=? WHERE id=?',
            [priority, type, name, iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status === false ? 0 : 1, req.params.id]
        );
        res.json({ success: true });
        applyAllRules().catch(err => console.error('[nftables] Sync after NAT update failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to update NAT rule' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await runQuery('DELETE FROM nat_rules WHERE id=?', [req.params.id]);
        res.json({ success: true });
        applyAllRules().catch(err => console.error('[nftables] Sync after NAT delete failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete NAT rule' });
    }
});

router.post('/reorder', async (req, res) => {
    const { rules } = req.body;
    try {
        db.serialize(() => {
            for (const update of rules) {
                db.run('UPDATE nat_rules SET priority=? WHERE id=?', [update.priority, update.id]);
            }
        });
        res.json({ success: true });
        applyAllRules().catch(err => console.error('[nftables] Sync after NAT reorder failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to reorder NAT rules' });
    }
});

export default router;
