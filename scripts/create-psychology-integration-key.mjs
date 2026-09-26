import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const file = new URL('../.env.psicologos-n8n.local', import.meta.url);
// Fail if a key already exists: rotating silently would break n8n.
await writeFile(file, `PSICOLOGOS_N8N_TOKEN=${token}\nPSICOLOGOS_N8N_TOKEN_HASH=${hash}\n`, { flag: 'wx', mode: 0o600 });
console.log('Clave dedicada creada en archivo local ignorado por Git; valor no mostrado.');
