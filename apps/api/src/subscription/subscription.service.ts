import { Injectable } from '@nestjs/common';
import { SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { ChoosePlanDto } from './dto/choose-plan.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';

const PLAN_DURATION_DAYS = 30;

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(orgId: string) {
    const active = await this.prisma.subscription.findFirst({
      where: { organizationId: orgId, status: SubscriptionStatus.ACTIVE, endAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    const latest = active ?? await this.prisma.subscription.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return { subscription: latest, isActive: !!active };
  }

  async choosePlan(orgId: string, dto: ChoosePlanDto) {
    const existing = await this.prisma.subscription.findFirst({
      where: { organizationId: orgId, status: SubscriptionStatus.ACTIVE, endAt: { gt: new Date() } },
    });
    if (existing) {
      throw new AppError('SUBSCRIPTION_ALREADY_ACTIVE', 409, 'An active subscription already exists');
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        organizationId: orgId,
        planCode: dto.planCode as any,
        status: SubscriptionStatus.PENDING_PAYMENT,
      },
    });

    return { ok: true, subscriptionId: subscription.id };
  }

  async submitOfflinePayment(orgId: string, subscriptionId: string, dto: SubmitPaymentDto) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, organizationId: orgId },
    });
    if (!subscription) throw new AppError('NOT_FOUND', 404, 'Subscription not found');

    if (subscription.status !== SubscriptionStatus.PENDING_PAYMENT) {
      throw new AppError('PAYMENT_NOT_PENDING', 409, 'Subscription is not pending payment');
    }

    const payment = await this.prisma.offlinePayment.create({
      data: {
        organizationId: orgId,
        subscriptionId,
        amountDa: dto.amountDa,
        method: dto.method,
        reference: dto.reference,
        status: PaymentStatus.PENDING,
      },
    });

    return { ok: true, paymentId: payment.id };
  }

  // --- Admin methods ---

  async adminGetPaymentQueue(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.prisma.offlinePayment.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      take: 50,
      include: {
        subscription: {
          select: { id: true, organizationId: true, planCode: true, status: true },
        },
      },
    });
  }

  async adminConfirmPayment(paymentId: string, adminUserId: string) {
    const payment = await this.prisma.offlinePayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppError('NOT_FOUND', 404, 'Payment not found');

    if (payment.status !== PaymentStatus.PENDING) {
      throw new AppError('PAYMENT_NOT_PENDING', 409, 'Payment is not pending');
    }

    const now = new Date();
    const endAt = new Date(now);
    endAt.setDate(endAt.getDate() + PLAN_DURATION_DAYS);

    await this.prisma.offlinePayment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.CONFIRMED, reviewedAt: now, reviewedByUserId: adminUserId },
    });

    await this.prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE, startAt: now, endAt },
    });

    return { ok: true };
  }

  async adminRejectPayment(paymentId: string, adminUserId: string, reason?: string) {
    const payment = await this.prisma.offlinePayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppError('NOT_FOUND', 404, 'Payment not found');

    if (payment.status !== PaymentStatus.PENDING) {
      throw new AppError('PAYMENT_NOT_PENDING', 409, 'Payment is not pending');
    }

    await this.prisma.offlinePayment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REJECTED, reviewedAt: new Date(), reviewedByUserId: adminUserId, rejectionReason: reason },
    });

    return { ok: true };
  }
}
