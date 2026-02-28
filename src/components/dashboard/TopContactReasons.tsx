import { memo, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, TrendingUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TopReasonsChartProps {
  instanceId?: string | null;
  inboxId?: string | null;
  periodDays?: number;
}

interface ReasonItem {
  reason: string;
  count: number;
}

interface InboxReasons {
  inboxId: string;
  inboxName: string;
  reasons: ReasonItem[];
  total: number;
}

const COLORS = [
  'hsl(142 70% 45%)',
  'hsl(217 91% 60%)',
  'hsl(262 80% 55%)',
  'hsl(38 92% 50%)',
  'hsl(0 72% 51%)',
  'hsl(186 64% 42%)',
  'hsl(330 70% 50%)',
  'hsl(160 60% 40%)',
];

// Normalize reason text for grouping (lowercase, trim, remove trailing punctuation)
function normalizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');
}

const TopContactReasons = ({ instanceId, inboxId, periodDays = 30 }: TopReasonsChartProps) => {
  const [loading, setLoading] = useState(true);
  const [inboxReasons, setInboxReasons] = useState<InboxReasons[]>([]);

  useEffect(() => {
    const fetchReasons = async () => {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - periodDays);

        // Build query for conversations with ai_summary
        let query = supabase
          .from('conversations')
          .select('ai_summary, inbox_id, inboxes(name, instance_id)')
          .not('ai_summary', 'is', null)
          .gte('created_at', since.toISOString())
          .limit(500);

        if (inboxId) {
          query = query.eq('inbox_id', inboxId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
          setInboxReasons([]);
          setLoading(false);
          return;
        }

        // Filter by instance if needed
        let filtered = data;
        if (instanceId) {
          filtered = data.filter((c: any) => c.inboxes?.instance_id === instanceId);
        }

        // Group reasons by inbox
        const inboxMap = new Map<string, { name: string; reasons: Map<string, number>; total: number }>();

        filtered.forEach((conv: any) => {
          const summary = conv.ai_summary as any;
          const reason = summary?.reason;
          if (!reason || typeof reason !== 'string') return;

          const ibId = conv.inbox_id;
          const ibName = conv.inboxes?.name || 'Sem caixa';

          if (!inboxMap.has(ibId)) {
            inboxMap.set(ibId, { name: ibName, reasons: new Map(), total: 0 });
          }

          const entry = inboxMap.get(ibId)!;
          const normalized = normalizeReason(reason);
          entry.reasons.set(normalized, (entry.reasons.get(normalized) || 0) + 1);
          entry.total++;
        });

        // Convert to sorted arrays, keep top 5 reasons per inbox
        const result: InboxReasons[] = Array.from(inboxMap.entries())
          .map(([id, val]) => ({
            inboxId: id,
            inboxName: val.name,
            total: val.total,
            reasons: Array.from(val.reasons.entries())
              .map(([reason, count]) => ({ reason, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 6),
          }))
          .sort((a, b) => b.total - a.total);

        setInboxReasons(result);
      } catch (err) {
        console.error('Error fetching contact reasons:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReasons();
  }, [instanceId, inboxId, periodDays]);

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-[240px] rounded-xl" />
        <Skeleton className="h-[240px] rounded-xl" />
      </div>
    );
  }

  if (inboxReasons.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum motivo de contato identificado</p>
          <p className="text-xs mt-1">Conversas precisam de resumo IA para gerar motivos</p>
        </CardContent>
      </Card>
    );
  }

  // If only one inbox or filtered, show flat view
  const showFlat = inboxReasons.length === 1 || inboxId;

  if (showFlat) {
    const allReasons = inboxReasons.flatMap(ir => ir.reasons);
    // Merge duplicates across inboxes
    const merged = new Map<string, number>();
    allReasons.forEach(r => merged.set(r.reason, (merged.get(r.reason) || 0) + r.count));
    const sorted = Array.from(merged.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const maxCount = sorted[0]?.count || 1;

    return (
      <Card className="glass-card-hover">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Principais Motivos de Contato
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Últimos {periodDays} dias · Baseado em resumos IA
          </p>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4 space-y-2">
          {sorted.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs truncate max-w-[75%] capitalize">{item.reason}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{item.count}x</Badge>
              </div>
              <div className="w-full bg-muted/50 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${(item.count / maxCount) * 100}%`,
                    backgroundColor: COLORS[idx % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Multiple inboxes - show collapsible per inbox
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {inboxReasons.map((ir) => {
        const maxCount = ir.reasons[0]?.count || 1;
        return (
          <Card key={ir.inboxId} className="glass-card-hover">
            <CardHeader className="pb-2 px-4 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-primary" />
                  {ir.inboxName}
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {ir.total} conversas
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-1.5">
              {ir.reasons.slice(0, 5).map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] truncate max-w-[70%] capitalize">{item.reason}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">{item.count}x</span>
                  </div>
                  <div className="w-full bg-muted/50 rounded-full h-1">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${(item.count / maxCount) * 100}%`,
                        backgroundColor: COLORS[idx % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default memo(TopContactReasons);
