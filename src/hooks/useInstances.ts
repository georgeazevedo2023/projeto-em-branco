import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Instance } from '@/types';

export interface UseInstancesOptions {
  enabled?: boolean;
  excludeDisabled?: boolean;
}

export function useInstances(options: UseInstancesOptions = {}) {
  const { enabled = true, excludeDisabled = true } = options;

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInstances = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('instances')
        .select('id, name, status, profile_pic_url, disabled, token, user_id, owner_jid, created_at, updated_at')
        .order('name');
      if (excludeDisabled) {
        query = query.eq('disabled', false);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      setInstances(data || []);
    } catch (err) {
      console.error('useInstances error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [enabled, excludeDisabled]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  useEffect(() => {
    const handler = () => fetchInstances();
    window.addEventListener('instances-updated', handler);
    return () => window.removeEventListener('instances-updated', handler);
  }, [fetchInstances]);

  return { instances, loading, error, refetch: fetchInstances };
}
