'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { http } from '@/lib/http';

const BASE_INTERVAL = 15_000;
const MAX_INTERVAL = 60_000;

export function useNotificationsPolling() {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(BASE_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(true);

  const fetchCount = useCallback(async () => {
    try {
      const res = await http.get<{ count: number }>('/notifications/unread-count');
      setUnreadCount(res.count);
      intervalRef.current = BASE_INTERVAL;
    } catch {
      intervalRef.current = Math.min(intervalRef.current * 2, MAX_INTERVAL);
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!visibleRef.current) return;
    timerRef.current = setTimeout(async () => {
      await fetchCount();
      scheduleNext();
    }, intervalRef.current);
  }, [fetchCount]);

  useEffect(() => {
    fetchCount().then(scheduleNext);

    const onVisibility = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (visibleRef.current) {
        fetchCount().then(scheduleNext);
      } else if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const onFocus = () => {
      fetchCount().then(scheduleNext);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchCount, scheduleNext]);

  return { unreadCount, refresh: fetchCount };
}
