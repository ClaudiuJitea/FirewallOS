"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInterfaceNameMap = getInterfaceNameMap;
exports.resolveRuntimeInterface = resolveRuntimeInterface;
exports.applyAllInterfaceConfigs = applyAllInterfaceConfigs;
exports.applyInterfaceConfig = applyInterfaceConfig;
const child_process_1 = require("child_process");
const db_1 = require("./db");
function execShell(command) {
    return (0, child_process_1.execSync)(command, { encoding: 'utf-8', timeout: 10000 });
}
function getIpv4InterfaceRows() {
    try {
        const out = execShell('ip -o -4 addr show');
        return out
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
            // Format: "2: eth0    inet 10.0.0.1/24 brd ..."
            const parts = line.split(/\s+/);
            const iface = parts[1];
            const inetIdx = parts.indexOf('inet');
            const addr = inetIdx >= 0 ? parts[inetIdx + 1] : '';
            return { iface, addr };
        })
            .filter((x) => x.iface && x.addr);
    }
    catch {
        return [];
    }
}
function maskToPrefix(mask) {
    const parts = mask.split('.').map((x) => Number(x));
    if (parts.length !== 4 || parts.some((x) => Number.isNaN(x) || x < 0 || x > 255)) {
        throw new Error(`Invalid netmask: ${mask}`);
    }
    const binary = parts.map((x) => x.toString(2).padStart(8, '0')).join('');
    if (!/^1*0*$/.test(binary)) {
        throw new Error(`Invalid netmask (non-contiguous): ${mask}`);
    }
    return binary.indexOf('0') === -1 ? 32 : binary.indexOf('0');
}
function hasInterface(iface) {
    try {
        execShell(`ip link show dev ${iface}`);
        return true;
    }
    catch {
        return false;
    }
}
function normalizeInterfaceName(name) {
    return (name || '').trim();
}
async function getInterfaceNameMap() {
    const interfaces = await (0, db_1.allQuery)('SELECT name, physical_interface FROM interfaces');
    const interfaceWithIp = await (0, db_1.allQuery)('SELECT name, ip_address FROM interfaces');
    const rows = getIpv4InterfaceRows();
    const map = {};
    for (const row of interfaces) {
        const logical = normalizeInterfaceName(row.name);
        const physical = normalizeInterfaceName(row.physical_interface);
        if (logical && physical)
            map[logical] = physical;
    }
    // Prefer reality: if logical interface IP is already present on a kernel NIC, use that NIC.
    for (const row of interfaceWithIp) {
        const logical = normalizeInterfaceName(row.name);
        const ip = normalizeInterfaceName(row.ip_address);
        if (!logical || !ip)
            continue;
        const hit = rows.find((r) => r.addr.startsWith(`${ip}/`));
        if (hit)
            map[logical] = hit.iface;
    }
    return map;
}
async function resolveRuntimeInterface(input) {
    const name = normalizeInterfaceName(input);
    if (!name || name.toUpperCase() === 'ANY')
        return 'ANY';
    const map = await getInterfaceNameMap();
    return map[name] || name;
}
async function applyAllInterfaceConfigs() {
    const interfaces = await (0, db_1.allQuery)('SELECT * FROM interfaces ORDER BY id ASC');
    for (const iface of interfaces) {
        await applyInterfaceConfig(iface);
    }
}
async function applyInterfaceConfig(iface) {
    const physical = normalizeInterfaceName(iface.physical_interface);
    if (!physical)
        return;
    if (!hasInterface(physical)) {
        console.warn(`[network] Physical interface "${physical}" not found for logical "${iface.name}".`);
        return;
    }
    const status = Number(iface.status ?? 1);
    const ip = normalizeInterfaceName(iface.ip_address);
    const netmask = normalizeInterfaceName(iface.netmask);
    try {
        execShell(`ip link set dev ${physical} up`);
    }
    catch (err) {
        console.warn(`[network] Failed to bring up ${physical}: ${err.message}`);
    }
    if (!ip || !netmask)
        return;
    const prefix = maskToPrefix(netmask);
    const cidr = `${ip}/${prefix}`;
    const rows = getIpv4InterfaceRows();
    try {
        if (status === 0) {
            // Keep link up to avoid killing container reachability; just remove managed address.
            execShell(`ip addr del ${cidr} dev ${physical} 2>/dev/null || true`);
        }
        else {
            // Remove duplicate assignment from other NICs to keep mapping deterministic.
            for (const row of rows) {
                if (row.iface !== physical && row.addr === cidr) {
                    execShell(`ip addr del ${cidr} dev ${row.iface} 2>/dev/null || true`);
                }
            }
            // Apply interface address in kernel state.
            execShell(`ip addr replace ${cidr} dev ${physical}`);
        }
    }
    catch (err) {
        console.warn(`[network] Failed to apply ${cidr} on ${physical}: ${err.message}`);
    }
}
