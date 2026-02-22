import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { setupWebSocket } from './ws';
import authRoutes from './routes/auth';
import rulesRoutes from './routes/rules';
import natRoutes from './routes/nat';
import routingRoutes from './routes/routing';
import interfacesRoutes from './routes/interfaces';
import dnsRoutes from './routes/dns';
import systemRoutes from './routes/system';
import dhcpRoutes from './routes/dhcp';
import usersRoutes from './routes/users';
import { initializeDb } from './db';
import { initNftables, applyAllRules, applyRoutes } from './nftables';
import { initDnsmasq, applyDnsRules, applyDhcpConfig } from './dnsmasq';
import { applyAllInterfaceConfigs } from './network';
import { startSystemMetricsCollector } from './systemMetrics';

dotenv.config();
initializeDb();

// Push DB interface settings into real kernel interface state on startup.
setTimeout(async () => {
    try {
        await applyAllInterfaceConfigs();
        console.log('[startup] Interface configuration applied to OS.');
    } catch (err) {
        console.error('[startup] Failed to apply interface configuration:', err);
    }
}, 1000);

startSystemMetricsCollector().catch((err) => {
    console.error('[startup] Failed to start system metrics collector:', err);
});

// Initialize nftables and apply rules from DB on startup
try {
    initNftables();
    console.log('[startup] nftables initialized, applying rules from database...');
    // Use setTimeout to allow DB to finish initializing (serialize)
    setTimeout(async () => {
        try {
            await applyAllRules();
            await applyRoutes();
            console.log('[startup] All firewall rules and routes applied to OS.');
        } catch (err) {
            console.error('[startup] Failed to apply rules on startup:', err);
        }
    }, 2000);
} catch (err) {
    console.error('[startup] Failed to initialize nftables (running without NET_ADMIN?):', err);
    console.warn('[startup] Firewall rules will be stored in DB but NOT applied to OS.');
}

// Initialize dnsmasq and apply DNS rules from DB on startup
try {
    initDnsmasq();
    setTimeout(async () => {
        try {
            await applyDnsRules();
            console.log('[startup] DNS filtering rules applied to dnsmasq.');
            await applyDhcpConfig();
            console.log('[startup] DHCP configuration applied to dnsmasq.');
        } catch (err) {
            console.error('[startup] Failed to apply DNS/DHCP rules on startup:', err);
        }
    }, 2500);
} catch (err) {
    console.error('[startup] Failed to initialize dnsmasq:', err);
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/nat', natRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/interfaces', interfacesRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/dhcp', dhcpRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/users', usersRoutes);

const server = http.createServer(app);
setupWebSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
