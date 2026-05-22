import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.execPath;
const args = [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...process.argv.slice(2)];
const child = spawn(command, args, {
  cwd: root,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, '.wrangler-config'),
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
