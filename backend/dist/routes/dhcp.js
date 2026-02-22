"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const dnsmasq_1 = require("../dnsmasq");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ==================== DHCP Pools ====================
router.get('/pools', async (req, res) => {
    try {
        const pools = await (0, db_1.allQuery)('SELECT * FROM dhcp_pools ORDER BY id DESC');
        res.json(pools);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch DHCP pools' });
    }
});
router.post('/pools', async (req, res) => {
    const { interface: iface, range_start, range_end, subnet_mask, gateway, dns_servers, lease_time, domain, status } = req.body;
    try {
        const info = await (0, db_1.runQuery)('INSERT INTO dhcp_pools (interface, range_start, range_end, subnet_mask, gateway, dns_servers, lease_time, domain, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [iface, range_start, range_end, subnet_mask || '255.255.255.0', gateway, dns_servers || '8.8.8.8,8.8.4.4', lease_time || 86400, domain || '', status === false ? 0 : 1]);
        res.json({ id: info.lastInsertRowid });
        (0, dnsmasq_1.applyDhcpConfig)().catch(err => console.error('[dhcp] Sync after pool create failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create DHCP pool' });
    }
});
router.put('/pools/:id', async (req, res) => {
    const { interface: iface, range_start, range_end, subnet_mask, gateway, dns_servers, lease_time, domain, status } = req.body;
    try {
        await (0, db_1.runQuery)('UPDATE dhcp_pools SET interface=?, range_start=?, range_end=?, subnet_mask=?, gateway=?, dns_servers=?, lease_time=?, domain=?, status=? WHERE id=?', [iface, range_start, range_end, subnet_mask || '255.255.255.0', gateway, dns_servers || '8.8.8.8,8.8.4.4', lease_time || 86400, domain || '', status === false ? 0 : 1, req.params.id]);
        res.json({ success: true });
        (0, dnsmasq_1.applyDhcpConfig)().catch(err => console.error('[dhcp] Sync after pool update failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to update DHCP pool' });
    }
});
router.delete('/pools/:id', async (req, res) => {
    try {
        await (0, db_1.runQuery)('DELETE FROM dhcp_static_leases WHERE pool_id=?', [req.params.id]);
        await (0, db_1.runQuery)('DELETE FROM dhcp_pools WHERE id=?', [req.params.id]);
        res.json({ success: true });
        (0, dnsmasq_1.applyDhcpConfig)().catch(err => console.error('[dhcp] Sync after pool delete failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete DHCP pool' });
    }
});
// ==================== Static Leases ====================
router.get('/leases', async (req, res) => {
    try {
        const leases = await (0, db_1.allQuery)('SELECT * FROM dhcp_static_leases ORDER BY id DESC');
        res.json(leases);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch static leases' });
    }
});
router.post('/leases', async (req, res) => {
    const { pool_id, mac_address, ip_address, hostname, description, status } = req.body;
    try {
        const info = await (0, db_1.runQuery)('INSERT INTO dhcp_static_leases (pool_id, mac_address, ip_address, hostname, description, status) VALUES (?, ?, ?, ?, ?, ?)', [pool_id, mac_address, ip_address, hostname || '', description || '', status === false ? 0 : 1]);
        res.json({ id: info.lastInsertRowid });
        (0, dnsmasq_1.applyDhcpConfig)().catch(err => console.error('[dhcp] Sync after lease create failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create static lease' });
    }
});
router.put('/leases/:id', async (req, res) => {
    const { pool_id, mac_address, ip_address, hostname, description, status } = req.body;
    try {
        await (0, db_1.runQuery)('UPDATE dhcp_static_leases SET pool_id=?, mac_address=?, ip_address=?, hostname=?, description=?, status=? WHERE id=?', [pool_id, mac_address, ip_address, hostname || '', description || '', status === false ? 0 : 1, req.params.id]);
        res.json({ success: true });
        (0, dnsmasq_1.applyDhcpConfig)().catch(err => console.error('[dhcp] Sync after lease update failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to update static lease' });
    }
});
router.delete('/leases/:id', async (req, res) => {
    try {
        await (0, db_1.runQuery)('DELETE FROM dhcp_static_leases WHERE id=?', [req.params.id]);
        res.json({ success: true });
        (0, dnsmasq_1.applyDhcpConfig)().catch(err => console.error('[dhcp] Sync after lease delete failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete static lease' });
    }
});
// ==================== Active Leases (live from OS) ====================
router.get('/active-leases', async (req, res) => {
    try {
        const leases = (0, dnsmasq_1.getDhcpLeases)();
        res.json(leases);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to read active leases' });
    }
});
exports.default = router;
