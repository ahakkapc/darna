'use client';

import AppShell from '@/components/shell/AppShell';
import NotificationBell from '@/components/shell/NotificationBell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell topbarRight={<NotificationBell />}>
      {children}
    </AppShell>
  );
}
