import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getQuery, runQuery } from '../db';
import { hashPassword, isHashedPassword, verifyPassword } from '../security/password';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretfirewallkey';

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    try {
        const user: any = await getQuery('SELECT * FROM users WHERE username = ?', [username]);

        if (!user || user.active === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const validPassword = await verifyPassword(password, user.password);
        if (!validPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        // Transparently upgrade legacy plain-text passwords on next successful login.
        if (!isHashedPassword(user.password)) {
            const upgradedPassword = await hashPassword(password);
            await runQuery('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [upgradedPassword, user.id]);
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role, active: user.active }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/logout', async (_req, res) => {
    // JWT is stateless in current architecture; logout is handled client-side
    // by dropping the token. This endpoint exists for explicit logout flow.
    res.json({ success: true });
});

export default router;
