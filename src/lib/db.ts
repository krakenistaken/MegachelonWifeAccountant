// src/lib/db.ts
// Database connection manager for Turso (libSQL) and local fallback
import { createClient, Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';

let client: Client;

export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url) {
      // Connect to Turso Cloud database
      client = createClient({
        url,
        authToken,
      });
    } else {
      // Local SQLite fallback for offline development
      const DB_DIR = path.join(process.cwd(), 'data');
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const dbName = process.env.DB_NAME || 'app.db';
      const DB_PATH = path.join(DB_DIR, dbName);
      client = createClient({
        url: `file:${DB_PATH.replace(/\\/g, '/')}`,
      });
    }
  }
  return client;
}

export default getDb;
