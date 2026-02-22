"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const password_1 = require("../security/password");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretfirewallkey';
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }
    try {
        const user = await (0, db_1.getQuery)('SELECT * FROM users WHERE username = ?', [username]);
        if (!user || user.active === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const validPassword = await (0, password_1.verifyPassword)(password, user.password);
        if (!validPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        // Transparently upgrade legacy plain-text passwords on next successful login.
        if (!(0, password_1.isHashedPassword)(user.password)) {
            const upgradedPassword = await (0, password_1.hashPassword)(password);
            await (0, db_1.runQuery)('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [upgradedPassword, user.id]);
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role, active: user.active }
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});
router.post('/logout', async (_req, res) => {
    // JWT is stateless in current architecture; logout is handled client-side
    // by dropping the token. This endpoint exists for explicit logout flow.
    res.json({ success: true });
});
exports.default = router;
