/**
 * Accounts whose role can never be changed through the app. The platform's
 * Super Admin was accidentally demoted via the admin UI on 2026-09-07. Keyed
 * by id, so email renames don't matter.
 *
 * Defense in depth for a friendly error: the real guarantee is the
 * `trg_protect_superadmin_role` DB trigger (alembic c4f9e2a7d1b8).
 */
const PROTECTED_SUPER_ADMIN_IDS: readonly string[] = ["ed5b90d3-bb0c-483f-b756-026f1e33dda9"];

export const isProtectedSuperAdminId = (userId: string) => PROTECTED_SUPER_ADMIN_IDS.includes(userId);
