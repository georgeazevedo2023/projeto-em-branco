import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Inbox } from '@/types';

export interface UseInboxesOptions {
  enabled?: boolean;
  select?: string;
}

export function useInboxes(options: UseInboxesOptions = {}) {
  const {
    enabled = true,
    select = 'id, name, instance_id',
  } = options;

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInboxes = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('inboxes')
        .select(select)
        .order('name');
      if (err) throw err;
      setInboxes((data as Inbox[]) || []);
    } catch (err) {
      console.error('useInboxes error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [enabled, select]);

  useEffect(() => {
    fetchInboxes();
  }, [fetchInboxes]);

  return { inboxes, loading, error, refetch: fetchInboxes };
}
