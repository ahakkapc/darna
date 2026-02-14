'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { Bell, CheckCircle, Envelope, ShoppingCart, Users, ShieldCheck, Gear, ChatDots, Trash } from '@phosphor-icons/react';
import { http, ApiError } from '@/lib/http';
import { DErrorState, DEmptyState } from '@/components/ui/DStates';
import DCursorLoadMore from '@/components/ui/DCursorLoadMore';
import { useNotificationsPolling } from '@/hooks/useNotificationsPolling';

interface Notification {
  id: string;
  title: string;
  body: string;
  category: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: Notification[];
  page: { hasMore: boolean; nextCursor?: string };
}

const CATEGORIES = [
  { value: '', label: 'Toutes' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'TASK', label: 'Tâche' },
  { value: 'INBOX', label: 'Inbox' },
  { value: 'BILLING', label: 'Facturation' },
  { value: 'KYC', label: 'KYC' },
  { value: 'SYSTEM', label: 'Système' },
];

function categoryIcon(cat: string) {
  const size = 20;
  const weight = 'duotone' as const;
  switch (cat) {
    case 'LEAD': return <Users size={size} weight={weight} />;
    case 'TASK': return <CheckCircle size={size} weight={weight} />;
    case 'INBOX': return <ChatDots size={size} weight={weight} />;
    case 'BILLING': return <ShoppingCart size={size} weight={weight} />;
    case 'KYC': return <ShieldCheck size={size} weight={weight} />;
    default: return <Gear size={size} weight={weight} />;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

export default function NotificationBell() {
  const router = useRouter();
  const { unreadCount, refresh: refreshCount } = useNotificationsPolling();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [category, setCategory] = useState('');

  const fetchList = useCallback(async (resetCursor?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '15');
      if (filter === 'unread') params.set('unreadOnly', 'true');
      if (category) params.set('category', category);
      if (!resetCursor && cursor) params.set('cursor', cursor);
      const res = await http.get<ListResponse>(`/notifications?${params}`);
      if (resetCursor) {
        setItems(res.items);
      } else {
        setItems((prev) => [...prev, ...res.items]);
      }
      setCursor(res.page.nextCursor);
      setHasMore(res.page.hasMore);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [filter, category, cursor]);

  useEffect(() => {
    if (open) {
      setCursor(undefined);
      fetchList(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, category]);

  const markRead = async (id: string) => {
    try {
      await http.post(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      refreshCount();
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await http.post('/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      refreshCount();
    } catch { /* silent */ }
  };

  const deleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await http.delete(`/notifications/${id}`);
      setItems((prev) => prev.filter((n) => n.id !== id));
      refreshCount();
    } catch { /* silent */ }
  };

  const handleItemClick = (n: Notification) => {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
    if (n.linkUrl) router.push(n.linkUrl);
  };

  return (
    <>
      <IconButton onClick={() => setOpen(true)} sx={{ color: 'var(--muted)' }}>
        <Badge
          badgeContent={unreadCount}
          color="error"
          max={99}
          sx={{ '& .MuiBadge-badge': { fontSize: '10px', minWidth: 18, height: 18 } }}
        >
          <Bell size={22} weight="duotone" />
        </Badge>
      </IconButton>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 420 },
            borderRadius: 0,
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ p: 'var(--space-16)', borderBottom: '1px solid var(--line)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 'var(--space-12)' }}>
              <Typography variant="h2">Notifications</Typography>
              <Box sx={{ display: 'flex', gap: 'var(--space-8)' }}>
                <Button size="small" onClick={markAllRead} sx={{ color: 'var(--brand-copper)', fontSize: '12px' }}>
                  Tout lire
                </Button>
                <Button size="small" onClick={() => { setOpen(false); router.push('/app/notifications'); }} sx={{ color: 'var(--muted)', fontSize: '12px' }}>
                  Voir tout
                </Button>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center', flexWrap: 'wrap' }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={filter}
                onChange={(_, v) => { if (v) setFilter(v); }}
                sx={{
                  '& .MuiToggleButton-root': {
                    fontSize: '12px',
                    textTransform: 'none',
                    px: 'var(--space-12)',
                    color: 'var(--muted)',
                    borderColor: 'var(--line)',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(216,162,74,0.10)',
                      color: 'var(--brand-copper)',
                      borderColor: 'rgba(216,162,74,0.25)',
                    },
                  },
                }}
              >
                <ToggleButton value="unread">Non lues</ToggleButton>
                <ToggleButton value="all">Toutes</ToggleButton>
              </ToggleButtonGroup>
              <Select
                size="small"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                displayEmpty
                sx={{ fontSize: '12px', minWidth: 100, '& .MuiSelect-select': { py: '6px' } }}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c.value} value={c.value} sx={{ fontSize: '12px' }}>
                    {c.label}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          </Box>

          {/* List */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {error ? (
              <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: () => fetchList(true) }} />
            ) : loading && items.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-32)' }}>
                <CircularProgress size={24} />
              </Box>
            ) : items.length === 0 ? (
              <DEmptyState
                title={filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
                desc="Vous êtes à jour."
              />
            ) : (
              <>
                {items.map((n) => (
                  <Box key={n.id}>
                    <Box
                      onClick={() => handleItemClick(n)}
                      sx={{
                        display: 'flex',
                        gap: 'var(--space-12)',
                        p: 'var(--space-16)',
                        cursor: 'pointer',
                        position: 'relative',
                        '&:hover': { backgroundColor: 'rgba(216,162,74,0.04)' },
                        '&:hover .notif-delete': { opacity: 1 },
                      }}
                    >
                      <Box sx={{ color: 'var(--muted)', mt: '2px', flexShrink: 0 }}>
                        {categoryIcon(n.category)}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
                          {!n.readAt && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: 'var(--brand-copper)',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Typography
                            sx={{
                              fontWeight: n.readAt ? 400 : 600,
                              fontSize: '13px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {n.title}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            color: 'var(--muted)',
                            fontSize: '12px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.body}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                        <Typography sx={{ color: 'var(--muted-2)', fontSize: '11px' }}>
                          {timeAgo(n.createdAt)}
                        </Typography>
                        <IconButton
                          className="notif-delete"
                          size="small"
                          onClick={(e) => deleteNotif(n.id, e)}
                          sx={{ opacity: 0, transition: 'opacity 0.15s', p: '2px', color: 'var(--muted)' }}
                        >
                          <Trash size={14} />
                        </IconButton>
                      </Box>
                    </Box>
                    <Divider />
                  </Box>
                ))}
                <DCursorLoadMore hasMore={hasMore} loading={loading} onLoadMore={() => fetchList()} />
              </>
            )}
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
