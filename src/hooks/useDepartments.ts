import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DepartmentData {
  id: string;
  name: string;
  inbox_id: string;
}

interface UseDepartmentsOptions {
  /** Skip fetch when false. Default: true */
  enabled?: boolean;
  /** Filter by a single inbox ID */
  inboxId?: string;
  /** Filter by multiple inbox IDs (for grouped dropdown) */
  inboxIds?: string[];
}

export function useDepartments(options: UseDepartmentsOptions = {}) {
  const { enabled = true, inboxId, inboxIds } = options;
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stabilize inboxIds for dependency comparison
  const inboxIdsKey = inboxIds ? JSON.stringify(inboxIds.sort()) : null;

  const fetchDepartments = useCallback(async () => {
    if (!enabled) return;

    // Determine filter
    const ids = inboxId ? [inboxId] : inboxIds;
    if (!ids || ids.length === 0) {
      setDepartments([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('departments')
        .select('id, name, inbox_id')
        .order('name');

      if (ids.length === 1) {
        query = query.eq('inbox_id', ids[0]);
      } else {
        query = query.in('inbox_id', ids);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setDepartments((data as DepartmentData[]) || []);
    } catch (err) {
      console.error('[useDepartments] error:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, inboxId, inboxIdsKey]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  /** Departments grouped by inbox_id */
  const departmentsByInbox = useMemo(() => {
    const map: Record<string, DepartmentData[]> = {};
    departments.forEach(d => {
      if (!map[d.inbox_id]) map[d.inbox_id] = [];
      map[d.inbox_id].push(d);
    });
    return map;
  }, [departments]);

  return { departments, departmentsByInbox, loading, error, refetch: fetchDepartments };
}
