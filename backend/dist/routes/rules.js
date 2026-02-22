"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const ipaddr_js_1 = __importDefault(require("ipaddr.js"));
const nftables_1 = require("../nftables");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (req, res) => {
    try {
        const rules = await (0, db_1.allQuery)('SELECT * FROM rules ORDER BY priority ASC');
        res.json(rules);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch rules' });
    }
});
router.post('/', async (req, res) => {
    const { priority, name, action, interface: netInterface, source, destination, protocol, port, status } = req.body;
    try {
        const info = await (0, db_1.runQuery)('INSERT INTO rules (priority, name, action, interface, source, destination, protocol, port, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [priority, name, action, netInterface || 'ANY', source, destination, protocol, port, status === false ? 0 : 1]);
        res.json({ id: info.lastInsertRowid });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after create failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create rule' });
    }
});
router.put('/:id', async (req, res) => {
    const { priority, name, action, interface: netInterface, source, destination, protocol, port, status } = req.body;
    try {
        await (0, db_1.runQuery)('UPDATE rules SET priority=?, name=?, action=?, interface=?, source=?, destination=?, protocol=?, port=?, status=? WHERE id=?', [priority, name, action, netInterface || 'ANY', source, destination, protocol, port, status === false ? 0 : 1, req.params.id]);
        res.json({ success: true });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after update failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to update rule' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        await (0, db_1.runQuery)('DELETE FROM rules WHERE id=?', [req.params.id]);
        res.json({ success: true });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after delete failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});
router.post('/reorder', async (req, res) => {
    const { rules } = req.body; // array of {id, priority}
    try {
        db_1.db.serialize(() => {
            for (const update of rules) {
                db_1.db.run('UPDATE rules SET priority=? WHERE id=?', [update.priority, update.id]);
            }
        });
        res.json({ success: true });
        (0, nftables_1.applyAllRules)().catch(err => console.error('[nftables] Sync after reorder failed:', err));
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to reorder rules' });
    }
});
router.post('/test', async (req, res) => {
    const { interface: netInterface, source, destination, protocol, port } = req.body;
    try {
        const rules = await (0, db_1.allQuery)('SELECT * FROM rules WHERE status = 1 ORDER BY priority ASC');
        let finalAction = 'ALLOW'; // Default policy
        let matchedRuleId = null;
        for (const rule of rules) {
            // 1. Interface Match
            if (rule.interface !== 'ANY' && rule.interface !== netInterface)
                continue;
            // 2. Protocol Match
            if (rule.protocol !== 'ANY' && rule.protocol !== protocol)
                continue;
            // 3. Port Match
            if (rule.port !== 'ANY' && rule.port !== port.toString()) {
                // Handle port ranges briefly (e.g. 80,443 or 80-90)
                const ports = rule.port.split(',').map((p) => p.trim());
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
                    if (!rangeMatch)
                        continue;
                }
            }
            // Helper for IP Matching
            const ipMatches = (testIpStr, ruleTargetStr) => {
                if (ruleTargetStr === 'ANY')
                    return true;
                try {
                    const testIp = ipaddr_js_1.default.process(testIpStr);
                    const targets = ruleTargetStr.split(',').map((t) => t.trim());
                    for (const target of targets) {
                        if (target.includes('/')) {
                            const parsedRange = ipaddr_js_1.default.parseCIDR(target);
                            if (testIp.match(parsedRange))
                                return true;
                        }
                        else {
                            const parsedTarget = ipaddr_js_1.default.process(target);
                            if (testIp.toNormalizedString() === parsedTarget.toNormalizedString())
                                return true;
                        }
                    }
                }
                catch (e) {
                    // Invalid IP format
                    return false;
                }
                return false;
            };
            // 4. Source Match
            if (!ipMatches(source, rule.source))
                continue;
            // 5. Destination Match
            if (!ipMatches(destination, rule.destination))
                continue;
            // All matched!
            finalAction = rule.action;
            matchedRuleId = rule.id;
            break;
        }
        res.json({ action: finalAction, ruleId: matchedRuleId });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to run firewall simulation' });
    }
});
exports.default = router;
