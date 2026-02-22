"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const child_process_1 = require("child_process");
const nftables_1 = require("../nftables");
const dnsmasq_1 = require("../dnsmasq");
const systemMetrics_1 = require("../systemMetrics");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
function execShell(command) {
    return (0, child_process_1.execSync)(command, { encoding: 'utf-8', timeout: 10000 });
}
router.get('/dump', async (req, res) => {
    try {
        const rules = await (0, db_1.allQuery)('SELECT * FROM rules WHERE status = 1 ORDER BY priority ASC');
        const natRules = await (0, db_1.allQuery)('SELECT * FROM nat_rules WHERE status = 1 ORDER BY priority ASC');
        const routes = await (0, db_1.allQuery)('SELECT * FROM routes WHERE status = 1 ORDER BY metric ASC');
        const dnsRules = await (0, db_1.allQuery)('SELECT * FROM dns_rules WHERE status = 1');
        const countryRules = await (0, db_1.allQuery)('SELECT * FROM country_rules WHERE status = 1');
        res.json({
            rules,
            natRules,
            routes,
            dnsRules,
            countryRules
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to dump raw backend systems rules' });
    }
});
// Get current nftables ruleset, routing table, and dnsmasq status from OS
router.get('/nft-status', async (req, res) => {
    try {
        const nftRuleset = (0, nftables_1.getCurrentNftRuleset)();
        const routingTable = (0, nftables_1.getCurrentRoutes)();
        const dnsStatus = (0, dnsmasq_1.getDnsmasqStatus)();
        res.json({ nftRuleset, routingTable, dnsStatus });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get system status' });
    }
});
// Force re-apply all rules from DB to OS
router.post('/apply', async (req, res) => {
    try {
        const rulesResult = await (0, nftables_1.applyAllRules)();
        const routesResult = await (0, nftables_1.applyRoutes)();
        const dnsResult = await (0, dnsmasq_1.applyDnsRules)();
        if (rulesResult.success && routesResult.success && dnsResult.success) {
            const nftRuleset = (0, nftables_1.getCurrentNftRuleset)();
            const dnsStatus = (0, dnsmasq_1.getDnsmasqStatus)();
            res.json({ success: true, nftRuleset, dnsStatus });
        }
        else {
            res.status(500).json({
                success: false,
                rulesError: rulesResult.error,
                routesError: routesResult.error,
                dnsError: dnsResult.error
            });
        }
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to apply rules' });
    }
});
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await (0, systemMetrics_1.getSystemMetrics)();
        res.json(metrics);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get system metrics' });
    }
});
router.get('/info', async (_req, res) => {
    try {
        const [hostname, uptime, kernel, osName, nodeVersion, memory, diskRoot] = await Promise.all([
            Promise.resolve(execShell('hostname').trim()),
            Promise.resolve(execShell('uptime -p').trim()),
            Promise.resolve(execShell('uname -r').trim()),
            Promise.resolve(execShell(`sh -lc "grep '^PRETTY_NAME=' /etc/os-release | cut -d= -f2- | tr -d '\\"'"`).trim()),
            Promise.resolve(process.version),
            Promise.resolve(execShell(`sh -lc "cat /proc/meminfo | grep -E 'MemTotal|MemAvailable'"`).trim()),
            Promise.resolve(execShell(`sh -lc "df -h / | tail -1"`).trim()),
        ]);
        res.json({
            hostname,
            uptime,
            kernel,
            osName,
            nodeVersion,
            memory,
            diskRoot,
            now: new Date().toISOString(),
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get system info' });
    }
});
router.post('/services/restart-dnsmasq', async (_req, res) => {
    try {
        // Reinitialize base + DB-derived config to avoid drift.
        (0, dnsmasq_1.initDnsmasq)();
        const dnsResult = await (0, dnsmasq_1.applyDnsRules)();
        const dhcpResult = await (0, dnsmasq_1.applyDhcpConfig)();
        if (!dnsResult.success || !dhcpResult.success) {
            res.status(500).json({
                success: false,
                dnsError: dnsResult.error,
                dhcpError: dhcpResult.error,
            });
            return;
        }
        res.json({ success: true, dnsStatus: (0, dnsmasq_1.getDnsmasqStatus)() });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to restart dnsmasq service' });
    }
});
router.post('/reset-runtime', async (_req, res) => {
    try {
        // Reset runtime services and immediately rehydrate from DB.
        (0, nftables_1.initNftables)();
        (0, dnsmasq_1.initDnsmasq)();
        const [rulesResult, routesResult, dnsResult, dhcpResult] = await Promise.all([
            (0, nftables_1.applyAllRules)(),
            (0, nftables_1.applyRoutes)(),
            (0, dnsmasq_1.applyDnsRules)(),
            (0, dnsmasq_1.applyDhcpConfig)(),
        ]);
        if (!rulesResult.success || !routesResult.success || !dnsResult.success || !dhcpResult.success) {
            res.status(500).json({
                success: false,
                rulesError: rulesResult.error,
                routesError: routesResult.error,
                dnsError: dnsResult.error,
                dhcpError: dhcpResult.error,
            });
            return;
        }
        res.json({
            success: true,
            nftRuleset: (0, nftables_1.getCurrentNftRuleset)(),
            routingTable: (0, nftables_1.getCurrentRoutes)(),
            dnsStatus: (0, dnsmasq_1.getDnsmasqStatus)(),
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to reset runtime services' });
    }
});
router.post('/logs/dnsmasq/clear', async (_req, res) => {
    try {
        execShell(`sh -lc ": > /var/log/dnsmasq.log"`);
        res.json({ success: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to clear dnsmasq logs' });
    }
});
exports.default = router;
