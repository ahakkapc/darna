import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

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
    await (tx as any).$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
    const result = await fn(tx);
    await (tx as any).$executeRawUnsafe(`RESET ROLE`);
    return result;
  });
}
