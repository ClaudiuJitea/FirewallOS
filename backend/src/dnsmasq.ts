import { execSync } from 'child_process';
import { allQuery } from './db';
import fs from 'fs';
import path from 'path';
import { getInterfaceNameMap } from './network';

const DNSMASQ_CONF_DIR = '/etc/dnsmasq.d';
const DNSMASQ_CONF_FILE = path.join(DNSMASQ_CONF_DIR, 'firewall_mgr.conf');
const DNSMASQ_BASE_CONF = '/etc/dnsmasq.conf';

/**
 * Execute a shell command. Returns stdout. Throws on failure.
 */
function execShell(command: string): string {
    try {
        return execSync(command, { encoding: 'utf-8', timeout: 10000 });
    } catch (err: any) {
        console.error(`[dnsmasq] Failed to execute: ${command}`);
        console.error(err.stderr || err.message);
        throw new Error(`Shell command failed: ${err.message}`);
    }
}

/**
 * Initialize dnsmasq with a base configuration.
 * Called once on server startup.
 */
export function initDnsmasq(): void {
    console.log('[dnsmasq] Initializing dnsmasq...');

    // Ensure config directory exists
    try {
        if (!fs.existsSync(DNSMASQ_CONF_DIR)) {
            fs.mkdirSync(DNSMASQ_CONF_DIR, { recursive: true });
        }
    } catch (err: any) {
        console.error('[dnsmasq] Failed to create config dir:', err.message);
    }

    // Write base dnsmasq config
    const baseConfig = [
        '# dnsmasq base configuration - managed by firewall_mgr',
        'no-resolv',
        'no-poll',
        '# Upstream DNS servers',
        'server=8.8.8.8',
        'server=8.8.4.4',
        'server=1.1.1.1',
        '# Listen dynamically on all interfaces to allow dynamic bridge discovery',
        'bind-dynamic',
        '# Include custom rules',
        `conf-dir=${DNSMASQ_CONF_DIR}`,
        '# Logging',
        'log-queries',
        'log-facility=/var/log/dnsmasq.log',
        '# Cache settings',
        'cache-size=1000',
        '',
    ].join('\n');

    try {
        fs.writeFileSync(DNSMASQ_BASE_CONF, baseConfig, 'utf-8');
        console.log('[dnsmasq] Base configuration written.');
    } catch (err: any) {
        console.error('[dnsmasq] Failed to write base config:', err.message);
    }

    // Write an empty rules file initially
    try {
        fs.writeFileSync(DNSMASQ_CONF_FILE, '# Firewall Manager DNS rules\n', 'utf-8');
    } catch (err: any) {
        console.error('[dnsmasq] Failed to write initial rules file:', err.message);
    }

    // Start dnsmasq (or restart if already running)
    try {
        // Kill any existing dnsmasq
        try {
            execShell('pkill -x dnsmasq');
        } catch {
            // Not running, that's fine
        }

        // Start dnsmasq in background
        execShell('dnsmasq');
        console.log('[dnsmasq] Started successfully.');
    } catch (err: any) {
        console.error('[dnsmasq] Failed to start:', err.message);
    }
}

/**
 * Apply DNS rules from the database to dnsmasq configuration.
 * Regenerates the config file and sends SIGHUP to reload.
 */
