import { v4 as uuidv4 } from "uuid";
import { getSQL, initSchema } from "./db";
import { hashPassword } from "./passwords";
import type { User } from "./types";

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    is_admin: row.is_admin as boolean,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

export async function countUsers(): Promise<number> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT COUNT(*)::int AS count FROM users`;
  return rows[0].count as number;
}

export async function countAdmins(): Promise<number> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT COUNT(*)::int AS count FROM users WHERE is_admin = true`;
  return rows[0].count as number;
}

export async function listUsers(): Promise<User[]> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM users ORDER BY created_at ASC`;
  return rows.map((r) => rowToUser(r as Record<string, unknown>));
}

export async function getUserById(id: string): Promise<User | null> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? rowToUser(rows[0] as Record<string, unknown>) : null;
}

export async function getUserByEmail(
  email: string
): Promise<(User & { passwordHash: string }) | null> {
  const sql = getSQL();
  await initSchema();
  const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return { ...rowToUser(row), passwordHash: row.password_hash as string };
}

export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
  isAdmin?: boolean;
}): Promise<User> {
  const sql = getSQL();
  await initSchema();
  const id = uuidv4();
  const passwordHash = hashPassword(data.password);
  const rows = await sql`
    INSERT INTO users (id, email, password_hash, name, is_admin)
    VALUES (${id}, ${data.email.toLowerCase()}, ${passwordHash}, ${data.name ?? ""}, ${data.isAdmin ?? false})
    RETURNING *
  `;
  return rowToUser(rows[0] as Record<string, unknown>);
}

export async function updateUser(
  id: string,
  data: { name?: string; password?: string; isAdmin?: boolean }
): Promise<User | null> {
  const sql = getSQL();
  await initSchema();
  const existing = await getUserById(id);
  if (!existing) return null;

  const passwordHash = data.password ? hashPassword(data.password) : null;

  const rows = await sql`
    UPDATE users SET
      name       = ${data.name ?? existing.name},
      is_admin   = ${data.isAdmin ?? existing.is_admin},
      password_hash = COALESCE(${passwordHash}, password_hash),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? rowToUser(rows[0] as Record<string, unknown>) : null;
}

/**
 * Deleting a user must also take away what they can still call.
 *
 * Removing the row ends their dashboard access immediately, because every
 * page and session-authenticated route re-resolves the viewer from the
 * database. It does nothing to the *public* surface: endpoints declare
 * `owner_user_id ... ON DELETE SET NULL`, so an offboarded person's endpoints
 * stayed enabled with their endpoint keys un-revoked, and /api/run
 * authenticates on the hashed key alone with no owner lookup. They kept a
 * working credential that spent the organisation's upstream keys.
 *
 * So: revoke their endpoint keys and disable their endpoints first, in that
 * order, then delete. Disabling rather than deleting the endpoints keeps the
 * run history and lets an admin hand the work over — the endpoints remain
 * visible to admins, which is what ownerless means here.
 */
export async function deleteUser(id: string): Promise<void> {
  const sql = getSQL();
  await initSchema();
  await sql`
    UPDATE endpoint_keys SET revoked_at = NOW()
    WHERE revoked_at IS NULL
      AND endpoint_id IN (SELECT id FROM endpoints WHERE owner_user_id = ${id})
  `;
  await sql`UPDATE endpoints SET enabled = false WHERE owner_user_id = ${id}`;
  await sql`DELETE FROM users WHERE id = ${id}`;
}
