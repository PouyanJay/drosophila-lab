import { Pool } from 'pg';
import 'server-only';
const globalDb = globalThis as unknown as { localLabPool?: Pool };
export function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Error('Start the local workspace to connect Supabase.');
  if (!globalDb.localLabPool) {
    const pool = new Pool({
      connectionString,
      max: 8,
      options: '-c search_path=lab,public',
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', () => {
      console.warn('Local database disconnected; new requests will reconnect.');
    });
    globalDb.localLabPool = pool;
  }
  return globalDb.localLabPool;
}
