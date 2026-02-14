export type TemplateContext = {
  orgId: string;
  userId: string;
  meta: Record<string, unknown>;
};

export type RenderedNotification = {
  title: string;
  body?: string;
  linkUrl?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
};

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'WHATSAPP';

export interface TemplateDefinition {
  category: string;
  defaultPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  defaultChannels: NotificationChannel[];
  dedupeWindowSeconds: number;
  render: (ctx: TemplateContext) => RenderedNotification;
}

const IN_APP_EMAIL: NotificationChannel[] = ['IN_APP', 'EMAIL'];
const IN_APP_ONLY: NotificationChannel[] = ['IN_APP'];

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  // ─── LEAD ──────────────────────────────────────────────
  'lead.new': {
    category: 'LEAD',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 300,
    render: (ctx) => ({
      title: 'Nouveau lead reçu',
      body: ctx.meta.leadName ? `Lead : ${String(ctx.meta.leadName).slice(0, 80)}` : undefined,
      linkUrl: ctx.meta.leadId ? `/app/crm/leads/${ctx.meta.leadId}` : undefined,
      priority: 'HIGH',
    }),
  },

  'lead.assigned': {
    category: 'LEAD',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 300,
    render: (ctx) => ({
      title: "Un lead t'a été assigné",
      body: ctx.meta.leadName ? `Lead : ${String(ctx.meta.leadName).slice(0, 80)}` : undefined,
      linkUrl: ctx.meta.leadId ? `/app/crm/leads/${ctx.meta.leadId}` : undefined,
      priority: 'HIGH',
    }),
  },

  'lead.markWon': {
    category: 'LEAD',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: (ctx) => ({
      title: 'Lead gagné !',
      body: ctx.meta.leadName ? `Lead : ${String(ctx.meta.leadName).slice(0, 80)}` : undefined,
      linkUrl: ctx.meta.leadId ? `/app/crm/leads/${ctx.meta.leadId}` : undefined,
      priority: 'HIGH',
    }),
  },

  'lead.markLost': {
    category: 'LEAD',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: (ctx) => ({
      title: 'Lead perdu',
      body: ctx.meta.leadName ? `Lead : ${String(ctx.meta.leadName).slice(0, 80)}` : undefined,
      linkUrl: ctx.meta.leadId ? `/app/crm/leads/${ctx.meta.leadId}` : undefined,
      priority: 'NORMAL',
    }),
  },

  'lead.status.changed': {
    category: 'LEAD',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_ONLY,
    dedupeWindowSeconds: 60,
    render: (ctx) => ({
      title: `Lead passé en ${ctx.meta.newStatus ?? 'nouveau statut'}`,
      linkUrl: ctx.meta.leadId ? `/app/crm/leads/${ctx.meta.leadId}` : undefined,
      priority: 'NORMAL',
    }),
  },

  // ─── TASK ──────────────────────────────────────────────
  'task.assigned': {
    category: 'TASK',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 300,
    render: (ctx) => ({
      title: "Une tâche t'a été assignée",
      body: ctx.meta.taskTitle ? String(ctx.meta.taskTitle).slice(0, 120) : undefined,
      linkUrl: ctx.meta.taskId ? `/app/crm/tasks?taskId=${ctx.meta.taskId}` : '/app/crm/tasks',
      priority: 'HIGH',
    }),
  },

  'task.comment': {
    category: 'TASK',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_ONLY,
    dedupeWindowSeconds: 120,
    render: (ctx) => ({
      title: 'Nouveau commentaire sur une tâche',
      body: ctx.meta.taskTitle ? String(ctx.meta.taskTitle).slice(0, 120) : undefined,
      linkUrl: ctx.meta.taskId ? `/app/crm/tasks?taskId=${ctx.meta.taskId}` : '/app/crm/tasks',
      priority: 'NORMAL',
    }),
  },

  'task.reminder': {
    category: 'TASK',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 3600,
    render: (ctx) => ({
      title: 'Rappel : tâche à traiter',
      body: ctx.meta.taskTitle ? String(ctx.meta.taskTitle).slice(0, 120) : undefined,
      linkUrl: ctx.meta.taskId ? `/app/crm/tasks?taskId=${ctx.meta.taskId}` : '/app/crm/tasks',
      priority: 'HIGH',
    }),
  },

  'task.overdue': {
    category: 'TASK',
    defaultPriority: 'URGENT',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 21600,
    render: (ctx) => ({
      title: 'Tâche en retard',
      body: ctx.meta.taskTitle ? String(ctx.meta.taskTitle).slice(0, 120) : undefined,
      linkUrl: ctx.meta.taskId ? `/app/crm/tasks?taskId=${ctx.meta.taskId}` : '/app/crm/tasks',
      priority: 'URGENT',
    }),
  },

  // ─── PLANNING (VISIT) ─────────────────────────────────
  'visit.created': {
    category: 'TASK',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 300,
    render: (ctx) => ({
      title: 'Nouvelle visite planifiée',
      body: ctx.meta.eventTitle ? String(ctx.meta.eventTitle).slice(0, 120) : undefined,
      linkUrl: '/app/planning',
      priority: 'NORMAL',
    }),
  },

  'visit.reminder': {
    category: 'TASK',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 7200,
    render: (ctx) => ({
      title: 'Rappel : visite à venir',
      body: ctx.meta.eventTitle ? String(ctx.meta.eventTitle).slice(0, 120) : undefined,
      linkUrl: '/app/planning',
      priority: 'HIGH',
    }),
  },

  'visit.canceled': {
    category: 'TASK',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 300,
    render: (ctx) => ({
      title: 'Visite annulée',
      body: ctx.meta.eventTitle ? String(ctx.meta.eventTitle).slice(0, 120) : undefined,
      linkUrl: '/app/planning',
      priority: 'NORMAL',
    }),
  },

  // ─── LISTING ───────────────────────────────────────────
  'listing.submitted': {
    category: 'LISTING',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_ONLY,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'Nouvelle annonce soumise pour modération',
      priority: 'NORMAL',
    }),
  },

  'listing.approved': {
    category: 'LISTING',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: (ctx) => ({
      title: 'Annonce approuvée',
      linkUrl: ctx.meta.listingId ? `/app/crm/leads` : undefined,
      priority: 'NORMAL',
    }),
  },

  'listing.rejected': {
    category: 'LISTING',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: (ctx) => ({
      title: 'Annonce refusée',
      body: ctx.meta.reason ? String(ctx.meta.reason).slice(0, 200) : undefined,
      linkUrl: ctx.meta.listingId ? `/app/crm/leads` : undefined,
      priority: 'HIGH',
    }),
  },

  // ─── INBOX ─────────────────────────────────────────────
  'inbox.new.message': {
    category: 'INBOX',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 120,
    render: (ctx) => ({
      title: 'Nouveau message WhatsApp reçu',
      body: ctx.meta.displayName
        ? `De ${String(ctx.meta.displayName).slice(0, 60)}${ctx.meta.preview ? ': ' + String(ctx.meta.preview).slice(0, 80) : ''}`
        : ctx.meta.preview ? String(ctx.meta.preview).slice(0, 100) : undefined,
      linkUrl: ctx.meta.threadId ? `/app/inbox?threadId=${ctx.meta.threadId}` : '/app/inbox',
      priority: 'HIGH',
    }),
  },

  'inbox.sla.breached': {
    category: 'INBOX',
    defaultPriority: 'URGENT',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 3600,
    render: (ctx) => ({
      title: 'SLA dépassé — fil WhatsApp sans réponse',
      body: ctx.meta.displayName ? `Contact: ${String(ctx.meta.displayName).slice(0, 60)}` : undefined,
      linkUrl: ctx.meta.threadId ? `/app/inbox?threadId=${ctx.meta.threadId}` : '/app/inbox',
      priority: 'URGENT',
    }),
  },

  'inbox.thread.assigned': {
    category: 'INBOX',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 300,
    render: (ctx) => ({
      title: "Un fil WhatsApp t'a été assigné",
      body: ctx.meta.displayName ? `Contact: ${String(ctx.meta.displayName).slice(0, 60)}` : undefined,
      linkUrl: ctx.meta.threadId ? `/app/inbox?threadId=${ctx.meta.threadId}` : '/app/inbox',
      priority: 'HIGH',
    }),
  },

  // ─── BILLING ───────────────────────────────────────────
  'billing.past_due': {
    category: 'BILLING',
    defaultPriority: 'URGENT',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 86400,
    render: () => ({
      title: 'Paiement en retard',
      linkUrl: '/app/settings/billing',
      priority: 'URGENT',
    }),
  },

  'billing.quota_reached': {
    category: 'BILLING',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 86400,
    render: () => ({
      title: 'Quota atteint',
      linkUrl: '/app/settings/billing',
      priority: 'HIGH',
    }),
  },

  'billing.period_ending': {
    category: 'BILLING',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 86400,
    render: () => ({
      title: "Votre période d'abonnement se termine bientôt",
      linkUrl: '/app/settings/billing',
      priority: 'NORMAL',
    }),
  },

  // ─── ONBOARDING / KYC ─────────────────────────────────
  'payment.submitted': {
    category: 'KYC',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'Preuve de paiement soumise',
      linkUrl: '/app/onboarding',
      priority: 'NORMAL',
    }),
  },

  'payment.approved': {
    category: 'KYC',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'Paiement approuvé',
      linkUrl: '/app/onboarding',
      priority: 'NORMAL',
    }),
  },

  'kyc.submitted': {
    category: 'KYC',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'KYC soumis — en cours de vérification',
      linkUrl: '/app/onboarding',
      priority: 'NORMAL',
    }),
  },

  'kyc.verified': {
    category: 'KYC',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'KYC vérifié',
      linkUrl: '/app/onboarding',
      priority: 'NORMAL',
    }),
  },

  'kyc.approved': {
    category: 'KYC',
    defaultPriority: 'NORMAL',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'KYC approuvé',
      linkUrl: '/app/onboarding',
      priority: 'NORMAL',
    }),
  },

  'kyc.rejected': {
    category: 'KYC',
    defaultPriority: 'HIGH',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: (ctx) => ({
      title: 'KYC refusé',
      body: ctx.meta.reason ? String(ctx.meta.reason).slice(0, 200) : undefined,
      linkUrl: '/app/onboarding',
      priority: 'HIGH',
    }),
  },

  // ─── SYSTEM ────────────────────────────────────────────
  'system.maintenance': {
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    defaultChannels: IN_APP_ONLY,
    dedupeWindowSeconds: 86400,
    render: () => ({
      title: 'Maintenance planifiée',
      priority: 'LOW',
    }),
  },

  'security.suspiciousLogin': {
    category: 'SYSTEM',
    defaultPriority: 'URGENT',
    defaultChannels: IN_APP_EMAIL,
    dedupeWindowSeconds: 600,
    render: () => ({
      title: 'Connexion suspecte détectée',
      priority: 'URGENT',
    }),
  },
};

const MAX_TITLE = 120;
const MAX_BODY = 500;

export function renderTemplate(
  templateKey: string,
  ctx: TemplateContext,
): RenderedNotification | null {
  const def = TEMPLATE_REGISTRY[templateKey];
  if (!def) return null;

  const result = def.render(ctx);
  result.title = result.title.slice(0, MAX_TITLE);
  if (result.body) result.body = result.body.slice(0, MAX_BODY);
  if (!result.priority) result.priority = def.defaultPriority;
  return result;
}

export function getTemplateDefinition(key: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY[key];
}

export function isValidTemplateKey(key: string): boolean {
  return key in TEMPLATE_REGISTRY;
}
