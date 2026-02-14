'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import DPage from '@/components/ui/DPage';
import { DErrorState, DEmptyState } from '@/components/ui/DStates';
import { http, ApiError } from '@/lib/http';
import { useToast } from '@/components/ui/DToast';
import EventFormModal from './EventFormModal';

interface CalendarEvent {
  id: string;
  type: string;
  status: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  assigneeUserId: string;
  leadId: string | null;
  wilaya: string | null;
  commune: string | null;
  quartier: string | null;
  autoTaskId: string | null;
  recordStatus: string;
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  VISIT: 'Visite',
  SIGNING: 'Signature',
  CALL_SLOT: 'Appels',
  MEETING: 'RDV',
  OTHER: 'Autre',
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  VISIT: 'var(--brand-copper)',
  SIGNING: 'var(--success)',
  CALL_SLOT: 'var(--info)',
  MEETING: '#7C3AED',
  OTHER: 'var(--muted)',
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Planifié',
  COMPLETED: 'Terminé',
  CANCELED: 'Annulé',
  NO_SHOW: 'Absent',
};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 - 20:00

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

export default function PlanningPage() {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await http.get<{ items: CalendarEvent[] }>(`/planning/events?${params}`);
      setEvents(res.items);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, typeFilter, statusFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => addDays(w, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const handleCreate = () => { setEditingEvent(null); setModalOpen(true); };
  const handleEventClick = (ev: CalendarEvent) => { setEditingEvent(ev); setModalOpen(true); };
  const handleModalClose = (refresh?: boolean) => {
    setModalOpen(false);
    setEditingEvent(null);
    if (refresh) fetchEvents();
  };

  const getEventsForDayHour = (day: Date, hour: number) => {
    return events.filter((ev) => {
      const start = new Date(ev.startAt);
      const end = new Date(ev.endAt);
      const slotStart = new Date(day);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(day);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      return start < slotEnd && end > slotStart && ev.status !== 'CANCELED';
    });
  };

  const weekLabel = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${addDays(weekStart, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <DPage
      title="Planning"
      subtitle={weekLabel}
      actions={
        <Button
          variant="contained"
          onClick={handleCreate}
          sx={{
            textTransform: 'none',
            backgroundColor: 'var(--brand-copper)',
            '&:hover': { backgroundColor: 'var(--brand-copper-dark)' },
          }}
        >
          + Nouvel événement
        </Button>
      }
    >
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', mb: 'var(--space-16)', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 'var(--space-4)' }}>
          <IconButton size="small" onClick={prevWeek} sx={{ border: '1px solid var(--line)' }}>‹</IconButton>
          <Button size="small" variant="outlined" onClick={goToday} sx={{ textTransform: 'none', fontSize: '12px', borderColor: 'var(--line)', color: 'var(--text)' }}>
            Aujourd'hui
          </Button>
          <IconButton size="small" onClick={nextWeek} sx={{ border: '1px solid var(--line)' }}>›</IconButton>
        </Box>
        <Select size="small" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} displayEmpty sx={{ minWidth: 100, fontSize: '13px' }}>
          <MenuItem value="">Type</MenuItem>
          {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontSize: '13px' }}>{v}</MenuItem>)}
        </Select>
        <Select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} displayEmpty sx={{ minWidth: 100, fontSize: '13px' }}>
          <MenuItem value="">Statut</MenuItem>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontSize: '13px' }}>{v}</MenuItem>)}
        </Select>
      </Box>

      {error ? (
        <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: fetchEvents }} />
      ) : loading ? (
        <Box sx={{ display: 'flex', gap: 'var(--space-4)' }}>
          {weekDays.map((_, i) => <Skeleton key={i} variant="rectangular" width="14%" height={400} sx={{ borderRadius: 'var(--radius-md)' }} />)}
        </Box>
      ) : events.length === 0 && !typeFilter && !statusFilter ? (
        <DEmptyState title="Aucun événement" desc="Planifiez votre première visite ou rendez-vous." />
      ) : (
        /* Week Grid */
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', minWidth: 800 }}>
            {/* Header row */}
            <Box sx={{ borderBottom: '1px solid var(--line)', p: 'var(--space-4)' }} />
            {weekDays.map((day) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <Box
                  key={day.toISOString()}
                  sx={{
                    textAlign: 'center',
                    p: 'var(--space-4)',
                    borderBottom: '1px solid var(--line)',
                    borderLeft: '1px solid var(--line)',
                    backgroundColor: isToday ? 'rgba(216,162,74,0.06)' : 'transparent',
                  }}
                >
                  <Typography sx={{ fontSize: '12px', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--brand-copper)' : 'var(--text)' }}>
                    {formatDateShort(day)}
                  </Typography>
                </Box>
              );
            })}

            {/* Hour rows */}
            {HOURS.map((hour) => (
              <Box key={hour} sx={{ display: 'contents' }}>
                <Box sx={{ p: 'var(--space-4)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', pr: 'var(--space-8)' }}>
                  <Typography sx={{ fontSize: '11px', color: 'var(--muted-2)' }}>{formatHour(hour)}</Typography>
                </Box>
                {weekDays.map((day) => {
                  const slotEvents = getEventsForDayHour(day, hour);
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <Box
                      key={`${day.toISOString()}-${hour}`}
                      sx={{
                        borderBottom: '1px solid var(--line)',
                        borderLeft: '1px solid var(--line)',
                        minHeight: 48,
                        p: '2px',
                        backgroundColor: isToday ? 'rgba(216,162,74,0.03)' : 'transparent',
                        '&:hover': { backgroundColor: 'rgba(216,162,74,0.06)' },
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        if (slotEvents.length === 0) {
                          setEditingEvent(null);
                          setModalOpen(true);
                        }
                      }}
                    >
                      {slotEvents.map((ev) => (
                        <Box
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                          sx={{
                            backgroundColor: `${EVENT_TYPE_COLOR[ev.type] ?? 'var(--muted)'}15`,
                            borderLeft: `3px solid ${EVENT_TYPE_COLOR[ev.type] ?? 'var(--muted)'}`,
                            borderRadius: 'var(--radius-sm)',
                            p: '2px 4px',
                            mb: '1px',
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.85 },
                          }}
                        >
                          <Typography sx={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.title}
                          </Typography>
                          <Typography sx={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                            {new Date(ev.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {new Date(ev.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                          {ev.wilaya && (
                            <Typography sx={{ fontSize: '9px', color: 'var(--muted-2)' }}>{ev.wilaya}</Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <EventFormModal
        open={modalOpen}
        event={editingEvent}
        onClose={handleModalClose}
      />
    </DPage>
  );
}
