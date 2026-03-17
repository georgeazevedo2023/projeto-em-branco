import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Instance } from '@/types';

export interface UseInstancesOptions {
  enabled?: boolean;
  excludeDisabled?: boolean;
  select?: string;
}

export function useInstances(options: UseInstancesOptions = {}) {
  const {
    enabled = true,
    excludeDisabled = true,
    select = 'id, name, status, profile_pic_url',
  } = options;

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInstances = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('instances').select(select).order('name');
      if (excludeDisabled) {
        query = query.eq('disabled', false);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      setInstances((data as Instance[]) || []);
    } catch (err) {
      console.error('useInstances error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [enabled, excludeDisabled, select]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Listen for cross-component updates
  useEffect(() => {
    const handler = () => fetchInstances();
    window.addEventListener('instances-updated', handler);
    return () => window.removeEventListener('instances-updated', handler);
  }, [fetchInstances]);

  return { instances, loading, error, refetch: fetchInstances };
}
