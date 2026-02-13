import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * Wraps a Prisma transaction with tenant context (set_config).
 * RLS policies on tenant-scoped tables use current_setting('app.org_id', true)
 * to filter rows. This wrapper guarantees the session variable is set on the
 * same connection that executes the business query.
 *
 * NOTE: The $queryRawUnsafe call here is TECHNICAL SQL for tenant context
 * (set_config), explicitly allowed by project policy. No business SQL.
 */
export async function withOrg<T>(
  prisma: PrismaClient,
  orgId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: TxClient) => {
    await (tx as any).$queryRawUnsafe(
      `SELECT set_config('app.org_id', $1, true)`,
      orgId,
    );
    // Switch to non-superuser role so RLS policies are enforced
    await (tx as any).$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
    const result = await fn(tx);
    // Reset role back to connection default (superuser) for Prisma internals
    await (tx as any).$executeRawUnsafe(`RESET ROLE`);
    return result;
  });
}
