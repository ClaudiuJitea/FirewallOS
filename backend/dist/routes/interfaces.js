"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const network_1 = require("../network");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
// Get all interfaces
router.get('/', async (req, res) => {
    try {
        const interfaces = await (0, db_1.allQuery)('SELECT * FROM interfaces ORDER BY name ASC');
        res.json(interfaces);
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
