'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import {
  Users,
  CheckSquare,
  Bell,
  Swatches,
  CaretLeft,
  CaretRight,
  ChartBar,
  CalendarBlank,
  FacebookLogo,
  Tray,
  ChatCircle,
  Envelope,
  ListBullets,
} from '@phosphor-icons/react';

const NAV_SECTIONS = [
  {
    label: 'Dashboard',
    items: [
      { label: 'Tableau de bord', href: '/app/dashboard', icon: ChartBar },
    ],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Leads', href: '/app/crm/leads', icon: Users },
      { label: 'Tasks', href: '/app/crm/tasks', icon: CheckSquare },
      { label: 'Planning', href: '/app/planning', icon: CalendarBlank },
      { label: 'Inbox WhatsApp', href: '/app/inbox', icon: ChatCircle },
    ],
  },
  {
    label: 'Notifications',
    items: [
      { label: 'Centre', href: '/app/notifications', icon: Bell },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Préférences notifs', href: '/app/settings/notifications', icon: Bell },
      { label: 'Templates', href: '/app/settings/templates', icon: Envelope },
      { label: 'Séquences', href: '/app/settings/sequences', icon: ListBullets },
      { label: 'Meta Lead Ads', href: '/app/settings/meta-leadgen/sources', icon: FacebookLogo },
      { label: 'Inbox Meta', href: '/app/settings/meta-leadgen/inbox', icon: Tray },
    ],
  },
  {
    label: 'Dev',
    items: [
      { label: 'UI Kit', href: '/app/ui-kit', icon: Swatches },
    ],
  },
];

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED = 84;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box
      component="nav"
      sx={{
        width,
        minWidth: width,
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-1)',
        borderRight: '1px solid var(--line)',
        transition: 'width 0.2s, min-width 0.2s',
        zIndex: 1200,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          px: 'var(--space-24)',
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: collapsed ? '16px' : '20px',
            background: 'var(--grad-brand)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            whiteSpace: 'nowrap',
          }}
        >
          {collapsed ? 'D' : 'Darna'}
        </Typography>
      </Box>

      <Divider />

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 'var(--space-8)' }}>
        {NAV_SECTIONS.map((section) => (
          <Box key={section.label} sx={{ mb: 'var(--space-8)' }}>
            {!collapsed && (
              <Typography
                sx={{
                  px: 'var(--space-24)',
                  py: 'var(--space-4)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--muted-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {section.label}
              </Typography>
            )}
            <List disablePadding>
              {section.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <ListItemButton
                    key={item.href}
                    component={Link}
                    href={item.href}
                    sx={{
                      mx: 'var(--space-8)',
                      borderRadius: 'var(--radius-input)',
                      mb: '2px',
                      minHeight: 40,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      px: collapsed ? 'var(--space-12)' : 'var(--space-16)',
                      backgroundColor: active ? 'rgba(216,162,74,0.10)' : 'transparent',
                      '&:hover': { backgroundColor: 'rgba(216,162,74,0.06)' },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: collapsed ? 0 : 36,
                        color: active ? 'var(--brand-copper)' : 'var(--muted)',
                      }}
                    >
                      <Icon size={20} weight="duotone" />
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontSize: '14px',
                          fontWeight: active ? 600 : 400,
                          color: active ? 'var(--text)' : 'var(--muted)',
                        }}
                      />
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Divider />

      {/* Collapse toggle */}
      <Box sx={{ p: 'var(--space-8)', display: 'flex', justifyContent: 'center' }}>
        <IconButton onClick={onToggle} size="small" sx={{ color: 'var(--muted)' }}>
          {collapsed ? <CaretRight size={18} /> : <CaretLeft size={18} />}
        </IconButton>
      </Box>
    </Box>
  );
}

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED };
