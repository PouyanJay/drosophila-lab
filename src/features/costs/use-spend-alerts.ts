'use client';
import { useCallback, useEffect, useState } from 'react';
import type { SpendAlert } from '@/lib/contracts/costs';
/** Unacknowledged spend alerts: loaded on mount and appended when a reply reports new ones. */
export function useSpendAlerts() {
  const [alerts, setAlerts] = useState<SpendAlert[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/costs/alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { alerts?: SpendAlert[] } | null) => {
        if (active && d?.alerts) setAlerts(d.alerts.filter((a) => !a.acknowledgedAt));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const push = useCallback((incoming: SpendAlert[] | undefined) => {
    if (!incoming?.length) return;
    setAlerts((current) => {
      const ids = new Set(current.map((a) => a.id));
      return [...incoming.filter((a) => !ids.has(a.id)), ...current];
    });
  }, []);
  const acknowledge = useCallback(async (id: number) => {
    setAlerts((current) => current.filter((a) => a.id !== id));
    try {
      await fetch('/api/costs/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      // The alert stays acknowledged locally; it reappears on reload if the save failed.
    }
  }, []);
  return { alerts, push, acknowledge };
}
