/**
 * Ops script: provision a new tenant with an admin user.
 *
 * Usage:
 *   pnpm ts-node scripts/create-tenant.ts --name "Acme Co" --slug acme --admin-email x@y.z
 */
import { Pool } from 'pg';

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce<string[][]>((acc, a, i, arr) => {
      if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] ?? '']);
      return acc;
    }, []),
  );
  const { name, slug, 'admin-email': email } = args;
  if (!name || !slug || !email) {
    console.error('Required flags: --name, --slug, --admin-email');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `INSERT INTO tenants(name, slug) VALUES($1, $2) RETURNING id`,
    [name, slug],
  );
  const tenantId = rows[0].id;
  await pool.query(
    `INSERT INTO users(tenant_id, email, full_name) VALUES($1, $2, $3)`,
    [tenantId, email, 'Administrator'],
  );
  const adminRole = await pool.query(`SELECT id FROM roles WHERE code='admin'`);
  const user = await pool.query(`SELECT id FROM users WHERE tenant_id=$1 AND email=$2`, [
    tenantId,
    email,
  ]);
  await pool.query(`INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)`, [
    user.rows[0].id,
    adminRole.rows[0].id,
  ]);
  console.log(`Tenant ${slug} created with id ${tenantId}; admin = ${email}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
