'use client';

import { useOnboarding } from '../../../lib/use-onboarding';

export function OnboardingBanner() {
  const { data, loading } = useOnboarding();

  if (loading || !data || data.status === 'COMPLETED') return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-amber-600 text-lg">⚠️</span>
          <p className="text-sm text-amber-800">
            <strong>Configuration incomplète</strong> — Terminez la configuration pour débloquer toutes les fonctionnalités.
          </p>
        </div>
        <a
          href="/app/onboarding"
          className="px-4 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition whitespace-nowrap"
        >
          Terminer la configuration
        </a>
      </div>
    </div>
  );
}
