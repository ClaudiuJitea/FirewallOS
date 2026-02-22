"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const ws_1 = require("./ws");
const auth_1 = __importDefault(require("./routes/auth"));
const rules_1 = __importDefault(require("./routes/rules"));
const nat_1 = __importDefault(require("./routes/nat"));
const routing_1 = __importDefault(require("./routes/routing"));
const interfaces_1 = __importDefault(require("./routes/interfaces"));
const dns_1 = __importDefault(require("./routes/dns"));
const system_1 = __importDefault(require("./routes/system"));
const dhcp_1 = __importDefault(require("./routes/dhcp"));
const users_1 = __importDefault(require("./routes/users"));
const db_1 = require("./db");
const nftables_1 = require("./nftables");
const dnsmasq_1 = require("./dnsmasq");
const network_1 = require("./network");
const systemMetrics_1 = require("./systemMetrics");
dotenv_1.default.config();
(0, db_1.initializeDb)();
// Push DB interface settings into real kernel interface state on startup.
setTimeout(async () => {
    try {
        await (0, network_1.applyAllInterfaceConfigs)();
        console.log('[startup] Interface configuration applied to OS.');
    }
    catch (err) {
        console.error('[startup] Failed to apply interface configuration:', err);
    }
}, 1000);
(0, systemMetrics_1.startSystemMetricsCollector)().catch((err) => {
    console.error('[startup] Failed to start system metrics collector:', err);
});
// Initialize nftables and apply rules from DB on startup
try {
    (0, nftables_1.initNftables)();
    console.log('[startup] nftables initialized, applying rules from database...');
    // Use setTimeout to allow DB to finish initializing (serialize)
    setTimeout(async () => {
        try {
            await (0, nftables_1.applyAllRules)();
            await (0, nftables_1.applyRoutes)();
            console.log('[startup] All firewall rules and routes applied to OS.');
        }
        catch (err) {
            console.error('[startup] Failed to apply rules on startup:', err);
        }
    }, 2000);
}
catch (err) {
    console.error('[startup] Failed to initialize nftables (running without NET_ADMIN?):', err);
    console.warn('[startup] Firewall rules will be stored in DB but NOT applied to OS.');
}
// Initialize dnsmasq and apply DNS rules from DB on startup
try {
    (0, dnsmasq_1.initDnsmasq)();
    setTimeout(async () => {
        try {
            await (0, dnsmasq_1.applyDnsRules)();
            console.log('[startup] DNS filtering rules applied to dnsmasq.');
            await (0, dnsmasq_1.applyDhcpConfig)();
            console.log('[startup] DHCP configuration applied to dnsmasq.');
        }
        catch (err) {
            console.error('[startup] Failed to apply DNS/DHCP rules on startup:', err);
        }
    }, 2500);
}
catch (err) {
    console.error('[startup] Failed to initialize dnsmasq:', err);
}
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', auth_1.default);
app.use('/api/rules', rules_1.default);
app.use('/api/nat', nat_1.default);
app.use('/api/routing', routing_1.default);
app.use('/api/interfaces', interfaces_1.default);
app.use('/api/dns', dns_1.default);
app.use('/api/dhcp', dhcp_1.default);
app.use('/api/system', system_1.default);
app.use('/api/users', users_1.default);
const server = http_1.default.createServer(app);
(0, ws_1.setupWebSocket)(server);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
