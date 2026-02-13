'use client';

import { useEffect, useState } from 'react';
import { useOnboarding, OnboardingStep } from '../../../lib/use-onboarding';
import { api } from '../../../lib/api';

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: 'ORG_PROFILE', label: 'Profil' },
  { key: 'COLLABORATORS', label: 'Collaborateurs' },
  { key: 'PLAN', label: 'Plan' },
  { key: 'PAYMENT_OFFLINE', label: 'Paiement' },
  { key: 'KYC', label: 'Vérification' },
  { key: 'FIRST_LISTING', label: '1er Bien' },
];

function stepIdx(step: OnboardingStep): number {
  return STEPS.findIndex((s) => s.key === step);
}

export default function OnboardingPage() {
  const { data, loading, error, start, completeStep, stepBack, complete, refresh } = useOnboarding();

  useEffect(() => {
    if (data && data.status === 'NOT_STARTED') {
      start();
    }
  }, [data, start]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Chargement...</p></div>;
  if (error) return <div className="flex items-center justify-center min-h-screen"><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Veuillez vous connecter et sélectionner une organisation.</p></div>;

  if (data.status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900">Configuration terminée !</h1>
        <p className="text-gray-600 text-lg">Votre agence est opérationnelle.</p>
        <a href="/app" className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Aller au tableau de bord
        </a>
      </div>
    );
  }

  const currentIdx = stepIdx(data.currentStep);
  const visibleSteps = data.persona === 'INDEPENDENT_AGENT'
    ? STEPS.filter((s) => s.key !== 'COLLABORATORS')
    : STEPS;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Configuration de votre espace</h1>
        <p className="text-gray-500 mb-8">Complétez ces étapes pour débloquer toutes les fonctionnalités.</p>

        {/* Stepper */}
        <nav className="mb-10">
          <ol className="flex items-center w-full">
            {visibleSteps.map((step, i) => {
              const isCompleted = data.completedSteps[step.key];
              const isCurrent = step.key === data.currentStep;
              const idx = stepIdx(step.key);
              return (
                <li key={step.key} className={`flex items-center ${i < visibleSteps.length - 1 ? 'flex-1' : ''}`}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                        isCompleted
                          ? 'bg-green-500 border-green-500 text-white'
                          : isCurrent
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-400'
                      }`}
                    >
                      {isCompleted ? '✓' : i + 1}
                    </div>
                    <span className={`mt-2 text-xs font-medium ${isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < visibleSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${idx < currentIdx || isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <StepContent
            step={data.currentStep}
            gates={data.gates}
            persona={data.persona}
            onComplete={() => completeStep(data.currentStep)}
            onBack={currentIdx > 0 ? () => {
              const prevSteps = visibleSteps.filter((_, i) => stepIdx(visibleSteps[i].key) < currentIdx);
              if (prevSteps.length > 0) stepBack(prevSteps[prevSteps.length - 1].key);
            } : undefined}
            onFinish={complete}
            onRefresh={refresh}
          />
        </div>

        {/* Motivation block */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="font-semibold text-blue-900 mb-2">Ce que ça débloque</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>- Publier vos biens sur la plateforme</li>
            <li>- Recevoir des leads qualifiés</li>
            <li>- Badge &quot;Agence vérifiée&quot;</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StepContent({
  step,
  gates,
  persona,
  onComplete,
  onBack,
  onFinish,
  onRefresh,
}: {
  step: OnboardingStep;
  gates: { subscriptionStatus: string; kycStatus: string; needsPayment: boolean; needsKyc: boolean; canPublish: boolean; needsModeration: boolean };
  persona: string | null;
  onComplete: () => Promise<void>;
  onBack?: () => void;
  onFinish: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e: unknown) {
      const er = e as { error?: { code?: string; message?: string } };
      setErr(er.error?.message ?? 'Une erreur est survenue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {step === 'ORG_PROFILE' && <OrgProfileStep onRefresh={onRefresh} />}
      {step === 'COLLABORATORS' && <CollaboratorsStep persona={persona} />}
      {step === 'PLAN' && <PlanStep />}
      {step === 'PAYMENT_OFFLINE' && <PaymentStep gates={gates} />}
      {step === 'KYC' && <KycStep gates={gates} />}
      {step === 'FIRST_LISTING' && <FirstListingStep />}

      {err && <p className="text-red-500 text-sm mt-4">{err}</p>}

      <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
        <div>
          {onBack && (
            <button onClick={onBack} disabled={busy} className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
              Retour
            </button>
          )}
        </div>
        <div className="flex gap-3">
          {step === 'FIRST_LISTING' && (
            <button onClick={() => handleAction(onFinish)} disabled={busy} className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50">
              {busy ? 'Finalisation...' : 'Terminer la configuration'}
            </button>
          )}
          <button onClick={() => handleAction(onComplete)} disabled={busy} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {busy ? 'En cours...' : 'Continuer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrgProfileStep({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', persona: '', phone: '', wilaya: '' });
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const body: Record<string, string> = {};
    if (form.name) body.name = form.name;
    if (form.persona) body.persona = form.persona;
    if (form.phone) body.phone = form.phone;
    if (form.wilaya) body.wilaya = form.wilaya;
    if (Object.keys(body).length === 0) return;
    await api('/orgs/me', { method: 'PATCH', body: JSON.stringify(body) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onRefresh();
  };

  const handleBlur = () => { save(); };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Profil de l&apos;organisation</h2>
      <p className="text-gray-500 text-sm mb-6">Renseignez les informations de base de votre agence.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom / Raison sociale *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={handleBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Mon Agence" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
          <select value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} onBlur={handleBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">Sélectionner...</option>
            <option value="AGENCY">Agence immobilière</option>
            <option value="INDEPENDENT_AGENT">Agent indépendant</option>
            <option value="DEVELOPER">Promoteur</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={handleBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="0555 123 456" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Wilaya *</label>
          <input type="text" value={form.wilaya} onChange={(e) => setForm({ ...form, wilaya: e.target.value })} onBlur={handleBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Alger" />
        </div>
      </div>
      {saved && <p className="text-green-600 text-sm mt-3">Sauvegardé automatiquement</p>}
    </div>
  );
}

function CollaboratorsStep({ persona }: { persona: string | null }) {
  if (persona === 'INDEPENDENT_AGENT') {
    return (
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Collaborateurs</h2>
        <p className="text-gray-500">Cette étape est automatiquement complétée pour les agents indépendants.</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Collaborateurs</h2>
      <p className="text-gray-500 text-sm mb-6">Invitez vos collaborateurs ou continuez sans ajouter de membres pour l&apos;instant.</p>
      <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
        Vous pouvez inviter des collaborateurs depuis les paramètres de l&apos;organisation à tout moment.
        Cliquez sur <strong>Continuer</strong> pour passer à l&apos;étape suivante.
      </p>
    </div>
  );
}

function PlanStep() {
  const [planCode, setPlanCode] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const choosePlan = async () => {
    if (!planCode) return;
    await api('/subscriptions/choose-plan', { method: 'POST', body: JSON.stringify({ planCode }) });
    setSubmitted(true);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Choisir un plan</h2>
      <p className="text-gray-500 text-sm mb-6">Sélectionnez le plan adapté à vos besoins.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { code: 'AGENCY_DISCOVERY', name: 'Découverte', price: 'Gratuit', desc: 'Pour démarrer' },
          { code: 'AGENCY_PRO', name: 'Pro', price: '5 000 DA/mois', desc: 'Pour les agences actives' },
          { code: 'AGENCY_PREMIUM', name: 'Premium', price: '15 000 DA/mois', desc: 'Visibilité maximale' },
        ].map((plan) => (
          <button key={plan.code} onClick={() => setPlanCode(plan.code)}
            className={`p-5 border-2 rounded-xl text-left transition ${planCode === plan.code ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <h3 className="font-semibold text-gray-900">{plan.name}</h3>
            <p className="text-blue-600 font-bold mt-1">{plan.price}</p>
            <p className="text-gray-500 text-sm mt-1">{plan.desc}</p>
          </button>
        ))}
      </div>
      {planCode && !submitted && (
        <button onClick={choosePlan} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Confirmer le plan
        </button>
      )}
      {submitted && <p className="text-green-600 text-sm mt-4">Plan sélectionné avec succès.</p>}
    </div>
  );
}

function PaymentStep({ gates }: { gates: { needsPayment: boolean } }) {
  const [submitted, setSubmitted] = useState(false);

  const submitPayment = async () => {
    const subs = await api<{ id: string }[]>('/subscriptions/me');
    if (!Array.isArray(subs) || subs.length === 0) return;
    const subId = subs[0].id;
    await api(`/subscriptions/${subId}/payments/offline`, {
      method: 'POST',
      body: JSON.stringify({ amountDa: 5000, method: 'CASH' }),
    });
    setSubmitted(true);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Paiement</h2>
      <p className="text-gray-500 text-sm mb-6">Soumettez la preuve de votre paiement offline.</p>
      {!submitted ? (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">Le paiement sera validé par un administrateur. Vous pouvez continuer l&apos;onboarding en attendant.</p>
          </div>
          <button onClick={submitPayment} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Soumettre le paiement
          </button>
        </div>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="font-semibold text-orange-900">Paiement en attente de validation</p>
          <p className="text-sm text-orange-700 mt-1">Un administrateur vérifiera votre paiement sous 24h.</p>
          {gates.needsPayment && (
            <p className="text-xs text-orange-600 mt-2">Certaines fonctionnalités resteront désactivées jusqu&apos;à la confirmation.</p>
          )}
        </div>
      )}
    </div>
  );
}

function KycStep({ gates }: { gates: { kycStatus: string } }) {
  const [submitted, setSubmitted] = useState(false);

  const submitKyc = async () => {
    await api('/kyc/submit', {
      method: 'POST',
      body: JSON.stringify({ registryNumber: '00000000', registryCity: 'Alger', legalName: 'Mon Agence' }),
    });
    setSubmitted(true);
  };

  if (gates.kycStatus === 'NEEDS_CHANGES') {
    return (
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Vérification KYC</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
          <p className="font-semibold text-red-900">Modifications requises</p>
          <p className="text-sm text-red-700 mt-1">L&apos;administrateur a demandé des corrections. Veuillez resoumettre vos documents.</p>
          <button onClick={submitKyc} className="mt-3 px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
            Resoumettre
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Vérification KYC</h2>
      <p className="text-gray-500 text-sm mb-6">Soumettez vos documents pour vérification d&apos;identité.</p>
      {!submitted ? (
        <button onClick={submitKyc} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Soumettre les documents KYC
        </button>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="font-semibold text-green-900">Documents soumis</p>
          <p className="text-sm text-green-700 mt-1">Vos documents sont en cours de vérification.</p>
        </div>
      )}
    </div>
  );
}

function FirstListingStep() {
  const [form, setForm] = useState({ title: '', wilaya: '', priceDa: '', dealType: 'SALE', type: 'APARTMENT' });
  const [created, setCreated] = useState(false);

  const createListing = async () => {
    if (!form.title || !form.wilaya || !form.priceDa) return;
    await api('/listings', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        wilaya: form.wilaya,
        priceDa: parseInt(form.priceDa, 10),
        dealType: form.dealType,
        type: form.type,
      }),
    });
    setCreated(true);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Premier bien</h2>
      <p className="text-gray-500 text-sm mb-6">Créez votre première annonce (brouillon).</p>
      {!created ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Appartement F3 Alger Centre" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wilaya *</label>
              <input type="text" value={form.wilaya} onChange={(e) => setForm({ ...form, wilaya: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Alger" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix (DA) *</label>
              <input type="number" value={form.priceDa} onChange={(e) => setForm({ ...form, priceDa: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="12000000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de transaction</label>
              <select value={form.dealType} onChange={(e) => setForm({ ...form, dealType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="SALE">Vente</option>
                <option value="RENT">Location</option>
                <option value="SEASONAL">Saisonnier</option>
              </select>
            </div>
          </div>
          <button onClick={createListing} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Créer le brouillon
          </button>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="font-semibold text-green-900">Brouillon créé avec succès !</p>
          <p className="text-sm text-green-700 mt-1">Vous pourrez publier cette annonce une fois toutes les vérifications terminées.</p>
        </div>
      )}
    </div>
  );
}
