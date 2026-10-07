/**
 * occupy-port.mjs — binds and holds 127.0.0.1:10808 (FAKE_CORE_PORT override)
 * so TC-02-05 can pin FR-15: Start while the port is busy must fail with
 * E-IO-003 naming the port and must spawn nothing (docs/qa/m1-test-plan.md §9.2).
 *
 * Synthetic/loopback only (strategy §1). If the port is already held by a
 * foreign process, the "occupied" precondition still holds: log it, stay alive,
 * and let the test's start() assertion decide (policy-agnostic per Q-03).
 */
import net from 'node:net';

const port = Number(process.env.FAKE_CORE_PORT || 10808);
const keepAlive = setInterval(() => {}, 1000);
const server = net.createServer();

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`occupy-port: 127.0.0.1:${port} already held by another process`);
    return;
  }
  console.error(`occupy-port: ${error.message}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`occupy-port: holding 127.0.0.1:${port}`);
});

process.on('SIGTERM', () => {
  clearInterval(keepAlive);
  server.close(() => process.exit(0));
});
