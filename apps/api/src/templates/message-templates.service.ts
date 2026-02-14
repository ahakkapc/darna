import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { SequenceRendererService } from '../sequences/sequence-renderer.service';
import { TEMPLATE_NOT_FOUND } from '../sequences/sequence.errors';
import { AppError } from '../common/errors/app-error';

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: SequenceRendererService,
  ) {}

  async create(
    orgId: string,
    dto: { channel: string; name: string; subject?: string; body: string },
    userId: string,
  ) {
    if (dto.channel === 'WHATSAPP' && dto.subject) {
      throw new AppError('TEMPLATE_SUBJECT_FORBIDDEN', 400, 'WhatsApp templates cannot have a subject');
    }
    if (dto.channel === 'EMAIL' && !dto.subject) {
      throw new AppError('TEMPLATE_SUBJECT_REQUIRED', 400, 'Email templates require a subject');
    }

    this.renderer.validateVariables(dto.body, dto.subject);
    const used = this.renderer.extractVariables(`${dto.subject ?? ''} ${dto.body}`);

    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageTemplate.create({
        data: {
          organizationId: orgId,
          channel: dto.channel,
          name: dto.name,
          subject: dto.subject ?? null,
          body: dto.body,
          variablesJson: { used },
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      }),
    );
  }

  async findAll(orgId: string, filters?: { channel?: string; status?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.channel) where.channel = filters.channel;
    if (filters?.status) where.status = filters.status;

    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  async findOne(orgId: string, id: string) {
    const t: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageTemplate.findFirst({ where: { id } }),
    );
    if (!t) throw TEMPLATE_NOT_FOUND();
    return t;
  }

  async update(
    orgId: string,
    id: string,
    dto: { name?: string; subject?: string; body?: string },
    userId: string,
  ) {
    const existing: any = await this.findOne(orgId, id);

    const newBody = dto.body ?? existing.body;
    const newSubject = dto.subject !== undefined ? dto.subject : existing.subject;

    this.renderer.validateVariables(newBody, newSubject);
    const used = this.renderer.extractVariables(`${newSubject ?? ''} ${newBody}`);

    const data: Record<string, unknown> = {
      updatedByUserId: userId,
      variablesJson: { used },
      version: { increment: 1 },
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.body !== undefined) data.body = dto.body;

    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageTemplate.update({ where: { id }, data }),
    );
  }

  async activate(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageTemplate.update({ where: { id }, data: { status: 'ACTIVE' } }),
    );
  }

  async archive(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageTemplate.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
  }
}
