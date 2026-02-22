import { execSync } from 'child_process';
import { allQuery } from './db';
import { getInterfaceNameMap } from './network';

const TABLE_NAME = 'firewall_mgr';
const TABLE_FAMILY = 'inet'; // handles both IPv4 and IPv6

/**
 * Execute an nft command. Throws on failure.
 */
function execNft(command: string): string {
    try {
        const result = execSync(`nft ${command}`, {
            encoding: 'utf-8',
            timeout: 10000,
        });
        return result;
    } catch (err: any) {
        console.error(`[nftables] Failed to execute: nft ${command}`);
        console.error(err.stderr || err.message);
        throw new Error(`nft command failed: ${err.message}`);
    }
}

/**
 * Execute a shell command (for ip route, etc). Throws on failure.
 */
function execShell(command: string): string {
    try {
        return execSync(command, { encoding: 'utf-8', timeout: 10000 });
    } catch (err: any) {
        console.error(`[shell] Failed to execute: ${command}`);
        console.error(err.stderr || err.message);
        throw new Error(`Shell command failed: ${err.message}`);
    }
}

/**
 * Initialize the base nftables table and chains.
 * Called once on server startup.
 */
export function initNftables(): void {
    console.log('[nftables] Initializing base table and chains...');

    // Delete existing table if present (clean slate)
    try {
        execNft(`delete table ${TABLE_FAMILY} ${TABLE_NAME}`);
    } catch {
        // Table doesn't exist yet, that's fine
    }

    // Create the table
    execNft(`add table ${TABLE_FAMILY} ${TABLE_NAME}`);

    // Create filter chains
    execNft(`add chain ${TABLE_FAMILY} ${TABLE_NAME} input '{ type filter hook input priority 0; policy accept; }'`);
    execNft(`add chain ${TABLE_FAMILY} ${TABLE_NAME} forward '{ type filter hook forward priority 0; policy accept; }'`);
    execNft(`add chain ${TABLE_FAMILY} ${TABLE_NAME} output '{ type filter hook output priority 0; policy accept; }'`);

    // Create NAT chains
    execNft(`add chain ${TABLE_FAMILY} ${TABLE_NAME} prerouting '{ type nat hook prerouting priority -100; }'`);
    execNft(`add chain ${TABLE_FAMILY} ${TABLE_NAME} postrouting '{ type nat hook postrouting priority 100; }'`);

    console.log('[nftables] Base table and chains created successfully.');
}

/**
 * Map our app protocol names to nft protocol names
 */
function mapProtocol(proto: string): string | null {
    const p = proto.toUpperCase();
    if (p === 'TCP') return 'tcp';
    if (p === 'UDP') return 'udp';
    if (p === 'ICMP') return 'icmp';
    if (p === 'ANY') return null;
    return null;
}

/**
 * Map our app action to nft verdict
 */
function mapAction(action: string): string {
    const a = action.toUpperCase();
    if (a === 'ALLOW') return 'accept';
    if (a === 'BLOCK') return 'drop';
    if (a === 'LOG') return 'log';
    return 'accept';
}

/**
 * Build nft match expressions for source/destination IP
 */
function buildIpMatch(field: 'saddr' | 'daddr', value: string): string {
    if (!value || value === 'ANY') return '';
    // Support comma-separated IPs/CIDRs
    const addresses = value.split(',').map(s => s.trim()).filter(Boolean);
    if (addresses.length === 0) return '';
    if (addresses.length === 1) {
        return `ip ${field} ${addresses[0]}`;
    }
    return `ip ${field} { ${addresses.join(', ')} }`;
}

/**
 * Build nft match expression for port
 */
function buildPortMatch(proto: string | null, portStr: string): string {
    if (!portStr || portStr === 'ANY' || !proto) return '';
    // Normalize: support "80,443" and "80-90"
    const portValue = portStr.replace(/\s+/g, '');
    if (portValue.includes(',') || portValue.includes('-')) {
        // nftables set syntax for multiple ports: { 80, 443 }
        // nftables range syntax: 80-90
        const parts = portValue.split(',').map(p => p.trim());
        return `${proto} dport { ${parts.join(', ')} }`;
    }
    return `${proto} dport ${portValue}`;
}

/**
 * Build all nft rule strings from DB filter rules.
 * Returns array of nft add rule commands.
 */
