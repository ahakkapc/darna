import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { SecretsVaultService } from './crypto/secrets-vault.service';
import { INTEGRATION_NOT_FOUND } from './integration.errors';

@Injectable()
export class SecretsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretsVaultService,
  ) {}

  async listKeys(orgId: string, integrationId: string): Promise<{ key: string; keyVersion: number; updatedAt: Date }[]> {
    await this.assertIntegrationExists(orgId, integrationId);
    const secrets: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integrationSecret.findMany({
        where: { integrationId },
        select: { key: true, keyVersion: true, updatedAt: true },
        orderBy: { key: 'asc' },
      }),
    ) as any[];
    return secrets;
  }

  async putSecret(orgId: string, integrationId: string, key: string, plaintext: string): Promise<void> {
    await this.assertIntegrationExists(orgId, integrationId);
    const { valueEnc, keyVersion } = this.vault.encrypt(plaintext);

    await withOrg(this.prisma, orgId, async (tx) => {
      const existing = await (tx as any).integrationSecret.findFirst({
        where: { integrationId, key },
      });
      if (existing) {
        await (tx as any).integrationSecret.update({
          where: { id: existing.id },
          data: { valueEnc, keyVersion },
        });
      } else {
        await (tx as any).integrationSecret.create({
          data: {
            organizationId: orgId,
            integrationId,
            key,
            valueEnc,
            keyVersion,
          },
        });
      }
    });
  }

  async deleteSecret(orgId: string, integrationId: string, key: string): Promise<void> {
    await this.assertIntegrationExists(orgId, integrationId);
    await withOrg(this.prisma, orgId, async (tx) => {
      const existing = await (tx as any).integrationSecret.findFirst({
        where: { integrationId, key },
      });
      if (existing) {
        await (tx as any).integrationSecret.delete({ where: { id: existing.id } });
      }
    });
  }

  async getDecrypted(orgId: string, integrationId: string, key: string): Promise<string | null> {
    const secret: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integrationSecret.findFirst({
        where: { integrationId, key },
      }),
    );
    if (!secret) return null;
    return this.vault.decrypt(secret.valueEnc, secret.keyVersion);
  }

  private async assertIntegrationExists(orgId: string, integrationId: string): Promise<void> {
    const item = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.findFirst({ where: { id: integrationId } }),
    );
    if (!item) throw INTEGRATION_NOT_FOUND();
  }
}
