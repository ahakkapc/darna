import { Injectable } from '@nestjs/common';
import {
  OnboardingStep,
  OnboardingStatus,
  ProPersona,
  KycStatus,
  SubscriptionStatus,
  ModerationStatus,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { withOrg } from '../tenancy/with-org';

const STEP_ORDER: OnboardingStep[] = [
  OnboardingStep.ORG_PROFILE,
  OnboardingStep.COLLABORATORS,
  OnboardingStep.PLAN,
  OnboardingStep.PAYMENT_OFFLINE,
  OnboardingStep.KYC,
  OnboardingStep.FIRST_LISTING,
  OnboardingStep.DONE,
];

function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        persona: true,
        phone: true,
        wilaya: true,
        addressLine: true,
        kycStatus: true,
        isVerifiedPro: true,
      },
    });
    if (!org) throw new AppError('ORG_NOT_FOUND', 404, 'Organisation not found');

    const onboarding = await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.findUnique({ where: { orgId } }),
    );

    const gates = await this.computeGates(orgId);

    if (!onboarding) {
      return {
        ok: true,
        data: {
          status: OnboardingStatus.NOT_STARTED,
          currentStep: OnboardingStep.ORG_PROFILE,
          completedSteps: {},
          persona: org.persona,
          gates,
        },
      };
    }

    return {
      ok: true,
      data: {
        status: onboarding.status,
        currentStep: onboarding.currentStep,
        completedSteps: (onboarding.completedStepsJson as Record<string, boolean>) ?? {},
        persona: org.persona,
        gates,
      },
    };
  }

  async start(orgId: string) {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new AppError('ORG_NOT_FOUND', 404, 'Organisation not found');

    const existing = await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.findUnique({ where: { orgId } }),
    );

    if (existing) {
      return { ok: true, status: existing.status, currentStep: existing.currentStep };
    }

    const firstStep = this.isOrgProfileComplete(org)
      ? this.nextStep(OnboardingStep.ORG_PROFILE, org.persona)
      : OnboardingStep.ORG_PROFILE;

    const completedSteps: Record<string, boolean> = {};
    if (this.isOrgProfileComplete(org)) {
      completedSteps[OnboardingStep.ORG_PROFILE] = true;
    }
    if (firstStep !== OnboardingStep.COLLABORATORS && org.persona === ProPersona.INDEPENDENT_AGENT) {
      completedSteps[OnboardingStep.COLLABORATORS] = true;
    }

    const onboarding = await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.create({
        data: {
          orgId,
          status: OnboardingStatus.IN_PROGRESS,
          currentStep: firstStep,
          startedAt: new Date(),
          completedStepsJson: completedSteps,
        },
      }),
    );

    return { ok: true, status: onboarding.status, currentStep: onboarding.currentStep };
  }

  async completeStep(orgId: string, step: OnboardingStep) {
    const onboarding = await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.findUnique({ where: { orgId } }),
    );
    if (!onboarding) throw new AppError('ONBOARDING_NOT_FOUND', 404, 'Onboarding not found');

    if (onboarding.status === OnboardingStatus.COMPLETED) {
      throw new AppError('INVALID_STEP_ORDER', 409, 'Onboarding already completed');
    }

    if (step !== onboarding.currentStep) {
      throw new AppError('INVALID_STEP_ORDER', 409, `Expected step ${onboarding.currentStep}, got ${step}`);
    }

    await this.validateStep(orgId, step);

    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    const completedSteps = (onboarding.completedStepsJson as Record<string, boolean>) ?? {};
    completedSteps[step] = true;

    const next = this.nextStep(step, org?.persona ?? null);

    if (next !== OnboardingStep.COLLABORATORS || org?.persona !== ProPersona.INDEPENDENT_AGENT) {
      // normal advance
    } else {
      completedSteps[OnboardingStep.COLLABORATORS] = true;
    }

    let actualNext = next;
    if (actualNext === OnboardingStep.COLLABORATORS && org?.persona === ProPersona.INDEPENDENT_AGENT) {
      completedSteps[OnboardingStep.COLLABORATORS] = true;
      actualNext = this.nextStep(OnboardingStep.COLLABORATORS, org.persona);
    }

    await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.update({
        where: { orgId },
        data: {
          currentStep: actualNext,
          completedStepsJson: completedSteps,
        },
      }),
    );

    return { ok: true, currentStep: actualNext, completedSteps };
  }

  async stepBack(orgId: string, to: OnboardingStep) {
    const onboarding = await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.findUnique({ where: { orgId } }),
    );
    if (!onboarding) throw new AppError('ONBOARDING_NOT_FOUND', 404, 'Onboarding not found');

    if (to === OnboardingStep.DONE) {
      throw new AppError('INVALID_STEP_ORDER', 400, 'Cannot go back to DONE');
    }

    const toIdx = stepIndex(to);
    const currentIdx = stepIndex(onboarding.currentStep);
    if (toIdx >= currentIdx) {
      throw new AppError('INVALID_STEP_ORDER', 400, 'Can only go back to a previous step');
    }

    await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.update({
        where: { orgId },
        data: { currentStep: to },
      }),
    );

    return { ok: true, currentStep: to };
  }

  async complete(orgId: string) {
    const onboarding = await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.findUnique({ where: { orgId } }),
    );
    if (!onboarding) throw new AppError('ONBOARDING_NOT_FOUND', 404, 'Onboarding not found');

    if (onboarding.status === OnboardingStatus.COMPLETED) {
      return { ok: true, status: OnboardingStatus.COMPLETED };
    }

    const completed = (onboarding.completedStepsJson as Record<string, boolean>) ?? {};
    if (!completed[OnboardingStep.ORG_PROFILE]) {
      throw new AppError('INVALID_STEP_ORDER', 409, 'ORG_PROFILE not completed');
    }
    if (!completed[OnboardingStep.FIRST_LISTING]) {
      throw new AppError('INVALID_STEP_ORDER', 409, 'FIRST_LISTING not completed');
    }

    await withOrg(this.prisma, orgId, (tx) =>
      tx.orgOnboarding.update({
        where: { orgId },
        data: {
          status: OnboardingStatus.COMPLETED,
          currentStep: OnboardingStep.DONE,
          completedAt: new Date(),
        },
      }),
    );

    return { ok: true, status: OnboardingStatus.COMPLETED };
  }

  // ─── Private helpers ─────────────────────────────────────────

  private isOrgProfileComplete(org: { name: string; persona: ProPersona | null; phone: string | null; wilaya: string | null }): boolean {
    return !!org.name && !!org.persona && !!org.phone && !!org.wilaya;
  }

  private nextStep(current: OnboardingStep, persona: ProPersona | null): OnboardingStep {
    const idx = stepIndex(current);
    if (idx >= STEP_ORDER.length - 1) return OnboardingStep.DONE;

    let next = STEP_ORDER[idx + 1];
    if (next === OnboardingStep.COLLABORATORS && persona === ProPersona.INDEPENDENT_AGENT) {
      next = STEP_ORDER[idx + 2] ?? OnboardingStep.DONE;
    }
    return next;
  }

  private async validateStep(orgId: string, step: OnboardingStep) {
    switch (step) {
      case OnboardingStep.ORG_PROFILE: {
        const org = await this.prisma.org.findUnique({ where: { id: orgId } });
        if (!org || !this.isOrgProfileComplete(org)) {
          throw new AppError('ORG_PROFILE_INCOMPLETE', 400, 'Organisation profile is incomplete (name, persona, phone, wilaya required)');
        }
        break;
      }
      case OnboardingStep.COLLABORATORS: {
        break;
      }
      case OnboardingStep.PLAN: {
        const sub = await this.prisma.subscription.findFirst({
          where: { organizationId: orgId, status: { not: SubscriptionStatus.INACTIVE } },
        });
        if (!sub) {
          throw new AppError('ONBOARDING_STEP_NOT_ALLOWED', 403, 'A subscription must be chosen before completing PLAN step');
        }
        break;
      }
      case OnboardingStep.PAYMENT_OFFLINE: {
        const payment = await this.prisma.offlinePayment.findFirst({
          where: { organizationId: orgId },
          orderBy: { submittedAt: 'desc' },
        });
        if (!payment) {
          throw new AppError('ONBOARDING_STEP_NOT_ALLOWED', 403, 'An offline payment must be submitted');
        }
        break;
      }
      case OnboardingStep.KYC: {
        const org = await this.prisma.org.findUnique({ where: { id: orgId } });
        if (!org || (org.kycStatus !== KycStatus.SUBMITTED && org.kycStatus !== KycStatus.VERIFIED)) {
          throw new AppError('ONBOARDING_STEP_NOT_ALLOWED', 403, 'KYC must be submitted or verified');
        }
        break;
      }
      case OnboardingStep.FIRST_LISTING: {
        const listing = await this.prisma.listing.findFirst({
          where: { organizationId: orgId, recordStatus: RecordStatus.ACTIVE },
        });
        if (!listing) {
          throw new AppError('ONBOARDING_STEP_NOT_ALLOWED', 403, 'At least one listing must be created');
        }
        break;
      }
      default:
        break;
    }
  }

  private async computeGates(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: { kycStatus: true, isVerifiedPro: true },
    });

    const sub = await this.prisma.subscription.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    const listing = await this.prisma.listing.findFirst({
      where: { organizationId: orgId, recordStatus: RecordStatus.ACTIVE },
      include: { moderation: true },
    });

    const subscriptionStatus = sub?.status ?? SubscriptionStatus.INACTIVE;
    const kycStatus = org?.kycStatus ?? KycStatus.NOT_SUBMITTED;

    const needsPayment = subscriptionStatus !== SubscriptionStatus.ACTIVE;
    const needsKyc = kycStatus !== KycStatus.VERIFIED;
    const needsModeration = !listing?.moderation || listing.moderation.status !== ModerationStatus.APPROVED;

    const canPublish =
      subscriptionStatus !== SubscriptionStatus.SUSPENDED &&
      kycStatus === KycStatus.VERIFIED &&
      !!listing?.moderation &&
      listing.moderation.status === ModerationStatus.APPROVED;

    return {
      subscriptionStatus,
      kycStatus,
      needsPayment,
      needsKyc,
      needsModeration,
      canPublish,
    };
  }
}
