import express from 'express';
import { runQuery, allQuery } from '../db';
import { authenticate } from '../middleware/auth';
import dns from 'dns/promises';
import http from 'http';
import { applyDnsRules } from '../dnsmasq';

const router = express.Router();
router.use(authenticate);

// 1. CRUD for DNS Rules
router.get('/rules', async (req, res) => {
    try {
        const rules = await allQuery('SELECT * FROM dns_rules ORDER BY id DESC');
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch DNS rules' });
    }
});

router.post('/rules', async (req, res) => {
    const { domain, action, status } = req.body;
    try {
        const result = await runQuery(
            'INSERT INTO dns_rules (domain, action, status) VALUES (?, ?, ?)',
            [domain, action, status ?? 1]
        );
        res.status(201).json({ id: result.lastInsertRowid });
        applyDnsRules().catch(err => console.error('[dnsmasq] Sync after DNS rule create failed:', err));
    } catch (error) {
        res.status(500).json({ error: 'Failed to create DNS rule' });
    }
});

router.put('/rules/:id', async (req, res) => {
    const { id } = req.params;
    const { domain, action, status } = req.body;
    try {
        await runQuery(
            'UPDATE dns_rules SET domain = ?, action = ?, status = ? WHERE id = ?',
            [domain, action, status === false ? 0 : 1, id]
        );
        res.json({ success: true });
        applyDnsRules().catch(err => console.error('[dnsmasq] Sync after DNS rule update failed:', err));
    } catch (error) {
        res.status(500).json({ error: 'Failed to update DNS rule' });
    }
});

router.delete('/rules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await runQuery('DELETE FROM dns_rules WHERE id = ?', [id]);
        res.json({ success: true });
        applyDnsRules().catch(err => console.error('[dnsmasq] Sync after DNS rule delete failed:', err));
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete DNS rule' });
    }
});

// 2. CRUD for Country Rules
router.get('/country-rules', async (req, res) => {
    try {
        const rules = await allQuery('SELECT * FROM country_rules ORDER BY id DESC');
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch country rules' });
    }
});

router.post('/country-rules', async (req, res) => {
    const { country_code, action, status } = req.body;
    try {
        const result = await runQuery(
            'INSERT INTO country_rules (country_code, action, status) VALUES (?, ?, ?)',
            [country_code, action, status ?? 1]
        );
        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create country rule' });
    }
});

router.put('/country-rules/:id', async (req, res) => {
    const { id } = req.params;
    const { country_code, action, status } = req.body;
    try {
        await runQuery(
            'UPDATE country_rules SET country_code = ?, action = ?, status = ? WHERE id = ?',
            [country_code, action, status === false ? 0 : 1, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update country rule' });
    }
});

router.delete('/country-rules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await runQuery('DELETE FROM country_rules WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete country rule' });
    }
});

// 3. Fetch DNS Logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await allQuery('SELECT * FROM dns_logs ORDER BY id DESC LIMIT 100');
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch DNS logs' });
    }
});

function fetchGeoIp(ip: string): Promise<any> {
    return new Promise((resolve) => {
        http.get(`http://ip-api.com/json/${ip}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({});
                }
            });
        }).on('error', (err) => resolve({}));
    });
}

// 3. Test DNS Query (Simulate)
router.post('/test', async (req, res) => {
    const { domain } = req.body;
    try {
        // 1. Resolve IP
        let ipAddress = '0.0.0.0';
        try {
            const addresses = await dns.resolve4(domain);
            if (addresses.length > 0) {
                ipAddress = addresses[0];
            }
        } catch (e) {
            // Ignore resolution errors, handle as unknown
        }

        // 2. Determine GeoIP
        const geoInfo = await fetchGeoIp(ipAddress);
        const countryCode = geoInfo.countryCode || 'Unknown';
        const lat = geoInfo.lat || 0;
        const lon = geoInfo.lon || 0;

        // 4. Check Rules
        let action = 'ALLOW';
        let matchFound = false;

        const rules = await allQuery('SELECT * FROM dns_rules WHERE status = 1');
        for (const rule of rules) {
            let rDomain = rule.domain.trim().toLowerCase();
            let testDomain = domain.trim().toLowerCase();

            if (rDomain === '*') {
                action = rule.action;
                matchFound = true;
                break;
            }

            if (rDomain.startsWith('*.')) {
                rDomain = rDomain.slice(2);
            } else if (rDomain.startsWith('.')) {
                rDomain = rDomain.slice(1);
            }

            if (testDomain === rDomain || testDomain.endsWith('.' + rDomain)) {
                action = rule.action;
                matchFound = true;
                break;
            }
        }

        if (!matchFound && countryCode !== 'Unknown') {
            const countryRules = await allQuery('SELECT * FROM country_rules WHERE status = 1 AND country_code = ?', [countryCode]);
            if (countryRules.length > 0) {
                action = countryRules[0].action;
            }
        }

        // 5. Log the query
        const result = await runQuery(
            'INSERT INTO dns_logs (domain, ip_address, country_code, latitude, longitude, action) VALUES (?, ?, ?, ?, ?, ?)',
            [domain, ipAddress, countryCode, lat, lon, action]
        );

        res.json({
            id: result.lastInsertRowid,
            domain,
            ip_address: ipAddress,
            country_code: countryCode,
            latitude: lat,
            longitude: lon,
            action,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to run DNS test' });
    }
});

export default router;
