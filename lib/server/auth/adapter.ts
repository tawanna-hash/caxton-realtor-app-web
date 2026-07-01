import type { Adapter, AdapterAccount } from "@auth/core/adapters";
import { getPool } from "@/lib/server/db/neon";

/**
 * Custom Auth.js adapter that maps the standard `users` / `accounts` shape
 * to our existing `realtors` + `realtor_oauth_accounts` tables.
 *
 * We do NOT implement session methods because we use JWT session strategy.
 * We do NOT implement verification token methods because we handle magic
 * links ourselves for password reset only.
 */
export function realtorAdapter(): Adapter {
  return {
    async getUser(id) {
      const { rows } = await getPool().query(
        `SELECT id, email, email_verified_at, first_name, last_name
           FROM realtors WHERE id = $1::uuid`,
        [id]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        emailVerified: r.email_verified_at,
        name: `${r.first_name} ${r.last_name}`,
      };
    },

    async getUserByEmail(email) {
      const { rows } = await getPool().query(
        `SELECT id, email, email_verified_at, first_name, last_name
           FROM realtors WHERE lower(email) = lower($1::text)`,
        [email]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        emailVerified: r.email_verified_at,
        name: `${r.first_name} ${r.last_name}`,
      };
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const { rows } = await getPool().query(
        `SELECT r.id, r.email, r.email_verified_at, r.first_name, r.last_name
           FROM realtor_oauth_accounts oa
           JOIN realtors r ON r.id = oa.realtor_id
          WHERE oa.provider = $1::text AND oa.provider_account_id = $2::text`,
        [provider, providerAccountId]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        emailVerified: r.email_verified_at,
        name: `${r.first_name} ${r.last_name}`,
      };
    },

    async linkAccount(account: AdapterAccount) {
      await getPool().query(
        `INSERT INTO realtor_oauth_accounts (realtor_id, provider, provider_account_id)
         VALUES ($1::uuid, $2::text, $3::text)
         ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [account.userId, account.provider, account.providerAccountId]
      );
      return account;
    },

    // -- Intentionally NOT implemented --------------------------------------
    // We use JWT session strategy, so createSession/getSessionAndUser/etc.
    // are never called. We create realtor rows via our own /api/auth/signup
    // route, so createUser is never called by Auth.js. If any of these are
    // called something has gone wrong — throw to surface the bug.
    async createUser() {
      throw new Error(
        "realtorAdapter.createUser called — realtor creation must go through /api/auth/signup"
      );
    },
    async updateUser() {
      throw new Error("realtorAdapter.updateUser called — not implemented");
    },
    async deleteUser() {
      throw new Error("realtorAdapter.deleteUser called — not implemented");
    },
    async unlinkAccount() {
      throw new Error("realtorAdapter.unlinkAccount called — not implemented");
    },
  };
}
