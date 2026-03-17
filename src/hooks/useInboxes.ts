import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UseInboxesOptions {
  enabled?: boolean;
}

export function useInboxes(options: UseInboxesOptions = {}) {
  const { enabled = true } = options;

  const [inboxes, setInboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInboxes = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('inboxes')
        .select('id, name, instance_id')
        .order('name');
      if (err) throw err;
      setInboxes(data || []);
    } catch (err) {
      console.error('useInboxes error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchInboxes();
  }, [fetchInboxes]);

  return { inboxes, loading, error, refetch: fetchInboxes };
}
