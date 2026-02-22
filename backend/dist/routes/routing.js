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
        const rules = await (0, db_1.allQuery)('SELECT * FROM routes ORDER BY id DESC');
        res.json(rules);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch routing table' });
    }
});
router.post('/', async (req, res) => {
    const { destination, gateway, interface: iface, metric, status, description } = req.body;
    try {
        const info = await (0, db_1.runQuery)('INSERT INTO routes (destination, gateway, interface, metric, status, description) VALUES (?, ?, ?, ?, ?, ?)', [destination, gateway, iface, metric || 1, status === false ? 0 : 1, description]);
        res.json({ id: info.lastInsertRowid });
        (0, nftables_1.applyRoutes)().catch(err => console.error('[routing] Sync after create failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create route' });
    }
});
router.put('/:id', async (req, res) => {
    const { destination, gateway, interface: iface, metric, status, description } = req.body;
    try {
        await (0, db_1.runQuery)('UPDATE routes SET destination=?, gateway=?, interface=?, metric=?, status=?, description=? WHERE id=?', [destination, gateway, iface, metric || 1, status === false ? 0 : 1, description, req.params.id]);
        res.json({ success: true });
        (0, nftables_1.applyRoutes)().catch(err => console.error('[routing] Sync after update failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to update route' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        await (0, db_1.runQuery)('DELETE FROM routes WHERE id=?', [req.params.id]);
        res.json({ success: true });
        (0, nftables_1.applyRoutes)().catch(err => console.error('[routing] Sync after delete failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete route' });
    }
});
exports.default = router;
