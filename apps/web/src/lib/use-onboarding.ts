'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type OnboardingStep =
  | 'ORG_PROFILE'
  | 'COLLABORATORS'
  | 'PLAN'
  | 'PAYMENT_OFFLINE'
  | 'KYC'
  | 'FIRST_LISTING'
  | 'DONE';

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface Gates {
  subscriptionStatus: string;
  kycStatus: string;
  needsPayment: boolean;
  needsKyc: boolean;
  needsModeration: boolean;
  canPublish: boolean;
}

export interface OnboardingData {
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  completedSteps: Record<string, boolean>;
  persona: string | null;
  gates: Gates;
}

export function useOnboarding() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api<{ ok: boolean; data: OnboardingData }>('/onboarding/me');
      setData(res.data);
      setError(null);
    } catch (e: unknown) {
      const err = e as { status?: number; error?: { message?: string } };
      if (err.status === 401 || err.status === 400) {
        setData(null);
      } else {
        setError(err.error?.message ?? 'Failed to load onboarding');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = useCallback(async () => {
    await api('/onboarding/start', { method: 'POST' });
    await refresh();
  }, [refresh]);

  const completeStep = useCallback(
    async (step: OnboardingStep) => {
      await api('/onboarding/step/complete', {
        method: 'POST',
        body: JSON.stringify({ step }),
      });
      await refresh();
    },
    [refresh],
  );

  const stepBack = useCallback(
    async (to: OnboardingStep) => {
      await api('/onboarding/step/back', {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      await refresh();
    },
    [refresh],
  );

  const complete = useCallback(async () => {
    await api('/onboarding/complete', { method: 'POST' });
    await refresh();
  }, [refresh]);

  return { data, loading, error, refresh, start, completeStep, stepBack, complete };
}
