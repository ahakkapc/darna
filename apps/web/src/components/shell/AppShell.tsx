'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED } from './Sidebar';
import Topbar from './Topbar';

interface AppShellProps {
  children: React.ReactNode;
  topbarRight?: React.ReactNode;
}

export default function AppShell({ children, topbarRight }: AppShellProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery('(min-width:1024px)');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-0)' }}>
      {/* Desktop sidebar */}
      {isDesktop && (
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      )}

      {/* Mobile drawer */}
      {!isDesktop && (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              backgroundColor: 'var(--bg-1)',
              borderRight: '1px solid var(--line)',
            },
          }}
        >
          <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
        </Drawer>
      )}

      {/* Main area */}
      <Box
        component="main"
        sx={{
          flex: 1,
          ml: isDesktop ? `${sidebarWidth}px` : 0,
          transition: 'margin-left 0.2s',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          showMenu={!isDesktop}
        >
          {topbarRight}
        </Topbar>
        <Box sx={{ flex: 1 }}>{children}</Box>
      </Box>
    </Box>
  );
}
