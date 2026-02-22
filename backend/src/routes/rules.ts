import { Router } from 'express';
import { db, allQuery, runQuery } from '../db';
import { authenticate } from '../middleware/auth';
import ipaddr from 'ipaddr.js';
import { applyAllRules } from '../nftables';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const rules = await allQuery('SELECT * FROM rules ORDER BY priority ASC');
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch rules' });
    }
});

router.post('/', async (req, res) => {
    const { priority, name, action, interface: netInterface, source, destination, protocol, port, status } = req.body;
    try {
        const info = await runQuery(
            'INSERT INTO rules (priority, name, action, interface, source, destination, protocol, port, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [priority, name, action, netInterface || 'ANY', source, destination, protocol, port, status === false ? 0 : 1]
        );
        res.json({ id: info.lastInsertRowid });
        applyAllRules().catch(err => console.error('[nftables] Sync after create failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to create rule' });
    }
});

router.put('/:id', async (req, res) => {
    const { priority, name, action, interface: netInterface, source, destination, protocol, port, status } = req.body;
    try {
        await runQuery(
            'UPDATE rules SET priority=?, name=?, action=?, interface=?, source=?, destination=?, protocol=?, port=?, status=? WHERE id=?',
            [priority, name, action, netInterface || 'ANY', source, destination, protocol, port, status === false ? 0 : 1, req.params.id]
        );
        res.json({ success: true });
        applyAllRules().catch(err => console.error('[nftables] Sync after update failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to update rule' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await runQuery('DELETE FROM rules WHERE id=?', [req.params.id]);
        res.json({ success: true });
        applyAllRules().catch(err => console.error('[nftables] Sync after delete failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});

router.post('/reorder', async (req, res) => {
    const { rules } = req.body; // array of {id, priority}
    try {
        db.serialize(() => {
            for (const update of rules) {
                db.run('UPDATE rules SET priority=? WHERE id=?', [update.priority, update.id]);
            }
        });
        res.json({ success: true });
        applyAllRules().catch(err => console.error('[nftables] Sync after reorder failed:', err));
    } catch (e) {
        res.status(500).json({ error: 'Failed to reorder rules' });
    }
});

router.post('/test', async (req, res) => {
    const { interface: netInterface, source, destination, protocol, port } = req.body;

    try {
        const rules = await allQuery('SELECT * FROM rules WHERE status = 1 ORDER BY priority ASC');
        let finalAction = 'ALLOW'; // Default policy
        let matchedRuleId = null;

        for (const rule of rules) {
            // 1. Interface Match
            if (rule.interface !== 'ANY' && rule.interface !== netInterface) continue;

            // 2. Protocol Match
            if (rule.protocol !== 'ANY' && rule.protocol !== protocol) continue;

            // 3. Port Match
            if (rule.port !== 'ANY' && rule.port !== port.toString()) {
                // Handle port ranges briefly (e.g. 80,443 or 80-90)
                const ports = rule.port.split(',').map((p: string) => p.trim());
                if (!ports.includes(port.toString())) {
                    // Very basic range check
                    let rangeMatch = false;
                    for (const pr of ports) {
                        if (pr.includes('-')) {
                            const [start, end] = pr.split('-');
                            if (parseInt(port) >= parseInt(start) && parseInt(port) <= parseInt(end)) {
                                rangeMatch = true;
                                break;
                            }
                        }
                    }
                    if (!rangeMatch) continue;
                }
            }

            // Helper for IP Matching
            const ipMatches = (testIpStr: string, ruleTargetStr: string) => {
                if (ruleTargetStr === 'ANY') return true;

                try {
                    const testIp = ipaddr.process(testIpStr);
                    const targets = ruleTargetStr.split(',').map((t: string) => t.trim());

                    for (const target of targets) {
                        if (target.includes('/')) {
                            const parsedRange = ipaddr.parseCIDR(target);
                            if (testIp.match(parsedRange)) return true;
                        } else {
                            const parsedTarget = ipaddr.process(target);
                            if (testIp.toNormalizedString() === parsedTarget.toNormalizedString()) return true;
                        }
                    }
                } catch (e) {
                    // Invalid IP format
                    return false;
                }
                return false;
            };

            // 4. Source Match
            if (!ipMatches(source, rule.source)) continue;

            // 5. Destination Match
            if (!ipMatches(destination, rule.destination)) continue;

            // All matched!
            finalAction = rule.action;
            matchedRuleId = rule.id;
            break;
        }

        res.json({ action: finalAction, ruleId: matchedRuleId });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to run firewall simulation' });
    }
});

export default router;
