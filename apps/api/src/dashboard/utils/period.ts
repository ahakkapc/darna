import { AppError } from '../../common/errors/app-error';

const DEFAULT_TZ = 'Africa/Algiers';
const MAX_DAYS = 90;

export interface ResolvedPeriod {
  key: string;
  from: Date;
  to: Date;
  timezone: string;
  days: string[];
}

function toLocalDateKey(date: Date, tz: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz });
}

function startOfDayInTz(date: Date, tz: string): Date {
  const str = date.toLocaleDateString('en-CA', { timeZone: tz });
  const [y, m, d] = str.split('-').map(Number);
  const local = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const sample = new Date(local.getTime());
  const utcStr = sample.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = sample.toLocaleString('en-US', { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  const offset = utcDate.getTime() - tzDate.getTime();
  return new Date(local.getTime() + offset);
}

function addDaysDate(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function resolvePeriod(params: {
  period: string;
  from?: string;
  to?: string;
  timezone?: string;
}): ResolvedPeriod {
  const tz = params.timezone || DEFAULT_TZ;
  const now = new Date();
  let fromAt: Date;
  let toAt: Date;
  let key = params.period;

  switch (params.period) {
    case 'today': {
      fromAt = startOfDayInTz(now, tz);
      toAt = new Date(fromAt.getTime() + 24 * 60 * 60 * 1000);
      break;
    }
    case 'week': {
      const todayStart = startOfDayInTz(now, tz);
      const dayOfWeek = new Date(
        todayStart.toLocaleString('en-US', { timeZone: tz }),
      ).getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      fromAt = new Date(todayStart.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
      toAt = new Date(fromAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case 'month': {
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
      const [y, m] = todayStr.split('-').map(Number);
      fromAt = startOfDayInTz(new Date(y, m - 1, 1), tz);
      const nextMonth = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
      toAt = startOfDayInTz(nextMonth, tz);
      break;
    }
    case 'custom': {
      if (!params.from || !params.to) {
        throw new AppError('VALIDATION_ERROR', 400, 'from and to required for custom period');
      }
      fromAt = new Date(params.from);
      toAt = new Date(params.to);
      if (isNaN(fromAt.getTime()) || isNaN(toAt.getTime())) {
        throw new AppError('VALIDATION_ERROR', 400, 'Invalid date format');
      }
      if (fromAt >= toAt) {
        throw new AppError('VALIDATION_ERROR', 400, 'from must be before to');
      }
      break;
    }
    default:
      throw new AppError('VALIDATION_ERROR', 400, `Invalid period: ${params.period}`);
  }

  const diffDays = Math.ceil((toAt.getTime() - fromAt.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > MAX_DAYS) {
    throw new AppError('PERIOD_TOO_LARGE', 400, `Period cannot exceed ${MAX_DAYS} days`);
  }

  const days: string[] = [];
  let cursor = new Date(fromAt);
  while (cursor < toAt) {
    days.push(toLocalDateKey(cursor, tz));
    cursor = addDaysDate(cursor, 1);
  }

  return { key, from: fromAt, to: toAt, timezone: tz, days };
}

export function bucketByDay<T>(
  rows: T[],
  dateExtractor: (row: T) => Date | string | null,
  tz: string,
  days: string[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const day of days) map.set(day, []);

  for (const row of rows) {
    const raw = dateExtractor(row);
    if (!raw) continue;
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    const key = toLocalDateKey(d, tz);
    const arr = map.get(key);
    if (arr) arr.push(row);
  }

  return map;
}

export { toLocalDateKey };
