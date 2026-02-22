import { Router } from 'express';
import { allQuery } from '../db';
import { authenticate } from '../middleware/auth';
import { execSync } from 'child_process';
import { applyAllRules, applyRoutes, getCurrentNftRuleset, getCurrentRoutes, initNftables } from '../nftables';
import { applyDhcpConfig, applyDnsRules, getDnsmasqStatus, initDnsmasq } from '../dnsmasq';
import { getSystemMetrics } from '../systemMetrics';

const router = Router();
router.use(authenticate);

function execShell(command: string): string {
    return execSync(command, { encoding: 'utf-8', timeout: 10000 });
}

router.get('/dump', async (req, res) => {
    try {
        const rules = await allQuery('SELECT * FROM rules WHERE status = 1 ORDER BY priority ASC');
        const natRules = await allQuery('SELECT * FROM nat_rules WHERE status = 1 ORDER BY priority ASC');
        const routes = await allQuery('SELECT * FROM routes WHERE status = 1 ORDER BY metric ASC');
        const dnsRules = await allQuery('SELECT * FROM dns_rules WHERE status = 1');
        const countryRules = await allQuery('SELECT * FROM country_rules WHERE status = 1');

        res.json({
            rules,
            natRules,
            routes,
            dnsRules,
            countryRules
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to dump raw backend systems rules' });
    }
});

// Get current nftables ruleset, routing table, and dnsmasq status from OS
router.get('/nft-status', async (req, res) => {
    try {
        const nftRuleset = getCurrentNftRuleset();
        const routingTable = getCurrentRoutes();
        const dnsStatus = getDnsmasqStatus();
        res.json({ nftRuleset, routingTable, dnsStatus });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get system status' });
    }
});

// Force re-apply all rules from DB to OS
router.post('/apply', async (req, res) => {
    try {
        const rulesResult = await applyAllRules();
        const routesResult = await applyRoutes();
        const dnsResult = await applyDnsRules();

        if (rulesResult.success && routesResult.success && dnsResult.success) {
            const nftRuleset = getCurrentNftRuleset();
            const dnsStatus = getDnsmasqStatus();
            res.json({ success: true, nftRuleset, dnsStatus });
        } else {
            res.status(500).json({
                success: false,
                rulesError: rulesResult.error,
                routesError: routesResult.error,
                dnsError: dnsResult.error
            });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to apply rules' });
    }
});

router.get('/metrics', async (req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (e) {
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
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get system info' });
    }
});

router.post('/services/restart-dnsmasq', async (_req, res) => {
    try {
        // Reinitialize base + DB-derived config to avoid drift.
        initDnsmasq();
        const dnsResult = await applyDnsRules();
        const dhcpResult = await applyDhcpConfig();
        if (!dnsResult.success || !dhcpResult.success) {
            res.status(500).json({
                success: false,
                dnsError: dnsResult.error,
                dhcpError: dhcpResult.error,
            });
            return;
        }
        res.json({ success: true, dnsStatus: getDnsmasqStatus() });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to restart dnsmasq service' });
    }
});

router.post('/reset-runtime', async (_req, res) => {
    try {
        // Reset runtime services and immediately rehydrate from DB.
        initNftables();
        initDnsmasq();

        const [rulesResult, routesResult, dnsResult, dhcpResult] = await Promise.all([
            applyAllRules(),
            applyRoutes(),
            applyDnsRules(),
            applyDhcpConfig(),
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
            nftRuleset: getCurrentNftRuleset(),
            routingTable: getCurrentRoutes(),
            dnsStatus: getDnsmasqStatus(),
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to reset runtime services' });
    }
});

router.post('/logs/dnsmasq/clear', async (_req, res) => {
    try {
        execShell(`sh -lc ": > /var/log/dnsmasq.log"`);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to clear dnsmasq logs' });
    }
});

export default router;
