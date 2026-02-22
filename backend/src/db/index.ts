import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new sqlite3.Database(path.join(dataDir, 'firewall.db'));

// Helper to run queries synchronously to match better-sqlite3 API style for our simple routes
export function runQuery(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

export function getQuery(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function allQuery(query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function initializeDb() {
  db.serialize(() => {
    db.run(`
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
    db.run("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1", () => { });
    // SQLite may reject non-constant defaults when adding columns to existing tables.
    db.run("ALTER TABLE users ADD COLUMN created_at DATETIME", () => { });
    db.run("ALTER TABLE users ADD COLUMN updated_at DATETIME", () => { });
    db.run("UPDATE users SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)");
    db.run("UPDATE users SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)");
    db.run(`
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
    db.run("ALTER TABLE rules ADD COLUMN interface TEXT DEFAULT 'ANY'", (err) => {
      // Ignore error if column already exists
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS interfaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        physical_interface TEXT,
        ip_address TEXT,
        netmask TEXT,
        status INTEGER DEFAULT 1
      )
    `);

    db.run(`
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

    db.run(`
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

    db.run(`
      CREATE TABLE IF NOT EXISTS dns_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        action TEXT,
        status INTEGER DEFAULT 1
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS country_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country_code TEXT UNIQUE,
        action TEXT,
        status INTEGER DEFAULT 1
      )
    `);

    db.run(`
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

    db.run("ALTER TABLE dns_logs ADD COLUMN latitude REAL", (err) => { });
    db.run("ALTER TABLE dns_logs ADD COLUMN longitude REAL", (err) => { });

    db.run(`
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

    db.run(`
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

    db.get('SELECT COUNT(*) as count FROM users', (err, row: any) => {
      if (!err && row && row.count === 0) {
        db.run(
          'INSERT INTO users (username, password, role, active) VALUES (?, ?, ?, ?)',
          ['admin', 'admin', 'admin', 1]
        );
      }
    });

    db.get('SELECT COUNT(*) as count FROM interfaces', (err, row: any) => {
      if (!err && row && row.count === 0) {
        db.run('INSERT INTO interfaces (name, physical_interface, ip_address, netmask) VALUES (?, ?, ?, ?)', ['WAN', 'eth0', '192.168.1.100', '255.255.255.0']);
        db.run('INSERT INTO interfaces (name, physical_interface, ip_address, netmask) VALUES (?, ?, ?, ?)', ['LAN', 'eth1', '10.0.0.1', '255.255.255.0']);
      }
    });
  });
}
