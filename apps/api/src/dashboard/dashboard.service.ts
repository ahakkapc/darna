import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { withOrg } from '../tenancy/with-org';
import { resolvePeriod, bucketByDay, toLocalDateKey } from './utils/period';

type OrgRole = 'OWNER' | 'MANAGER' | 'AGENT' | 'VIEWER';

interface ScopeParams {
  scope: string;
  userId?: string;
  callerUserId: string;
  callerRole: OrgRole;
}

function resolveTargetUserId(p: ScopeParams): string | null {
  if (p.scope === 'me') return p.callerUserId;
  if (p.scope === 'user') {
    assertManager(p.callerRole);
    if (!p.userId) throw new AppError('VALIDATION_ERROR', 400, 'userId required for scope=user');
    return p.userId;
  }
  if (p.scope === 'org') {
    assertManager(p.callerRole);
    return null;
  }
  throw new AppError('VALIDATION_ERROR', 400, 'Invalid scope');
}

function assertManager(role: OrgRole) {
  if (role !== 'OWNER' && role !== 'MANAGER') {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Manager role required');
  }
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    orgId: string,
    callerUserId: string,
    callerRole: OrgRole,
    query: { period: string; from?: string; to?: string; scope: string; userId?: string },
  ) {
    const targetUserId = resolveTargetUserId({ ...query, callerUserId, callerRole });
    const period = resolvePeriod(query);
    const { from, to, timezone, days } = period;

    const leadOwnerFilter = targetUserId ? { ownerUserId: targetUserId } : {};
    const assigneeFilter = targetUserId ? { assigneeUserId: targetUserId } : {};

    const [
      leadsNew, leadsWon, leadsLost,
      visitsScheduled, visitsCompleted,
      callsLogged,
      tasksOverdue, tasksDueSoon,
      leadsByStatus, leadsBySource,
      leadsForSeries, activitiesForSeries, visitsForSeries,
    ] = await withOrg(this.prisma, orgId, async (tx) => {
      const leadBase = { recordStatus: 'ACTIVE' as const, ...leadOwnerFilter };

      const newCount = await tx.lead.count({
        where: { ...leadBase, createdAt: { gte: from, lt: to } },
      });
      const wonCount = await tx.lead.count({
        where: { ...leadBase, wonAt: { gte: from, lt: to } },
      });
      const lostCount = await tx.lead.count({
        where: { ...leadBase, lostAt: { gte: from, lt: to } },
      });

      const vScheduled = await tx.calendarEvent.count({
        where: {
          recordStatus: 'ACTIVE',
          type: 'VISIT',
          status: 'SCHEDULED',
          startAt: { gte: from, lt: to },
          ...assigneeFilter,
        },
      });
      const vCompleted = await tx.calendarEvent.count({
        where: {
          recordStatus: 'ACTIVE',
          type: 'VISIT',
          status: 'COMPLETED',
          startAt: { gte: from, lt: to },
          ...assigneeFilter,
        },
      });

      const calls = await tx.leadActivity.count({
        where: {
          recordStatus: 'ACTIVE',
          type: 'CALL',
          createdAt: { gte: from, lt: to },
          ...(targetUserId ? { createdByUserId: targetUserId } : {}),
        },
      });

      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const overdueCount = await tx.task.count({
        where: {
          recordStatus: 'ACTIVE',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { lt: now },
          ...assigneeFilter,
        },
      });
      const dueSoonCount = await tx.task.count({
        where: {
          recordStatus: 'ACTIVE',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { gte: now, lt: in48h },
          ...assigneeFilter,
        },
      });

      const byStatus = await tx.lead.groupBy({
        by: ['status'],
        where: leadBase,
        _count: true,
      });
      const bySource = await tx.lead.groupBy({
        by: ['sourceType'],
        where: leadBase,
        _count: true,
      });

      const leadsRows = await tx.lead.findMany({
        where: { ...leadBase, createdAt: { gte: from, lt: to } },
        select: { createdAt: true },
      });
      const actRows = await tx.leadActivity.findMany({
        where: {
          recordStatus: 'ACTIVE',
          createdAt: { gte: from, lt: to },
          ...(targetUserId ? { createdByUserId: targetUserId } : {}),
        },
        select: { type: true, createdAt: true },
      });
      const visitRows = await tx.calendarEvent.findMany({
        where: {
          recordStatus: 'ACTIVE',
          type: 'VISIT',
          startAt: { gte: from, lt: to },
          ...assigneeFilter,
        },
        select: { status: true, startAt: true },
      });

      return [
        newCount, wonCount, lostCount,
        vScheduled, vCompleted,
        calls,
        overdueCount, dueSoonCount,
        byStatus, bySource,
        leadsRows, actRows, visitRows,
      ] as const;
    });

    let listingsPublished = 0;
    let listingsDraft = 0;
    let listingsByStatus: { status: string; count: number }[] = [];
    try {
      const listingOwnerFilter = targetUserId ? { ownerUserId: targetUserId } : {};
      const lGroups = await withOrg(this.prisma, orgId, (tx) =>
        tx.listing.groupBy({
          by: ['status'],
          where: { recordStatus: 'ACTIVE', ...listingOwnerFilter },
          _count: true,
        }),
      );
      listingsByStatus = lGroups.map((g: any) => ({ status: g.status, count: g._count }));
      listingsPublished = lGroups.find((g: any) => g.status === 'PUBLISHED')?._count ?? 0;
      listingsDraft = lGroups.find((g: any) => g.status === 'DRAFT')?._count ?? 0;
    } catch {
      // Listing model might not exist yet — graceful fallback
    }

    const conversionWonRate = leadsNew > 0 ? Math.round((leadsWon / leadsNew) * 10000) / 100 : 0;

    const leadsPerDay = days.map((date) => {
      const bucket = bucketByDay(leadsForSeries, (r) => r.createdAt, timezone, [date]);
      return { date, count: bucket.get(date)?.length ?? 0 };
    });

    const activitiesPerDay = days.map((date) => {
      const dayItems = activitiesForSeries.filter(
        (a) => toLocalDateKey(a.createdAt, timezone) === date,
      );
      return {
        date,
        calls: dayItems.filter((a) => a.type === 'CALL').length,
        sms: dayItems.filter((a) => a.type === 'SMS').length,
        emails: dayItems.filter((a) => a.type === 'EMAIL').length,
        notes: dayItems.filter((a) => a.type === 'NOTE').length,
      };
    });

    const visitsPerDay = days.map((date) => {
      const dayItems = visitsForSeries.filter(
        (v) => toLocalDateKey(v.startAt, timezone) === date,
      );
      return {
        date,
        scheduled: dayItems.filter((v) => v.status === 'SCHEDULED').length,
        completed: dayItems.filter((v) => v.status === 'COMPLETED').length,
        canceled: dayItems.filter((v) => v.status === 'CANCELED').length,
        noShow: dayItems.filter((v) => v.status === 'NO_SHOW').length,
      };
    });

    return {
      period: { key: period.key, from: from.toISOString(), to: to.toISOString(), timezone },
      kpis: {
        leadsNew,
        leadsWon,
        leadsLost,
        conversionWonRate,
        visitsScheduled,
        visitsCompleted,
        callsLogged,
        tasksOverdue,
        tasksDueSoon,
        listingsPublished,
        listingsDraft,
        photoQualityRejectedListings: 0,
      },
      breakdowns: {
        leadsBySource: leadsBySource.map((g: any) => ({ source: g.sourceType, count: g._count })),
        leadsByStatus: leadsByStatus.map((g: any) => ({ status: g.status, count: g._count })),
        listingsByStatus,
      },
      series: { leadsPerDay, activitiesPerDay, visitsPerDay },
    };
  }

  async getCollaborators(
    orgId: string,
    callerRole: OrgRole,
    query: { period: string; from?: string; to?: string; sort?: string; order?: string },
  ) {
    assertManager(callerRole);
    const period = resolvePeriod(query);
    const { from, to } = period;

    const memberships = await this.prisma.orgMembership.findMany({
      where: { orgId },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    });

    const items = await Promise.all(
      memberships.map(async (m) => {
        const uid = m.userId;
        const [newLeads, wonLeads, lostLeads, owned, vSched, vComp, calls, overdue] =
          await withOrg(this.prisma, orgId, async (tx) => {
            const lBase = { recordStatus: 'ACTIVE' as const, ownerUserId: uid };
            const n = await tx.lead.count({ where: { ...lBase, createdAt: { gte: from, lt: to } } });
            const w = await tx.lead.count({ where: { ...lBase, wonAt: { gte: from, lt: to } } });
            const l = await tx.lead.count({ where: { ...lBase, lostAt: { gte: from, lt: to } } });
            const o = await tx.lead.count({ where: lBase });

            const vs = await tx.calendarEvent.count({
              where: { recordStatus: 'ACTIVE', type: 'VISIT', status: 'SCHEDULED', assigneeUserId: uid, startAt: { gte: from, lt: to } },
            });
            const vc = await tx.calendarEvent.count({
              where: { recordStatus: 'ACTIVE', type: 'VISIT', status: 'COMPLETED', assigneeUserId: uid, startAt: { gte: from, lt: to } },
            });
            const c = await tx.leadActivity.count({
              where: { recordStatus: 'ACTIVE', type: 'CALL', createdByUserId: uid, createdAt: { gte: from, lt: to } },
            });
            const od = await tx.task.count({
              where: { recordStatus: 'ACTIVE', status: { in: ['OPEN', 'IN_PROGRESS'] }, assigneeUserId: uid, dueAt: { lt: new Date() } },
            });
            return [n, w, l, o, vs, vc, c, od] as const;
          });

        let listingsOwned = 0;
        let listingsPublished = 0;
        try {
          const [lo, lp] = await withOrg(this.prisma, orgId, async (tx) => {
            const owned = await tx.listing.count({ where: { recordStatus: 'ACTIVE', ownerUserId: uid } });
            const pub = await tx.listing.count({ where: { recordStatus: 'ACTIVE', ownerUserId: uid, status: 'PUBLISHED' } });
            return [owned, pub] as const;
          });
          listingsOwned = lo;
          listingsPublished = lp;
        } catch { /* Listing not available */ }

        return {
          userId: uid,
          displayName: m.user.name || m.user.email || uid.substring(0, 8),
          role: m.role,
          kpis: {
            leadsOwned: owned,
            leadsNew: newLeads,
            leadsWon: wonLeads,
            leadsLost: lostLeads,
            visitsScheduled: vSched,
            visitsCompleted: vComp,
            callsLogged: calls,
            tasksOverdue: overdue,
            listingsOwned,
            listingsPublished,
          },
        };
      }),
    );

    const sortKey = query.sort ?? 'leadsWon';
    const desc = (query.order ?? 'desc') === 'desc';
    items.sort((a, b) => {
      const av = (a.kpis as any)[sortKey] ?? 0;
      const bv = (b.kpis as any)[sortKey] ?? 0;
      return desc ? bv - av : av - bv;
    });

    return { items };
  }

  async getPipeline(
    orgId: string,
    callerUserId: string,
    callerRole: OrgRole,
    query: { period: string; from?: string; to?: string; scope: string; userId?: string },
  ) {
    const targetUserId = resolveTargetUserId({ ...query, callerUserId, callerRole });
    const period = resolvePeriod(query);
    const { from, to } = period;

    return withOrg(this.prisma, orgId, async (tx) => {
      const ownerFilter = targetUserId ? { ownerUserId: targetUserId } : {};
      const leadBase = { recordStatus: 'ACTIVE' as const, ...ownerFilter };

      const leadsCreated = await tx.lead.count({
        where: { ...leadBase, createdAt: { gte: from, lt: to } },
      });

      const visitScheduled = await tx.lead.count({
        where: {
          ...leadBase,
          calendarEvents: {
            some: { type: 'VISIT', startAt: { gte: from, lt: to }, recordStatus: 'ACTIVE' },
          },
        },
      });

      const offerInProgress = await tx.lead.count({
        where: { ...leadBase, status: 'OFFER_IN_PROGRESS' },
      });

      const won = await tx.lead.count({
        where: { ...leadBase, wonAt: { gte: from, lt: to } },
      });

      const leadToVisit = leadsCreated > 0 ? Math.round((visitScheduled / leadsCreated) * 10000) / 100 : 0;
      const visitToOffer = visitScheduled > 0 ? Math.round((offerInProgress / visitScheduled) * 10000) / 100 : 0;
      const offerToWon = offerInProgress > 0 ? Math.round((won / offerInProgress) * 10000) / 100 : 0;

      return {
        funnel: [
          { step: 'LEADS_CREATED', count: leadsCreated },
          { step: 'VISIT_SCHEDULED', count: visitScheduled },
          { step: 'OFFER_IN_PROGRESS', count: offerInProgress },
          { step: 'WON', count: won },
        ],
        rates: { leadToVisit, visitToOffer, offerToWon },
      };
    });
  }

  async getFocus(
    orgId: string,
    callerUserId: string,
    callerRole: OrgRole,
    query: { scope: string; userId?: string },
  ) {
    const targetUserId = resolveTargetUserId({ ...query, callerUserId, callerRole });

    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    return withOrg(this.prisma, orgId, async (tx) => {
      const assigneeFilter = targetUserId ? { assigneeUserId: targetUserId } : {};

      const overdueTasks = await tx.task.findMany({
        where: {
          recordStatus: 'ACTIVE',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { lt: now },
          ...assigneeFilter,
        },
        select: { id: true, title: true, dueAt: true, leadId: true },
        orderBy: { dueAt: 'asc' },
        take: 20,
      });

      const needsFollowUpLeads = overdueTasks.map((t) => ({
        leadId: t.leadId,
        fullName: t.title,
        reason: 'TASK_OVERDUE' as const,
        taskId: t.id,
        dueAt: t.dueAt?.toISOString() ?? null,
      }));

      const upcomingVisitsRaw = await tx.calendarEvent.findMany({
        where: {
          recordStatus: 'ACTIVE',
          type: 'VISIT',
          status: 'SCHEDULED',
          startAt: { gte: now, lt: in48h },
          ...assigneeFilter,
        },
        select: { id: true, leadId: true, title: true, startAt: true, assigneeUserId: true },
        orderBy: { startAt: 'asc' },
        take: 20,
      });
      const upcomingVisits = upcomingVisitsRaw.map((v) => ({
        eventId: v.id,
        leadId: v.leadId,
        title: v.title,
        startAt: v.startAt.toISOString(),
        assigneeUserId: v.assigneeUserId,
      }));

      let readyToPublishListings: { listingId: string; title: string; photoQualityScore: number | null; missing: string[] }[] = [];
      try {
        const ownerFilter = targetUserId ? { ownerUserId: targetUserId } : {};
        const drafts = await tx.listing.findMany({
          where: { recordStatus: 'ACTIVE', status: 'DRAFT', ...ownerFilter },
          select: { id: true, title: true, photoQualityScore: true, description: true, priceDa: true, wilaya: true },
          take: 20,
        });
        readyToPublishListings = drafts.map((l) => {
          const missing: string[] = [];
          if (!l.description) missing.push('description');
          if (!l.priceDa) missing.push('price');
          if (!l.wilaya) missing.push('wilaya');
          return { listingId: l.id, title: l.title, photoQualityScore: l.photoQualityScore, missing };
        });
      } catch { /* Listing not available */ }

      return { needsFollowUpLeads, upcomingVisits, readyToPublishListings };
    });
  }

  async exportLeadsCsv(
    orgId: string,
    callerRole: OrgRole,
    query: { period: string; from?: string; to?: string; scope: string; userId?: string; callerUserId: string },
  ): Promise<string> {
    assertManager(callerRole);
    const targetUserId = query.scope === 'user' ? query.userId : query.scope === 'org' ? null : query.callerUserId;
    const period = resolvePeriod(query);
    const { from, to } = period;

    const ownerFilter = targetUserId ? { ownerUserId: targetUserId } : {};

    const leads = await withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findMany({
        where: {
          recordStatus: 'ACTIVE',
          createdAt: { gte: from, lt: to },
          ...ownerFilter,
        },
        select: {
          id: true, fullName: true, phone: true, email: true,
          type: true, status: true, sourceType: true,
          ownerUserId: true, wilaya: true, commune: true, quartier: true,
          budgetMin: true, budgetMax: true,
          createdAt: true, wonAt: true, lostAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    );

    const ownerIds = [...new Set(leads.map((l) => l.ownerUserId).filter(Boolean))] as string[];
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, name: true },
        })
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o.name ?? '']));

    const header = 'leadId,fullName,phone,email,type,status,sourceType,ownerUserId,ownerName,wilaya,commune,quartier,budgetMin,budgetMax,createdAt,wonAt,lostAt';
    const rows = leads.map((l) => {
      const ownerName = l.ownerUserId ? (ownerMap.get(l.ownerUserId) ?? '') : '';
      return [
        l.id,
        csvEscape(l.fullName),
        csvEscape(l.phone ?? ''),
        csvEscape(l.email ?? ''),
        l.type,
        l.status,
        l.sourceType,
        l.ownerUserId ?? '',
        csvEscape(ownerName),
        csvEscape(l.wilaya ?? ''),
        csvEscape(l.commune ?? ''),
        csvEscape(l.quartier ?? ''),
        l.budgetMin ?? '',
        l.budgetMax ?? '',
        l.createdAt.toISOString(),
        l.wonAt?.toISOString() ?? '',
        l.lostAt?.toISOString() ?? '',
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