function buildFilterRules(rules: any[], interfaceMap: Record<string, string>): string[] {
    const commands: string[] = [];

    // Safety rules first: always allow established/related connections
    commands.push(
        `add rule ${TABLE_FAMILY} ${TABLE_NAME} input ct state established,related accept`
    );
    commands.push(
        `add rule ${TABLE_FAMILY} ${TABLE_NAME} forward ct state established,related accept`
    );

    // Safety: always allow management ports (80=frontend, 3000=backend API)
    commands.push(
        `add rule ${TABLE_FAMILY} ${TABLE_NAME} input tcp dport { 80, 3000 } accept`
    );

    // Safety: allow loopback
    commands.push(
        `add rule ${TABLE_FAMILY} ${TABLE_NAME} input iif lo accept`
    );

    for (const rule of rules) {
        const proto = mapProtocol(rule.protocol);
        const verdict = mapAction(rule.action);
        const srcMatch = buildIpMatch('saddr', rule.source);
        const dstMatch = buildIpMatch('daddr', rule.destination);
        const portMatch = buildPortMatch(proto, rule.port);
        const resolvedIface = interfaceMap[rule.interface] || rule.interface;

        // Build the match parts
        const parts: string[] = [];
        if (resolvedIface && resolvedIface !== 'ANY') {
            parts.push(`iifname "${resolvedIface}"`);
        }

        // Protocol match
        if (proto && proto !== 'icmp') {
            // For TCP/UDP we need meta l4proto to properly match
            parts.push(`meta l4proto ${proto}`);
        } else if (proto === 'icmp') {
            parts.push('meta l4proto icmp');
        }

        if (srcMatch) parts.push(srcMatch);
        if (dstMatch) parts.push(dstMatch);
        if (portMatch) parts.push(portMatch);
        parts.push(verdict);

        const ruleExpr = parts.join(' ');

        // Apply to input and forward chains
        commands.push(
            `add rule ${TABLE_FAMILY} ${TABLE_NAME} input ${ruleExpr} comment "${rule.name || 'rule-' + rule.id}"`
        );
        commands.push(
            `add rule ${TABLE_FAMILY} ${TABLE_NAME} forward ${ruleExpr} comment "${rule.name || 'rule-' + rule.id}"`
        );
    }

    return commands;
}

/**
 * Build nft NAT rule commands from DB NAT rules.
 */
function buildNatRules(natRules: any[], interfaceMap: Record<string, string>): string[] {
    const commands: string[] = [];

    for (const rule of natRules) {
        const proto = mapProtocol(rule.protocol);
        const srcMatch = buildIpMatch('saddr', rule.original_source);
        const dstMatch = buildIpMatch('daddr', rule.original_destination);
        const resolvedIface = interfaceMap[rule.interface] || rule.interface;

        const type = (rule.type || '').toUpperCase();

        if (type === 'DNAT') {
            // DNAT: prerouting chain
            const parts: string[] = [];
            if (resolvedIface && resolvedIface !== 'ANY') parts.push(`iifname "${resolvedIface}"`);
            if (proto) parts.push(`meta l4proto ${proto}`);
            if (srcMatch) parts.push(srcMatch);
            if (dstMatch) parts.push(dstMatch);
            if (rule.original_port && rule.original_port !== 'ANY' && proto) {
                parts.push(`${proto} dport ${rule.original_port}`);
            }

            // Build the DNAT target
            let dnatTarget = `dnat to ${rule.translated_ip}`;
            if (rule.translated_port) {
                dnatTarget += `:${rule.translated_port}`;
            }
            parts.push(dnatTarget);
            parts.push(`comment "${rule.name || 'nat-' + rule.id}"`);

            commands.push(
                `add rule ${TABLE_FAMILY} ${TABLE_NAME} prerouting ${parts.join(' ')}`
            );
        } else if (type === 'SNAT') {
            // SNAT: postrouting chain
            const parts: string[] = [];
            if (resolvedIface && resolvedIface !== 'ANY') parts.push(`oifname "${resolvedIface}"`);
            if (proto) parts.push(`meta l4proto ${proto}`);
            if (srcMatch) parts.push(srcMatch);
            if (dstMatch) parts.push(dstMatch);
            if (rule.original_port && rule.original_port !== 'ANY' && proto) {
                parts.push(`${proto} dport ${rule.original_port}`);
            }

            let snatTarget = `snat to ${rule.translated_ip}`;
            if (rule.translated_port) {
                snatTarget += `:${rule.translated_port}`;
            }
            parts.push(snatTarget);
            parts.push(`comment "${rule.name || 'nat-' + rule.id}"`);

            commands.push(
                `add rule ${TABLE_FAMILY} ${TABLE_NAME} postrouting ${parts.join(' ')}`
            );
        }
    }

    return commands;
}

