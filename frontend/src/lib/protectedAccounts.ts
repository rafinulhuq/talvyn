/**
 * Accounts whose role can never be changed through the app, at any
 * privilege level. Currently just the platform's one and only Super Admin
 * (id below) — its role was accidentally reset to USER via the admin UI
 * on 2026-09-07 and had to be restored by hand. Its login email was
 * admin@talvyn.com at the time and was renamed to admin@talvyn.org
 * on 2026-09-08 — this guard is keyed by id, so the rename didn't need any
 * change here. A separate dormant duplicate (admin@Talvyn.com) was
 * demoted and deactivated the same day so this is the only SUPER_ADMIN.
 *
 * This is a defense-in-depth guard for a friendly error message; the real
 * guarantee is the `trg_protect_superadmin_role` database trigger added in
 * alembic revision c4f9e2a7d1b8, which rejects the UPDATE regardless of
 * which code path (or raw SQL) attempts it.
 */
const PROTECTED_SUPER_ADMIN_IDS: readonly string[] = ["ed5b90d3-bb0c-483f-b756-026f1e33dda9"];

export function isProtectedSuperAdminId(userId: string): boolean {
  return PROTECTED_SUPER_ADMIN_IDS.includes(userId);
}
