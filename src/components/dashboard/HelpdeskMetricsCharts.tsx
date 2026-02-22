import { useEffect, useState, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Clock } from 'lucide-react';

interface IAResponseData {
  inbox_name: string;
  inbox_id: string;
  avg_seconds: number;
  msg_count: number;
}

interface AgentGroup {
  inbox_name: string;
  agents: { name: string; minutes: number; count: number }[];
}

const COLORS = [
  'hsl(142 70% 45%)',
  'hsl(217 91% 60%)',
  'hsl(262 80% 55%)',
  'hsl(38 92% 50%)',
  'hsl(0 72% 51%)',
  'hsl(186 64% 42%)',
];

const formatSeconds = (secs: number) => {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
};

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const HelpdeskMetricsCharts = () => {
  const [iaData, setIaData] = useState<IAResponseData[]>([]);
  const [agentData, setAgentData] = useState<AgentGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      // Fetch conversations with IA activated + their messages, and all convs for agent times
      const [iaConvsRes, agentRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('id, inbox_id, inboxes(name), conversation_messages(created_at, direction)')
          .eq('status_ia', 'ligada'),
        supabase
          .from('conversations')
          .select(`
            inbox_id,
            assigned_to,
            inboxes(name),
            conversation_messages(created_at, direction, sender_id)
          `)
          .neq('status', 'deleted')
          .not('assigned_to', 'is', null),
      ]);

      // --- IA response time in seconds ---
      if (iaConvsRes.data) {
        const inboxSecMap = new Map<string, { name: string; secs: number[]; }>();

        iaConvsRes.data.forEach((conv: any) => {
          const msgs: { created_at: string; direction: string }[] = conv.conversation_messages || [];
          const sorted = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          // For each incoming message, find the next outgoing message
          sorted.forEach((msg, idx) => {
            if (msg.direction !== 'incoming') return;
            const inTime = new Date(msg.created_at).getTime();
            const nextOut = sorted.slice(idx + 1).find(m => m.direction === 'outgoing');
            if (!nextOut) return;
            const outTime = new Date(nextOut.created_at).getTime();
            const diffSecs = (outTime - inTime) / 1000;
            if (diffSecs <= 0 || diffSecs >= 3600) return; // ignore > 1h or negative

            const key = conv.inbox_id;
            const name = conv.inboxes?.name || conv.inbox_id;
            const existing = inboxSecMap.get(key) || { name, secs: [] };
            existing.secs.push(diffSecs);
            inboxSecMap.set(key, existing);
          });
        });

        const iaResponseData: IAResponseData[] = Array.from(inboxSecMap.entries())
          .map(([id, val]) => ({
            inbox_id: id,
            inbox_name: val.name,
            avg_seconds: Math.round((val.secs.reduce((a, b) => a + b, 0) / val.secs.length) * 10) / 10,
            msg_count: val.secs.length,
          }))
          .sort((a, b) => a.avg_seconds - b.avg_seconds); // fastest first
        setIaData(iaResponseData);
      }

      // --- Agent response times ---
      if (agentRes.data) {
        const assignedIds = [...new Set(agentRes.data.map((c: any) => c.assigned_to).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', assignedIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        const agentInboxMap = new Map<string, { inbox: string; agent: string; minutes: number[] }>();

        agentRes.data.forEach((conv: any) => {
          const msgs = conv.conversation_messages || [];
          const incoming = msgs.filter((m: any) => m.direction === 'incoming').sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const outgoing = msgs.filter((m: any) => m.direction === 'outgoing').sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          if (!incoming.length || !outgoing.length) return;
          const firstIn = new Date(incoming[0].created_at).getTime();
          const firstOut = new Date(outgoing[0].created_at).getTime();
          if (firstOut <= firstIn) return;
          const diffMins = (firstOut - firstIn) / 60000;
          if (diffMins >= 1440) return;

          const agentId = conv.assigned_to;
          const agentName = profileMap.get(agentId) || 'Desconhecido';
          const inboxName = conv.inboxes?.name || conv.inbox_id;
          const key = `${conv.inbox_id}::${agentId}`;

          const existing = agentInboxMap.get(key) || { inbox: inboxName, agent: agentName, minutes: [] };
          existing.minutes.push(diffMins);
          agentInboxMap.set(key, existing);
        });

        const inboxGroups = new Map<string, AgentGroup>();
        agentInboxMap.forEach((val) => {
          const avg = val.minutes.reduce((a, b) => a + b, 0) / val.minutes.length;
          const existing = inboxGroups.get(val.inbox) || { inbox_name: val.inbox, agents: [] };
          existing.agents.push({ name: val.agent, minutes: Math.round(avg * 10) / 10, count: val.minutes.length });
          inboxGroups.set(val.inbox, existing);
        });

        const grouped: AgentGroup[] = Array.from(inboxGroups.values()).map(g => ({
          ...g,
          agents: g.agents.sort((a, b) => a.minutes - b.minutes),
        }));
        setAgentData(grouped);
      }
    } catch (err) {
      console.error('Error fetching helpdesk metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
      </div>
    );
  }

  const hasIaData = iaData.length > 0;
  const hasAgentData = agentData.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Métricas do Helpdesk</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {/* IA Average Response Time per Inbox (in seconds) */}
        <Card className="glass-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Tempo de Resposta da IA por Caixa
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasIaData ? (
              <ChartContainer
                config={{ avg_seconds: { label: 'Tempo médio (s)', color: 'hsl(262 80% 55%)' } }}
                className="h-[220px] w-full"
              >
                <BarChart
                  data={iaData.map(d => ({
                    name: d.inbox_name.length > 18 ? d.inbox_name.slice(0, 18) + '…' : d.inbox_name,
                    fullName: d.inbox_name,
                    avg_seconds: d.avg_seconds,
                    msg_count: d.msg_count,
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 65 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                        formatter={(value, _name, props) => (
                          <span className="font-medium">
                            {formatSeconds(Number(value))} ({props.payload.msg_count} msgs)
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="avg_seconds" radius={[0, 4, 4, 0]} maxBarSize={22}
                    label={{
                      position: 'right',
                      fontSize: 11,
                      formatter: (v: number) => formatSeconds(v),
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {iaData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma conversa com IA ativada encontrada
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Response Time per Inbox */}
        <Card className="glass-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Tempo Médio de Resposta por Agente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasAgentData ? (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {agentData.map((group, gi) => (
                  <div key={gi}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      {group.inbox_name}
                    </p>
                    <div className="space-y-1.5">
                      {group.agents.map((agent, ai) => {
                        const colorIdx = (gi * 3 + ai) % COLORS.length;
                        const maxMins = Math.max(...group.agents.map(a => a.minutes));
                        const pct = maxMins > 0 ? (agent.minutes / maxMins) * 100 : 0;
                        return (
                          <div key={ai} className="flex items-center gap-2">
                            <span className="text-xs w-28 truncate text-foreground/80 shrink-0">{agent.name}</span>
                            <div className="flex-1 bg-muted rounded-full h-2 relative overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: COLORS[colorIdx] }}
                              />
                            </div>
                            <span className="text-xs font-medium w-16 text-right shrink-0">{formatMinutes(agent.minutes)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhum dado de resposta disponível
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default memo(HelpdeskMetricsCharts);
