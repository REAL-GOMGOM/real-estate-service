import 'server-only';

import { auth } from '@/auth';

/** Do not infer administrator privileges from a layout, email alone, or a role. */
export async function isFieldReportAdmin(): Promise<boolean> {
  const session = await auth();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const sessionEmail = session?.user?.email?.trim().toLowerCase();

  return Boolean(
    adminEmail &&
      session?.user?.id === 'admin' &&
      sessionEmail === adminEmail,
  );
}
