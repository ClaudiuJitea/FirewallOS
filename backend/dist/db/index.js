"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.runQuery = runQuery;
exports.getQuery = getQuery;
exports.allQuery = allQuery;
exports.initializeDb = initializeDb;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dataDir = path_1.default.join(__dirname, '..', '..', 'data');
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
}
exports.db = new sqlite3_1.default.Database(path_1.default.join(dataDir, 'firewall.db'));
// Helper to run queries synchronously to match better-sqlite3 API style for our simple routes
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        exports.db.run(query, params, function (err) {
            if (err)
                reject(err);
            else
                resolve({ lastInsertRowid: this.lastID, changes: this.changes });
        });
    });
}
function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        exports.db.get(query, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
}
function allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        exports.db.all(query, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
}
function initializeDb() {
    exports.db.serialize(() => {
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        exports.db.run("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1", () => { });
        // SQLite may reject non-constant defaults when adding columns to existing tables.
        exports.db.run("ALTER TABLE users ADD COLUMN created_at DATETIME", () => { });
        exports.db.run("ALTER TABLE users ADD COLUMN updated_at DATETIME", () => { });
        exports.db.run("UPDATE users SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)");
        exports.db.run("UPDATE users SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)");
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        priority INTEGER,
        name TEXT,
        action TEXT,
        interface TEXT DEFAULT 'ANY',
        source TEXT,
        destination TEXT,
        protocol TEXT,
        port TEXT,
        status INTEGER DEFAULT 1,
        hits INTEGER DEFAULT 0
      )
    `);
        // Add interface column to rules table if it doesn't exist (for existing databases)
        exports.db.run("ALTER TABLE rules ADD COLUMN interface TEXT DEFAULT 'ANY'", (err) => {
            // Ignore error if column already exists
        });
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS interfaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        physical_interface TEXT,
        ip_address TEXT,
        netmask TEXT,
        status INTEGER DEFAULT 1
      )
    `);
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS nat_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        priority INTEGER,
        type TEXT, -- SNAT or DNAT
        name TEXT,
        interface TEXT,
        original_source TEXT,
        original_destination TEXT,
        protocol TEXT,
        original_port TEXT,
        translated_ip TEXT,
        translated_port TEXT,
        status INTEGER DEFAULT 1,
        hits INTEGER DEFAULT 0
      )
    `);
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        destination TEXT,
        gateway TEXT,
        interface TEXT,
        metric INTEGER DEFAULT 1,
        status INTEGER DEFAULT 1,
        description TEXT
      )
    `);
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS dns_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        action TEXT,
        status INTEGER DEFAULT 1
      )
    `);
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS country_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country_code TEXT UNIQUE,
        action TEXT,
        status INTEGER DEFAULT 1
      )
    `);
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS dns_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        ip_address TEXT,
        country_code TEXT,
        latitude REAL,
        longitude REAL,
        action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        exports.db.run("ALTER TABLE dns_logs ADD COLUMN latitude REAL", (err) => { });
        exports.db.run("ALTER TABLE dns_logs ADD COLUMN longitude REAL", (err) => { });
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS dhcp_pools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        interface TEXT,
        range_start TEXT,
        range_end TEXT,
        subnet_mask TEXT DEFAULT '255.255.255.0',
        gateway TEXT,
        dns_servers TEXT DEFAULT '8.8.8.8,8.8.4.4',
        lease_time INTEGER DEFAULT 86400,
        domain TEXT,
        status INTEGER DEFAULT 1
      )
    `);
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS dhcp_static_leases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pool_id INTEGER,
        mac_address TEXT,
        ip_address TEXT,
        hostname TEXT,
        description TEXT,
        status INTEGER DEFAULT 1,
        FOREIGN KEY (pool_id) REFERENCES dhcp_pools(id) ON DELETE CASCADE
      )
    `);
        exports.db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
            if (!err && row && row.count === 0) {
                exports.db.run('INSERT INTO users (username, password, role, active) VALUES (?, ?, ?, ?)', ['admin', 'admin', 'admin', 1]);
            }
        });
        exports.db.get('SELECT COUNT(*) as count FROM interfaces', (err, row) => {
            if (!err && row && row.count === 0) {
                exports.db.run('INSERT INTO interfaces (name, physical_interface, ip_address, netmask) VALUES (?, ?, ?, ?)', ['WAN', 'eth0', '192.168.1.100', '255.255.255.0']);
                exports.db.run('INSERT INTO interfaces (name, physical_interface, ip_address, netmask) VALUES (?, ?, ?, ?)', ['LAN', 'eth1', '10.0.0.1', '255.255.255.0']);
            }
        });
        exports.db.get('SELECT COUNT(*) as count FROM dhcp_pools', (err, row) => {
            if (!err && row && row.count === 0) {
                exports.db.run('INSERT INTO dhcp_pools (interface, range_start, range_end, subnet_mask, gateway, dns_servers, lease_time, domain, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ['LAN', '10.0.0.100', '10.0.0.200', '255.255.255.0', '10.0.0.1', '10.0.0.1,8.8.8.8', 86400, 'local.lan', 1]);
            }
        });
    });
}
