import { http } from './http';

export interface PeriodInfo {
  key: string;
  from: string;
  to: string;
  timezone: string;
}

export interface OverviewKpis {
  leadsNew: number;
  leadsWon: number;
  leadsLost: number;
  visitsScheduled: number;
  tasksOverdue: number;
  activitiesPerDay: number;
  callsLogged: number;
  listingsPublished: number;
}

export interface BreakdownItem {
  key: string;
  count: number;
}

export interface SeriesPoint {
  date: string;
  count: number;
}

export interface OverviewData {
  period: PeriodInfo;
  kpis: OverviewKpis;
  breakdowns: {
    byStatus: BreakdownItem[];
    bySource: BreakdownItem[];
  };
  series: {
    leadsPerDay: SeriesPoint[];
    activitiesPerDay: SeriesPoint[];
  };
}

export interface CollaboratorKpis {
  leadsOwned: number;
  leadsWon: number;
  leadsLost: number;
  tasksOverdue: number;
  activitiesCount: number;
}

export interface CollaboratorItem {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  kpis: CollaboratorKpis;
}

export interface CollaboratorsData {
  period: PeriodInfo;
  items: CollaboratorItem[];
}

export interface FunnelStep {
  step: string;
  count: number;
}

export interface PipelineData {
  period: PeriodInfo;
  funnel: FunnelStep[];
  rates: {
    leadToVisit: number;
    visitToWon: number;
    leadToWon: number;
  };
}

export interface FocusLead {
  id: string;
  fullName: string;
  status: string;
  ownerUserId: string | null;
  updatedAt: string;
}

export interface FocusVisit {
  id: string;
  title: string;
  startAt: string;
  leadId: string | null;
  assigneeUserId: string;
}

export interface FocusListing {
  id: string;
  title: string;
  status: string;
}

export interface FocusData {
  needsFollowUpLeads: FocusLead[];
  upcomingVisits: FocusVisit[];
  readyToPublishListings: FocusListing[];
}

type Scope = 'me' | 'org' | 'user';
type Period = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export interface DashboardQuery {
  period?: Period;
  scope?: Scope;
  userId?: string;
  from?: string;
  to?: string;
  tz?: string;
}

function buildQs(q: DashboardQuery): string {
  const params = new URLSearchParams();
  if (q.period) params.set('period', q.period);
  if (q.scope) params.set('scope', q.scope);
  if (q.userId) params.set('userId', q.userId);
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.tz) params.set('tz', q.tz);
  return params.toString();
}

export const dashboardApi = {
  overview: (q: DashboardQuery) =>
    http.get<OverviewData>(`/dashboard/overview?${buildQs(q)}`),

  collaborators: (q: DashboardQuery) =>
    http.get<CollaboratorsData>(`/dashboard/collaborators?${buildQs(q)}`),

  pipeline: (q: DashboardQuery) =>
    http.get<PipelineData>(`/dashboard/pipeline?${buildQs(q)}`),

  focus: (q: DashboardQuery) =>
    http.get<FocusData>(`/dashboard/focus?${buildQs(q)}`),

  exportCsvUrl: (q: DashboardQuery) =>
    `/api/dashboard/exports/leads.csv?${buildQs(q)}`,
};
