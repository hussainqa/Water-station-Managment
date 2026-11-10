/**
 * Creates (or repairs) the database and its three roles. Idempotent: safe on a fresh
 * server, on an existing database, and on every `npm run db:migrate`.
 *
 *   wtp_owner  owns the database and tables. Migrations and seed scripts only.
 *   wtp_auth   Better Auth only: the four auth tables.
 *   wtp_app    the application: row-level security always applies.
 *
 * Connects as an administrator (DATABASE_ADMIN_URL) that may create roles and
 * databases: the `postgres` superuser locally, or any role with CREATEROLE and
 * CREATEDB on a managed server. This is the ONLY use of that connection.
 *
 * Role names, passwords and the database name are read from the three connection
 * URLs in .env, so those URLs are the single source of truth.
 * Table-level grants live in the migrations (drizzle/*.sql), which run after this.
 */
import "dotenv/config";
import { Client } from "pg";

type Role = { name: string; password: string };

function fromUrl(envName: string): Role & { database: string } {
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set`);
  const url = new URL(raw);
  const role = {
    name: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
  if (!role.name || !role.password || !role.database) {
    throw new Error(`${envName} must include a user, a password and a database`);
  }
  return role;
}

// Identifiers cannot be bound as parameters, so allow only plain names.
function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function ensureRole(admin: Client, role: Role) {
  const exists = await admin.query("select 1 from pg_roles where rolname = $1", [
    role.name,
  ]);
  const verb = exists.rowCount ? "ALTER" : "CREATE";
  // Re-applied every run, so a role that drifted (e.g. gained BYPASSRLS) is put back.
  await admin.query(
    `${verb} ROLE ${ident(role.name)} LOGIN PASSWORD ${literal(role.password)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`,
  );
  return exists.rowCount ? "ok" : "created";
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is not set");

  const owner = fromUrl("DATABASE_OWNER_URL");
  const app = fromUrl("DATABASE_URL");
  const auth = fromUrl("DATABASE_AUTH_URL");
  const database = owner.database;
  if (app.database !== database || auth.database !== database) {
    throw new Error("The three DATABASE_*_URL values must name the same database");
  }
  if (new Set([owner.name, app.name, auth.name]).size !== 3) {
    throw new Error("The owner, app and auth URLs must use three different roles");
  }

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const report: Record<string, string> = {};
    for (const role of [owner, app, auth]) {
      report[role.name] = await ensureRole(admin, role);
    }

    const db = await admin.query("select 1 from pg_database where datname = $1", [
      database,
    ]);
    if (!db.rowCount) {
      // CREATE DATABASE cannot run inside a transaction; pg sends this on its own.
      await admin.query(
        `CREATE DATABASE ${ident(database)} OWNER ${ident(owner.name)}`,
      );
    }
    report[`database ${database}`] = db.rowCount ? "ok" : "created";

    await admin.query(`REVOKE ALL ON DATABASE ${ident(database)} FROM PUBLIC`);
    await admin.query(
      `GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(app.name)}, ${ident(auth.name)}`,
    );

    for (const [what, state] of Object.entries(report)) {
      console.log(`  ${what.padEnd(24)} ${state}`);
    }
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
