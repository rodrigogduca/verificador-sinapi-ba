// Gera .env.local apontando para o Supabase LOCAL (npx supabase start).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const vars = Object.fromEntries(out.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
writeFileSync('.env.local', `VITE_SUPABASE_URL=${vars.API_URL}\nVITE_SUPABASE_ANON_KEY=${vars.ANON_KEY}\n`);
console.log('.env.local criado para', vars.API_URL);
