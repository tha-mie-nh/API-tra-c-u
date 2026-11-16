#!/usr/bin/env node
/**
 * TCP proxy that emulates a firewall / NAT / port-forwarder silently dropping an idle connection: once a connection
 * has been quiet for IDLE_MS it "goes dark" — data in both directions is swallowed and no FIN/RST is ever passed on,
 * so the client keeps believing the connection is alive and its next request is never answered. New connections
 * work normally. Use it to reproduce "the first click hangs until timeout, the second works".
 *
 *   node scripts/load-test/mock-blackhole-proxy.js --listen 8090 --target localhost:8081 --idle-ms 4000
 */
const net = require('node:net');
const { setTimeout, clearTimeout } = require('node:timers');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const LISTEN = Number(args.listen ?? 8090);
const [HOST, PORT] = String(args.target ?? 'localhost:8081').split(':');
const IDLE_MS = Number(args['idle-ms'] ?? 4000);
const log = (m) => console.log(`${new Date().toISOString().slice(11, 23)} ${m}`);

net
  .createServer((client) => {
    const upstream = net.connect(Number(PORT), HOST);
    let dark = false;
    let timer;
    const id = `${client.remotePort}`;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        dark = true;
        log(`conn ${id} idle ${IDLE_MS}ms -> now black-holed`);
      }, IDLE_MS);
    };
    arm();
    client.on('data', (d) => {
      if (dark) return log(`conn ${id} swallowed ${d.length}B from client (request never answered)`);
      arm();
      upstream.write(d);
    });
    upstream.on('data', (d) => {
      if (dark) return;
      arm();
      client.write(d);
    });
    upstream.on('close', () => { if (!dark) client.end(); });
    client.on('close', () => { clearTimeout(timer); upstream.destroy(); });
    client.on('error', () => undefined);
    upstream.on('error', () => { if (!dark) client.destroy(); });
  })
  .listen(LISTEN, () => log(`black-hole proxy :${LISTEN} -> ${HOST}:${PORT} (goes dark after ${IDLE_MS}ms idle)`));