export async function applyDnsRules(): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('[dnsmasq] Applying DNS rules from database...');

        const rules = await allQuery('SELECT * FROM dns_rules WHERE status = 1');

        const configLines: string[] = [
            '# Firewall Manager DNS rules',
            `# Generated at ${new Date().toISOString()}`,
            `# ${rules.length} active rules`,
            '',
        ];

        for (const rule of rules) {
            const domain = (rule.domain || '').trim().toLowerCase();
            const action = (rule.action || '').toUpperCase();

            if (!domain) continue;

            if (action === 'BLOCK') {
                if (domain === '*') {
                    // Block all — this is a wildcard block, dnsmasq doesn't easily support this
                    // but we can set a bogus address for everything
                    configLines.push(`# Block all domains`);
                    configLines.push(`address=/#/0.0.0.0`);
                    configLines.push(`address=/#/::`);
                } else {
                    // Block specific domain and subdomains
                    // address=/domain.com/0.0.0.0 blocks domain.com AND *.domain.com
                    const cleanDomain = domain.replace(/^\*\./, '').replace(/^\./, '');
                    configLines.push(`# Block: ${rule.domain}`);
                    configLines.push(`address=/${cleanDomain}/0.0.0.0`);
                    configLines.push(`address=/${cleanDomain}/::`);
                }
            } else if (action === 'ALLOW') {
                if (domain === '*') {
                    // Allow all — this is default behavior, no entry needed
                    configLines.push(`# Allow all domains (default)`);
                } else {
                    // Explicitly allow: forward to upstream (server= directive)
                    // This is mostly useful when combined with a block-all rule
                    const cleanDomain = domain.replace(/^\*\./, '').replace(/^\./, '');
                    configLines.push(`# Allow: ${rule.domain}`);
                    configLines.push(`server=/${cleanDomain}/8.8.8.8`);
                }
            }
        }

        configLines.push('');

        // Write config file
        fs.writeFileSync(DNSMASQ_CONF_FILE, configLines.join('\n'), 'utf-8');

        // Reload dnsmasq (SIGHUP causes config reload)
        try {
            execShell('pkill -HUP dnsmasq');
            console.log(`[dnsmasq] Reloaded with ${rules.length} DNS rules.`);
        } catch {
            // dnsmasq might not be running, try to start it
            console.warn('[dnsmasq] SIGHUP failed, attempting restart...');
            try {
                execShell('dnsmasq');
                console.log('[dnsmasq] Restarted successfully.');
            } catch (err: any) {
                console.error('[dnsmasq] Failed to restart:', err.message);
                return { success: false, error: 'Failed to restart dnsmasq' };
            }
        }

        return { success: true };
    } catch (err: any) {
        console.error('[dnsmasq] Failed to apply DNS rules:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Get current dnsmasq status and configuration for display.
 */
export function getDnsmasqStatus(): { running: boolean; config: string; logTail: string } {
    let running = false;
    let config = '';
    let logTail = '';

    // Check if running
    try {
        execShell('pgrep -x dnsmasq');
        running = true;
    } catch {
        running = false;
    }

    // Read current config
    try {
        config = fs.readFileSync(DNSMASQ_CONF_FILE, 'utf-8');
    } catch {
        config = '(no config file found)';
    }

    // Read recent log entries
    try {
        logTail = execShell('tail -20 /var/log/dnsmasq.log');
    } catch {
        logTail = '(no log file)';
    }

    return { running, config, logTail };
}

// ==================== DHCP ====================

const DHCP_CONF_FILE = path.join(DNSMASQ_CONF_DIR, 'dhcp.conf');
const DHCP_LEASE_FILE = '/app/data/dnsmasq.leases';
const LEGACY_DHCP_LEASE_FILE = '/var/lib/misc/dnsmasq.leases';

/**
 * Apply DHCP configuration from the database to dnsmasq.
 * Generates /etc/dnsmasq.d/dhcp.conf and reloads dnsmasq.
 */
export async function applyDhcpConfig(): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('[dnsmasq] Applying DHCP configuration from database...');

        const pools = await allQuery('SELECT * FROM dhcp_pools WHERE status = 1');
        const staticLeases = await allQuery('SELECT * FROM dhcp_static_leases WHERE status = 1');
        const interfaceMap = await getInterfaceNameMap();

        const configLines: string[] = [
            '# DHCP Configuration - managed by firewall_mgr',
            `# Generated at ${new Date().toISOString()}`,
            `# ${pools.length} active pool(s), ${staticLeases.length} static lease(s)`,
            '',
            `dhcp-leasefile=${DHCP_LEASE_FILE}`,
            '',
        ];

        for (const pool of pools) {
            const leaseTimeSec = pool.lease_time || 86400;
            const leaseTimeStr = `${leaseTimeSec}s`;

            configLines.push(`# Pool: ${pool.interface} (${pool.range_start} - ${pool.range_end})`);

            // dhcp-range=interface:<iface>,<start>,<end>,<mask>,<lease>
            const resolvedIface = interfaceMap[pool.interface] || pool.interface;
            if (resolvedIface && resolvedIface !== 'ANY') {
                configLines.push(`dhcp-range=interface:${resolvedIface},${pool.range_start},${pool.range_end},${pool.subnet_mask},${leaseTimeStr}`);
            } else {
                configLines.push(`dhcp-range=${pool.range_start},${pool.range_end},${pool.subnet_mask},${leaseTimeStr}`);
            }

            // Gateway (option 3)
            if (pool.gateway) {
                if (resolvedIface && resolvedIface !== 'ANY') {
                    configLines.push(`dhcp-option=interface:${resolvedIface},3,${pool.gateway}`);
                } else {
                    configLines.push(`dhcp-option=3,${pool.gateway}`);
                }
            }

            // DNS servers (option 6)
            if (pool.dns_servers) {
                if (resolvedIface && resolvedIface !== 'ANY') {
                    configLines.push(`dhcp-option=interface:${resolvedIface},6,${pool.dns_servers}`);
                } else {
                    configLines.push(`dhcp-option=6,${pool.dns_servers}`);
                }
            }

            // Domain (option 15)
            if (pool.domain) {
                if (resolvedIface && resolvedIface !== 'ANY') {
                    configLines.push(`dhcp-option=interface:${resolvedIface},15,${pool.domain}`);
                } else {
                    configLines.push(`dhcp-option=15,${pool.domain}`);
                }
            }

            configLines.push('');
        }

        // Static leases (dhcp-host=mac,ip,hostname)
        for (const lease of staticLeases) {
            const parts = [lease.mac_address, lease.ip_address];
            if (lease.hostname) parts.push(lease.hostname);
            configLines.push(`# Static: ${lease.description || lease.hostname || lease.mac_address}`);
            configLines.push(`dhcp-host=${parts.join(',')}`);
        }

        configLines.push('');

        // Write config
        fs.writeFileSync(DHCP_CONF_FILE, configLines.join('\n'), 'utf-8');

        // Ensure lease file directory exists and migrate legacy lease file once.
        try {
            const leaseDir = path.dirname(DHCP_LEASE_FILE);
            if (!fs.existsSync(leaseDir)) {
                fs.mkdirSync(leaseDir, { recursive: true });
            }
            if (!fs.existsSync(DHCP_LEASE_FILE)) {
                if (fs.existsSync(LEGACY_DHCP_LEASE_FILE)) {
                    fs.copyFileSync(LEGACY_DHCP_LEASE_FILE, DHCP_LEASE_FILE);
                } else {
                    fs.writeFileSync(DHCP_LEASE_FILE, '', 'utf-8');
                }
            }
        } catch (e: any) {
            console.warn('[dnsmasq] Could not create lease file:', e.message);
        }

        // Restart dnsmasq (DHCP changes require full restart, not just SIGHUP)
        try {
            try { execShell('pkill -x dnsmasq'); } catch { }
            execShell('dnsmasq');
            console.log(`[dnsmasq] Restarted with ${pools.length} DHCP pool(s) and ${staticLeases.length} static lease(s).`);
        } catch (err: any) {
            console.error('[dnsmasq] Failed to restart:', err.message);
            return { success: false, error: 'Failed to restart dnsmasq' };
        }

        return { success: true };
    } catch (err: any) {
        console.error('[dnsmasq] Failed to apply DHCP config:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Parse the dnsmasq lease file and return active leases.
 * Format: <expiry_epoch> <mac> <ip> <hostname> <client_id>
 */
export function getDhcpLeases(): Array<{ expires: string; mac: string; ip: string; hostname: string; clientId: string }> {
    try {
        if (!fs.existsSync(DHCP_LEASE_FILE)) return [];
        const content = fs.readFileSync(DHCP_LEASE_FILE, 'utf-8').trim();
        if (!content) return [];

        return content
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
            const parts = line.split(/\s+/);
            const expiryEpoch = parseInt(parts[0], 10);
            if (parts.length < 3 || Number.isNaN(expiryEpoch)) {
                return null;
            }
            return {
                expires: expiryEpoch === 0 ? 'never' : new Date(expiryEpoch * 1000).toISOString(),
                mac: parts[1] || '',
                ip: parts[2] || '',
                hostname: parts[3] === '*' ? '' : (parts[3] || ''),
                clientId: parts[4] === '*' ? '' : (parts[4] || ''),
            };
        })
            .filter((x): x is { expires: string; mac: string; ip: string; hostname: string; clientId: string } => x !== null);
    } catch {
        return [];
    }
}
