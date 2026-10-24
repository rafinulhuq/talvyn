import crypto from 'crypto';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ponytail: every deploy used to seed the same hardcoded admin password
// (public in git history + published docs) — anyone could log into a
// fresh deployment as SUPER_ADMIN before the owner thought to change it.
// SEED_ADMIN_PASSWORD lets an operator pin one; otherwise a random
// password is generated and printed once so it's never checked into git.
const seedPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');

const SEED_ADMINS = [
  {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@talvyn.com',
    name: 'Talvyn Admin',
    password: seedPassword,
    role: Role.SUPER_ADMIN,
  },
];

async function main() {
  await Promise.all(SEED_ADMINS.map(async (admin) => {
    const existing = await prisma.user.findUnique({ where: { email: admin.email } });
    if (existing) {
      // The seed list is the source of truth for role assignment — if an
      // already-seeded environment's row drifted (e.g. created before this
      // admin was promoted to SUPER_ADMIN), bring it in line instead of
      // silently leaving it stale. Never touches password/name on an
      // existing row.
      if (existing.role !== admin.role) {
        await prisma.user.update({ where: { email: admin.email }, data: { role: admin.role } });
        console.log(`[seed] Admin role updated: ${admin.email} -> ${admin.role}`);
      } else {
        console.log(`[seed] Admin already exists, skipping: ${admin.email}`);
      }
      return;
    }
    const passwordHash = await bcrypt.hash(admin.password, 12);
    const user = await prisma.user.create({
      data: {
        email: admin.email,
        name: admin.name,
        passwordHash,
        role: admin.role,
      },
    });
    console.log(`[seed] Admin created: ${user.email} (id: ${user.id})`);
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`[seed] Generated password (shown once, not stored anywhere): ${admin.password}`);
      console.log('[seed] Log in and change it immediately, or set SEED_ADMIN_PASSWORD next time.');
    }
  }));
}

main()
  .catch((err) => { console.error('[seed] Failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
