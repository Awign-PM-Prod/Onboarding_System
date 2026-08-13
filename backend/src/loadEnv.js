import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prefer backend/.env over parent-process env. Cursor/shell often injects
// SUPABASE_* values; default dotenv does not override them.
loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'),
  override: true,
});
