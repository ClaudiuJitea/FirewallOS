"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const nftables_1 = require("../nftables");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (req, res) => {
    try {
        const rules = await (0, db_1.allQuery)('SELECT * FROM nat_rules ORDER BY priority ASC');
        res.json(rules);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch NAT rules' });
    }
});
router.post('/', async (req, res) => {
    const { priority, type, name, interface: iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status } = req.body;
    try {
        const info = await (0, db_1.runQuery)('INSERT INTO nat_rules (priority, type, name, interface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [priority, type, name, iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status === false ? 0 : 1]);
        res.json({ id: info.lastInsertRowid });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after NAT create failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create NAT rule' });
    }
});
router.put('/:id', async (req, res) => {
    const { priority, type, name, interface: iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status } = req.body;
    try {
        await (0, db_1.runQuery)('UPDATE nat_rules SET priority=?, type=?, name=?, interface=?, original_source=?, original_destination=?, protocol=?, original_port=?, translated_ip=?, translated_port=?, status=? WHERE id=?', [priority, type, name, iface, original_source, original_destination, protocol, original_port, translated_ip, translated_port, status === false ? 0 : 1, req.params.id]);
        res.json({ success: true });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after NAT update failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to update NAT rule' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        await (0, db_1.runQuery)('DELETE FROM nat_rules WHERE id=?', [req.params.id]);
        res.json({ success: true });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after NAT delete failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete NAT rule' });
    }
});
router.post('/reorder', async (req, res) => {
    const { rules } = req.body;
    try {
        db_1.db.serialize(() => {
            for (const update of rules) {
                db_1.db.run('UPDATE nat_rules SET priority=? WHERE id=?', [update.priority, update.id]);
            }
        });
        res.json({ success: true });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after NAT reorder failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to reorder NAT rules' });
    }
});
exports.default = router;
