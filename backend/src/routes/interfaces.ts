import express from 'express';
import { runQuery, allQuery, getQuery } from '../db';
import { authenticate } from '../middleware/auth';
import { applyAllInterfaceConfigs, applyInterfaceConfig } from '../network';

const router = express.Router();

router.use(authenticate);

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
