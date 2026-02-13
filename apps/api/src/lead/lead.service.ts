import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateLeadDto) {
    return withOrg(this.prisma, orgId, (tx) =>
      tx.lead.create({
        data: {
          orgId,
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
        },
      }),
    );
  }

  async findAll(orgId: string) {
    return withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  async findOne(orgId: string, id: string) {
    const lead = await withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findUnique({ where: { id } }),
    );
    if (!lead) {
      throw new NotFoundException({
        error: { code: 'LEAD_NOT_FOUND', message: `Lead ${id} not found` },
      });
    }
    return lead;
  }

  async update(orgId: string, id: string, dto: UpdateLeadDto) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      tx.lead.update({ where: { id }, data: dto }),
    );
  }

  async remove(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      tx.lead.delete({ where: { id } }),
    );
  }
}