/**
 * Apply all rules from the database to the OS via nftables.
 * This flushes the existing chains and rebuilds them.
 */
export async function applyAllRules(): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('[nftables] Applying all rules from database...');

        // Fetch enabled rules from DB
        const rules = await allQuery('SELECT * FROM rules WHERE status = 1 ORDER BY priority ASC');
        const natRules = await allQuery('SELECT * FROM nat_rules WHERE status = 1 ORDER BY priority ASC');
        const interfaceMap = await getInterfaceNameMap();

        // Flush all chains (remove existing rules, keep chain definitions)
        execNft(`flush chain ${TABLE_FAMILY} ${TABLE_NAME} input`);
        execNft(`flush chain ${TABLE_FAMILY} ${TABLE_NAME} forward`);
        execNft(`flush chain ${TABLE_FAMILY} ${TABLE_NAME} output`);
        execNft(`flush chain ${TABLE_FAMILY} ${TABLE_NAME} prerouting`);
        execNft(`flush chain ${TABLE_FAMILY} ${TABLE_NAME} postrouting`);

        // Build and apply filter rules
        const filterCommands = buildFilterRules(rules, interfaceMap);
        for (const cmd of filterCommands) {
            execNft(cmd);
        }

        // Build and apply NAT rules
        const natCommands = buildNatRules(natRules, interfaceMap);
        for (const cmd of natCommands) {
            execNft(cmd);
        }

        console.log(`[nftables] Applied ${rules.length} filter rules and ${natRules.length} NAT rules.`);
        return { success: true };
    } catch (err: any) {
        console.error('[nftables] Failed to apply rules:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Apply static routes from the database.
 */
export async function applyRoutes(): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('[routing] Applying static routes from database...');

        const routes = await allQuery('SELECT * FROM routes WHERE status = 1 ORDER BY metric ASC');
        const interfaceMap = await getInterfaceNameMap();

        // Ensure routing table 100 is defined in rt_tables
        try {
            const rtTables = execShell('cat /etc/iproute2/rt_tables');
            if (!rtTables.includes('100\tfirewall_mgr')) {
                execShell('echo "100\tfirewall_mgr" >> /etc/iproute2/rt_tables');
                console.log('[routing] Added table 100 (firewall_mgr) to rt_tables.');
            }
        } catch {
            // rt_tables might not be writable
        }

        // Flush existing managed routes
        try {
            execShell('ip route flush table 100 2>/dev/null || true');
        } catch {
            // Table might be empty or not exist yet
        }

        // Add ip rule to lookup our table if not already present
        try {
            const rules = execShell('ip rule show');
            if (!rules.includes('lookup 100') && !rules.includes('lookup firewall_mgr')) {
                execShell('ip rule add lookup 100 priority 100');
            }
        } catch {
            // Rule might already exist
        }

        for (const route of routes) {
            try {
                let cmd = `ip route replace ${route.destination}`;
                if (route.gateway) cmd += ` via ${route.gateway}`;
                if (route.interface) {
                    const resolvedIface = interfaceMap[route.interface] || route.interface;
                    cmd += ` dev ${resolvedIface}`;
                }
                if (route.metric) cmd += ` metric ${route.metric}`;
                cmd += ' table 100';
                execShell(cmd);
            } catch (err: any) {
                console.warn(`[routing] Failed to add route to ${route.destination}: ${err.message}`);
            }
        }

        console.log(`[routing] Applied ${routes.length} static routes.`);
        return { success: true };
    } catch (err: any) {
        console.error('[routing] Failed to apply routes:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Get the current nftables ruleset for status display.
 */
export function getCurrentNftRuleset(): string {
    try {
        return execNft(`list table ${TABLE_FAMILY} ${TABLE_NAME}`);
    } catch {
        return 'Unable to retrieve nftables ruleset';
    }
}

/**
 * Get current ip routes for status display.
 */
export function getCurrentRoutes(): string {
    try {
        const mainRoutes = execShell('ip route show');
        let customRoutes = '';
        try {
            customRoutes = execShell('ip route show table 100');
        } catch {
            customRoutes = '(no custom routes)';
        }
        return `=== Main Table ===\n${mainRoutes}\n=== Custom Table (100) ===\n${customRoutes}`;
    } catch {
        return 'Unable to retrieve routing table';
    }
}
