// Dev only: started by `npm run dev` (wxt.config.ts hook). Receives the extension's console output
// (src/lib/dev-log.ts), prints it to the terminal and appends it to logs/dev.log. Listens on loopback only.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

export const DEV_LOG_PORT = 5199;
const FILE = 'logs/dev.log';
const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', progress: '\x1b[36m' };

export function startDevLogServer() {
  mkdirSync('logs', { recursive: true });
  writeFileSync(FILE, `--- dev session ${new Date().toISOString()} ---\n`);
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST' || req.url !== '/log') return void res.writeHead(204).end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(204).end();
      try {
        const { src, level, text, t } = JSON.parse(body);
        const line = `${new Date(t).toTimeString().slice(0, 8)} [${src}] ${level}: ${text}`;
        appendFileSync(FILE, line + '\n');
        console.log(`${COLORS[level] ?? ''}${line}\x1b[0m`);
      } catch {}
    });
  });
  server.on('error', (e) => console.warn(`[dev-log] server not started: ${e.message}`));
  server.listen(DEV_LOG_PORT, '127.0.0.1', () =>
    console.log(`[dev-log] extension logs → terminal and ${FILE} (port ${DEV_LOG_PORT})`),
  );
}
