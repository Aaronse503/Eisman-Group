#!/usr/bin/env node
/**
 * One command to run the whole thing.
 *
 *     npm start
 *
 * Installs what is missing, builds the database if it is not there, starts the
 * web application, works out this machine's address on the network, and starts
 * the phone app already pointed at it — so nothing has to be typed twice and
 * no address has to be looked up.
 *
 * Everything it does is something you could do by hand; it does them in order
 * and says which step it is on, so a failure says what failed.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps', 'web');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const args = new Set(process.argv.slice(2));
const withPhone = !args.has('--no-phone');
const WEB_PORT = Number(process.env.PORT ?? 3000);

// ------------------------------------------------------------------ output

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const say = (message) => console.log(message);
const step = (n, total, message) => say(`${DIM}[${n}/${total}]${RESET} ${message}`);
const warn = (message) => say(`${YELLOW}${message}${RESET}`);

function rule(title) {
  const line = '─'.repeat(62);
  say(`\n${GREEN}${line}${RESET}`);
  if (title) say(`  ${BOLD}${title}${RESET}`);
}

/** Runs a command to completion, showing its output. */
function run(command, commandArgs, cwd = root, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: 'inherit',
      shell: isWindows,
      env: { ...process.env, ...env },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`)),
    );
  });
}

// ------------------------------------------------------------- the network

/**
 * This machine's address on the local network.
 *
 * A phone cannot reach `localhost` — that is the phone. It needs the address
 * the laptop answers on, which is what this finds. A virtual adapter (Docker,
 * a VPN) can offer an address nothing else on the network can reach, so those
 * are skipped by name where they can be recognised.
 */
function lanAddress() {
  const skip = /^(docker|br-|veth|vmnet|vboxnet|utun|tun|tap|zt|ham)/i;
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // Ordinary home and office networks, in the order they are most likely.
      const rank = address.address.startsWith('192.168.')
        ? 0
        : address.address.startsWith('10.')
          ? 1
          : /^172\.(1[6-9]|2\d|3[01])\./.test(address.address)
            ? 2
            : 3;
      candidates.push({ rank, address: address.address, name });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address ?? null;
}

/** True once something is answering on the port. */
function portAnswers(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    const no = () => {
      socket.destroy();
      resolve(false);
    };
    socket.on('error', no);
    socket.on('timeout', no);
  });
}

async function waitForPort(port, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await portAnswers(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ------------------------------------------------------------------- steps

const children = [];

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGINT');
  }
}
process.on('SIGINT', () => {
  say('\nStopping…');
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    say(`\nThis needs Node 20 or newer; this is Node ${process.versions.node}.`);
    say('Install the LTS version from https://nodejs.org and run this again.\n');
    process.exit(1);
  }

  const total = withPhone ? 4 : 3;
  rule('Eisman Holdings Command Center');
  say('');

  // 1. Dependencies.
  if (!existsSync(join(root, 'node_modules', 'next'))) {
    step(1, total, 'Installing what it needs. This takes a couple of minutes, once.');
    await run(npm, ['install']);
  } else {
    step(1, total, 'Everything it needs is installed.');
  }

  // 2. Database.
  const usingEmbedded = !process.env.DATABASE_URL;
  const dataDir = join(web, process.env.PGLITE_DATA_DIR ?? '.data/pglite');
  if (usingEmbedded && existsSync(dataDir)) {
    step(2, total, 'The database is already here.');
  } else {
    step(2, total, 'Building the database and loading sample data.');
    // The seed normally ends by saying what to run next; here, this does.
    await run(npm, ['run', 'setup'], root, { EISMAN_LAUNCHER: '1' });
  }

  // 3. The web application.
  if (await portAnswers(WEB_PORT)) {
    say('');
    warn(`Something is already using port ${WEB_PORT}.`);
    warn('If that is this app in another window, use that one. Otherwise close it, or run:');
    warn(`    PORT=3001 npm start`);
    say('');
    process.exit(1);
  }
  step(3, total, 'Starting the web application…');
  // `next dev` is started directly rather than through the workspace script,
  // which pins its own port; this one has to honour PORT.
  const server = spawn(npm, ['exec', '--', 'next', 'dev', '-p', String(WEB_PORT)], {
    cwd: web,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
  });
  children.push(server);
  // The server's own chatter is hidden; anything that looks like a problem is
  // not, because a silent failure is worse than a noisy one.
  const relay = (chunk) => {
    const text = chunk.toString();
    if (/error|Error|EADDRINUSE|failed/.test(text)) process.stdout.write(text);
  };
  server.stdout.on('data', relay);
  server.stderr.on('data', relay);
  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      say(`\nThe web application stopped (exit ${code}).`);
      shutdown();
      process.exit(code);
    }
  });

  if (!(await waitForPort(WEB_PORT, 120))) {
    say('\nThe web application did not start within two minutes. The output above should say why.');
    shutdown();
    process.exit(1);
  }

  const ip = lanAddress();
  rule('Ready');
  say('');
  say(`  ${BOLD}On this computer${RESET}   http://localhost:${WEB_PORT}`);
  say('');
  say(`  ${BOLD}Sign in${RESET}            aaron@eismandigital.com`);
  say(`                      ChangeMe123!   ${DIM}(you will be asked to change it)${RESET}`);
  say('');
  say(`  ${DIM}Press Ctrl+C in this window to stop everything.${RESET}`);
  say(`${GREEN}${'─'.repeat(62)}${RESET}\n`);

  if (!withPhone) return;

  // 4. The phone app.
  if (!ip) {
    warn('Could not work out this computer\'s address on the network, so the phone app');
    warn('cannot be started automatically. The web application above is running.');
    warn('Connect to Wi-Fi and run `npm start` again, or see MOBILE.md.');
    return;
  }

  step(4, total, `Starting the phone app, pointed at http://${ip}:${WEB_PORT}`);
  say(`${DIM}Scan the QR code below with your phone's camera (iPhone) or Expo Go (Android).${RESET}`);
  say(`${DIM}Your phone and this computer must be on the same Wi-Fi.${RESET}\n`);

  startExpo(`http://${ip}:${WEB_PORT}`, false);
}

const mobile = join(root, 'apps', 'mobile');

/**
 * Starts the phone app.
 *
 * Expo checks its own service for dependency versions on start, and a network
 * that blocks it fails the whole command. That is a check, not the work, so a
 * failure retries once with it turned off rather than leaving someone with no
 * phone app and a stack trace.
 */
function startExpo(apiUrl, offline) {
  const expoArgs = ['exec', '--', 'expo', 'start', ...(offline ? ['--offline'] : [])];
  const expo = spawn(npm, expoArgs, {
    cwd: mobile,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
  });
  children.push(expo);

  const startedAt = Date.now();
  expo.on('exit', (code) => {
    const quickFailure = code !== 0 && Date.now() - startedAt < 90_000;
    if (quickFailure && !offline) {
      say('');
      warn('The phone app could not reach Expo\'s service to check versions.');
      warn('Starting it again without that check — everything else works the same.');
      say('');
      startExpo(apiUrl, true);
      return;
    }
    shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  say(`\n${err instanceof Error ? err.message : String(err)}`);
  shutdown();
  process.exit(1);
});
