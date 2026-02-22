"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const password_1 = require("../security/password");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
function isAdmin(req) {
    return req.user?.role === 'admin';
}
router.get('/me', async (req, res) => {
    try {
        const me = await (0, db_1.getQuery)('SELECT id, username, role, active, created_at, updated_at FROM users WHERE id = ?', [req.user?.id]);
        if (!me) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(me);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});
router.post('/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword || newPassword.length < 8) {
        res.status(400).json({ error: 'Current password and a new password (min 8 chars) are required' });
        return;
    }
    try {
        const user = await (0, db_1.getQuery)('SELECT id, password, active FROM users WHERE id = ?', [req.user?.id]);
        if (!user || user.active === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const isValid = await (0, password_1.verifyPassword)(currentPassword, user.password);
        if (!isValid) {
            res.status(400).json({ error: 'Current password is incorrect' });
            return;
        }
        const hashed = await (0, password_1.hashPassword)(newPassword);
        await (0, db_1.runQuery)('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashed, req.user?.id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});
router.get('/', async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    try {
        const users = await (0, db_1.allQuery)('SELECT id, username, role, active, created_at, updated_at FROM users ORDER BY username ASC');
        res.json(users);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
router.post('/', async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    const { username, password, role, active } = req.body ?? {};
    if (!username || !password || !role) {
        res.status(400).json({ error: 'Username, password, and role are required' });
        return;
    }
    if (!['admin', 'operator'].includes(role)) {
        res.status(400).json({ error: 'Role must be admin or operator' });
        return;
    }
    if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
    }
    try {
        const hashed = await (0, password_1.hashPassword)(password);
        const result = await (0, db_1.runQuery)('INSERT INTO users (username, password, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [username, hashed, role, active === 0 ? 0 : 1]);
        const created = await (0, db_1.getQuery)('SELECT id, username, role, active, created_at, updated_at FROM users WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(created);
    }
    catch (error) {
        if (String(error?.message || '').includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});
router.put('/:id', async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    const userId = Number(req.params.id);
    const { role, active, password } = req.body ?? {};
    if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    if (role && !['admin', 'operator'].includes(role)) {
        res.status(400).json({ error: 'Role must be admin or operator' });
        return;
    }
    if (password && password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
    }
    try {
        const target = await (0, db_1.getQuery)('SELECT id, role, active FROM users WHERE id = ?', [userId]);
        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (target.role === 'admin' && role === 'operator') {
            const countAdmins = await (0, db_1.getQuery)('SELECT COUNT(*) as count FROM users WHERE role = ? AND active = 1', ['admin']);
            if ((countAdmins?.count ?? 0) <= 1) {
                res.status(400).json({ error: 'At least one active admin is required' });
                return;
            }
        }
        if (target.role === 'admin' && active === 0) {
            const countAdmins = await (0, db_1.getQuery)('SELECT COUNT(*) as count FROM users WHERE role = ? AND active = 1', ['admin']);
            if ((countAdmins?.count ?? 0) <= 1) {
                res.status(400).json({ error: 'At least one active admin is required' });
                return;
            }
        }
        const nextRole = role ?? target.role;
        const nextActive = typeof active === 'number' ? (active === 0 ? 0 : 1) : target.active;
        if (password) {
            const hashed = await (0, password_1.hashPassword)(password);
            await (0, db_1.runQuery)('UPDATE users SET role = ?, active = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextRole, nextActive, hashed, userId]);
        }
        else {
            await (0, db_1.runQuery)('UPDATE users SET role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextRole, nextActive, userId]);
        }
        const updated = await (0, db_1.getQuery)('SELECT id, username, role, active, created_at, updated_at FROM users WHERE id = ?', [userId]);
        res.json(updated);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});
router.delete('/:id', async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    if (userId === req.user?.id) {
        res.status(400).json({ error: 'You cannot delete your own account' });
        return;
    }
    try {
        const target = await (0, db_1.getQuery)('SELECT id, role, active FROM users WHERE id = ?', [userId]);
        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (target.role === 'admin' && target.active === 1) {
            const countAdmins = await (0, db_1.getQuery)('SELECT COUNT(*) as count FROM users WHERE role = ? AND active = 1', ['admin']);
            if ((countAdmins?.count ?? 0) <= 1) {
                res.status(400).json({ error: 'At least one active admin is required' });
                return;
            }
        }
        await (0, db_1.runQuery)('DELETE FROM users WHERE id = ?', [userId]);
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
exports.default = router;
