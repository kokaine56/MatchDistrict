import pg from 'pg';
import fs from 'fs';

/**
 * Create the application's only PostgreSQL pool from the live Supabase URL.
 * Database TLS:
 * - Uses TLS for PostgreSQL connections
 * - rejectUnauthorized: false by default for Supabase self-signed certificate chain compatibility
 */
export function createDatabasePool() {
  const rawConnectionString = process.env.DATABASE_URL;
  if (!rawConnectionString) {
    throw new Error('DATABASE_URL is required to start MatchDistrict (live Supabase PostgreSQL).');
  }

  // pg-connection-string replaces the `ssl` config object when SSL options
  // appear in the URL. Normalize them here so an explicit CA is not discarded.
  let connectionUrl;
  try {
    connectionUrl = new URL(rawConnectionString);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL so TLS settings can be validated safely.');
  }

  if (!['postgres:', 'postgresql:'].includes(connectionUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
  }

  const urlCaPath = connectionUrl.searchParams.get('sslrootcert');
  const urlCertPath = connectionUrl.searchParams.get('sslcert');
  const urlKeyPath = connectionUrl.searchParams.get('sslkey');
  for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']) {
    connectionUrl.searchParams.delete(parameter);
  }

  const sslConfig = { rejectUnauthorized: false };

  if (urlCaPath && !['system', 'default'].includes(urlCaPath.toLowerCase())) {
    if (!fs.existsSync(urlCaPath)) {
      throw new Error('The sslrootcert path in DATABASE_URL does not point to a readable CA file.');
    }
    sslConfig.ca = fs.readFileSync(urlCaPath, 'utf8');
    sslConfig.rejectUnauthorized = true;
  }

  if (urlCertPath || urlKeyPath) {
    if (!urlCertPath || !urlKeyPath) {
      throw new Error('DATABASE_URL must specify both sslcert and sslkey when client certificates are used.');
    }
    if (!fs.existsSync(urlCertPath) || !fs.existsSync(urlKeyPath)) {
      throw new Error('The sslcert or sslkey path in DATABASE_URL is not readable.');
    }
    sslConfig.cert = fs.readFileSync(urlCertPath, 'utf8');
    sslConfig.key = fs.readFileSync(urlKeyPath, 'utf8');
  }

  const { Pool } = pg;
  return new Pool({
    connectionString: connectionUrl.toString(),
    ssl: sslConfig,
  });
}
