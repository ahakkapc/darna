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
import EventFormModal from '../EventFormModal';

interface CalendarEvent {
  id: string;
  type: string;
  status: string;
  title: string;
  startAt: string;
  endAt: string;
  assigneeUserId: string;
  leadId: string | null;
  wilaya: string | null;
  commune: string | null;
  quartier: string | null;
  autoTaskId: string | null;
  recordStatus: string;
}

interface OrgMember {
  userId: string;
  name: string;
  role: string;
}

const EVENT_TYPE_COLOR: Record<string, string> = {
  VISIT: 'var(--brand-copper)',
  SIGNING: 'var(--success)',
  CALL_SLOT: 'var(--info)',
  MEETING: '#7C3AED',
  OTHER: 'var(--muted)',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  VISIT: 'Visite',
  SIGNING: 'Signature',
  CALL_SLOT: 'Appels',
  MEETING: 'RDV',
  OTHER: 'Autre',
};

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
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

export default function TeamPlanningPage() {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      const [evRes, meRes] = await Promise.all([
        http.get<{ items: CalendarEvent[] }>(`/planning/events?${params}`),
        http.get<{ user: { id: string }; orgs: { orgId: string; name: string; role: string }[] }>('/auth/me'),
      ]);
      setEvents(evRes.items);

      // Build unique members from events
      const memberMap = new Map<string, OrgMember>();
      for (const ev of evRes.items) {
        if (!memberMap.has(ev.assigneeUserId)) {
          memberMap.set(ev.assigneeUserId, { userId: ev.assigneeUserId, name: ev.assigneeUserId.substring(0, 8), role: '' });
        }
      }
      if (!memberMap.has(meRes.user.id)) {
        memberMap.set(meRes.user.id, { userId: meRes.user.id, name: 'Moi', role: '' });
      }
      setMembers(Array.from(memberMap.values()));
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => addDays(w, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const handleEventClick = (ev: CalendarEvent) => { setEditingEvent(ev); setModalOpen(true); };
  const handleModalClose = (refresh?: boolean) => {
    setModalOpen(false);
    setEditingEvent(null);
    if (refresh) fetchData();
  };

  const getEventsForMemberDay = (userId: string, day: Date) => {
    return events.filter((ev) => {
      if (ev.assigneeUserId !== userId) return false;
      if (ev.status === 'CANCELED') return false;
      const start = new Date(ev.startAt);
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      return start >= dayStart && start <= dayEnd;
    });
  };

  const weekLabel = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${addDays(weekStart, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <DPage title="Planning équipe" subtitle={weekLabel}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', mb: 'var(--space-16)' }}>
        <IconButton size="small" onClick={prevWeek} sx={{ border: '1px solid var(--line)' }}>‹</IconButton>
        <Button size="small" variant="outlined" onClick={goToday} sx={{ textTransform: 'none', fontSize: '12px', borderColor: 'var(--line)', color: 'var(--text)' }}>
          Aujourd'hui
        </Button>
        <IconButton size="small" onClick={nextWeek} sx={{ border: '1px solid var(--line)' }}>›</IconButton>
      </Box>

      {error ? (
        <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: fetchData }} />
      ) : loading ? (
        <Skeleton variant="rectangular" width="100%" height={300} sx={{ borderRadius: 'var(--radius-md)' }} />
      ) : members.length === 0 ? (
        <DEmptyState title="Aucun membre" desc="Aucun événement à afficher." />
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: `140px repeat(7, 1fr)`, minWidth: 800, border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ p: 'var(--space-8)', backgroundColor: 'var(--surface-1)', borderBottom: '1px solid var(--line)' }}>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>Membre</Typography>
            </Box>
            {weekDays.map((day) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <Box key={day.toISOString()} sx={{ p: 'var(--space-8)', textAlign: 'center', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)', backgroundColor: isToday ? 'rgba(216,162,74,0.06)' : 'var(--surface-1)' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--brand-copper)' : 'var(--text)' }}>
                    {formatDateShort(day)}
                  </Typography>
                </Box>
              );
            })}

            {/* Member rows */}
            {members.map((member) => (
              <Box key={member.userId} sx={{ display: 'contents' }}>
                <Box sx={{ p: 'var(--space-8)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                    {member.name}
                  </Typography>
                </Box>
                {weekDays.map((day) => {
                  const dayEvents = getEventsForMemberDay(member.userId, day);
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <Box
                      key={`${member.userId}-${day.toISOString()}`}
                      sx={{
                        p: '4px',
                        borderBottom: '1px solid var(--line)',
                        borderLeft: '1px solid var(--line)',
                        minHeight: 48,
                        backgroundColor: isToday ? 'rgba(216,162,74,0.03)' : 'transparent',
                      }}
                    >
                      {dayEvents.map((ev) => (
                        <Box
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          sx={{
                            backgroundColor: `${EVENT_TYPE_COLOR[ev.type] ?? 'var(--muted)'}15`,
                            borderLeft: `3px solid ${EVENT_TYPE_COLOR[ev.type] ?? 'var(--muted)'}`,
                            borderRadius: 'var(--radius-sm)',
                            p: '2px 4px',
                            mb: '2px',
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.85 },
                          }}
                        >
                          <Typography sx={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.title}
                          </Typography>
                          <Typography sx={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                            {new Date(ev.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
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

      <EventFormModal open={modalOpen} event={editingEvent} onClose={handleModalClose} />
    </DPage>
  );
}
