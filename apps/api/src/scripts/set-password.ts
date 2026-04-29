/**
 * Ops script: set or reset a user's password from the command line.
 *
 * Usage:
 *   pnpm --filter @ns/api exec ts-node src/scripts/set-password.ts <email> <password> [--no-force-change]
 *
 * Defaults to setting must_change_password=TRUE so the recipient is forced to
 * pick their own on next login. Pass --no-force-change to skip that (useful
 * when bootstrapping the demo admin password).
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { Pool } from 'pg';

async function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--no-force-change');
  const forceChange = flagIndex === -1;
  if (flagIndex !== -1) args.splice(flagIndex, 1);

  const [email, password] = args;
  if (!email || !password) {
    console.error('Usage: set-password.ts <email> <password> [--no-force-change]');
    process.exit(1);
  }
  if (password.length < 8 && forceChange === false) {
    console.error('Password must be at least 8 characters when --no-force-change is set');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set. Run from a shell that has sourced .env.');
    process.exit(1);
  }

  const hash = await argon2.hash(password, { type: argon2.argon2id });

  const pool = new Pool({ connectionString: dbUrl });
  const r = await pool.query(
    `UPDATE users
        SET password_hash = $1,
            must_change_password = $2,
            failed_login_count = 0,
            locked_until = NULL
      WHERE email = $3
      RETURNING id, email`,
    [hash, forceChange, email],
  );
  await pool.end();

  if (r.rowCount === 0) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  console.log(
    `✓ Password set for ${email}` +
      (forceChange ? ' (must change on next login)' : ' (no forced change)'),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
