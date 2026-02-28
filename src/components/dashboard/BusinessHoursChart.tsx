import { memo, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Sun, Moon, Calendar } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HourData {
  hour: number;
  label: string;
  count: number;
  type: 'comercial' | 'noite' | 'fds';
}

interface SummaryData {
  comercial: number;
  noite: number;
  fds: number;
  total: number;
}

const COLORS = {
  comercial: 'hsl(142 70% 45%)',
  noite: 'hsl(262 60% 50%)',
  fds: 'hsl(25 90% 55%)',
};

const chartConfig = {
  comercial: { label: 'Horário Comercial', color: COLORS.comercial },
  noite: { label: 'Fora do Expediente', color: COLORS.noite },
  fds: { label: 'Fim de Semana', color: COLORS.fds },
};

/**
 * Classifica uma mensagem baseado no horário de Brasília:
 * - Comercial: Seg-Sex 08:00-17:59
 * - Noite: Seg-Sex 18:00-07:59
 * - FDS: Sáb-Dom qualquer horário
 */
function classifyMessage(dateStr: string): 'comercial' | 'noite' | 'fds' {
  // Convert to São Paulo time
  const d = new Date(dateStr);
  const spDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = spDate.getDay(); // 0=Sun, 6=Sat
  const hour = spDate.getHours();

  if (dayOfWeek === 0 || dayOfWeek === 6) return 'fds';
  if (hour >= 8 && hour < 18) return 'comercial';
  return 'noite';
}

function getSpHour(dateStr: string): number {
  const d = new Date(dateStr);
  const spDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return spDate.getHours();
}

const BusinessHoursChart = () => {
  const [messages, setMessages] = useState<{ created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        // Get last 30 days of incoming messages
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabase
          .from('conversation_messages')
          .select('created_at')
          .eq('direction', 'incoming')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: true })
          .limit(1000);

        if (error) throw error;
        setMessages(data || []);
      } catch (err) {
        console.error('Error fetching business hours data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, []);

  const { hourlyData, summary } = useMemo(() => {
    const hourCounts = new Array(24).fill(0);
    const sum: SummaryData = { comercial: 0, noite: 0, fds: 0, total: 0 };

    messages.forEach((msg) => {
      const type = classifyMessage(msg.created_at);
      const hour = getSpHour(msg.created_at);
      hourCounts[hour]++;
      sum[type]++;
      sum.total++;
    });

    const hourlyData: HourData[] = hourCounts.map((count, hour) => {
      const dayOfWeek = new Date().getDay(); // approximate — for coloring we use weekday logic
      let type: 'comercial' | 'noite' | 'fds';
      if (hour >= 8 && hour < 18) type = 'comercial';
      else type = 'noite';

      return {
        hour,
        label: `${String(hour).padStart(2, '0')}h`,
        count,
        type,
      };
    });

    return { hourlyData, summary: sum };
  }, [messages]);

  const pieData = useMemo(() => [
    { name: 'Horário Comercial', value: summary.comercial, fill: COLORS.comercial },
    { name: 'Fora do Expediente', value: summary.noite, fill: COLORS.noite },
    { name: 'Fim de Semana', value: summary.fds, fill: COLORS.fds },
  ].filter(d => d.value > 0), [summary]);

  const pct = (val: number) => summary.total > 0 ? Math.round((val / summary.total) * 100) : 0;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 animate-fade-in">
        <Skeleton className="h-[320px] md:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>
    );
  }

  if (summary.total === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3 animate-fade-in" style={{ animationDelay: '250ms' }}>
      {/* Bar Chart - Hourly Distribution */}
      <Card className="glass-card-hover md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium">
              Horário das Conversas — Últimos 30 dias
            </CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {summary.total.toLocaleString('pt-BR')} mensagens
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Total de mensagens recebidas nos últimos 30 dias</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">
            Distribuição por hora do dia (horário de Brasília)
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer
            config={chartConfig}
            className="h-[240px] w-full"
          >
            <BarChart data={hourlyData} margin={{ left: 0, right: 5, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                interval={1}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                allowDecimals={false}
                width={30}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, _, item) => {
                      const type = item?.payload?.type;
                      const label = type === 'comercial' ? 'Horário Comercial' : 'Fora do Expediente';
                      return <span className="font-medium">{value} msgs — {label}</span>;
                    }}
                  />
                }
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={20}>
                {hourlyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.type === 'comercial' ? COLORS.comercial : COLORS.noite}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.comercial }} />
              <span>08h–18h (Comercial)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.noite }} />
              <span>18h–08h (Fora)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="glass-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Resumo por Período</CardTitle>
          <p className="text-xs text-muted-foreground">Classificação das mensagens recebidas</p>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Pie */}
          <ChartContainer config={chartConfig} className="h-[120px] w-full">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={50}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} stroke="transparent" />
                ))}
              </Pie>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => <span className="font-medium">{value} msgs</span>}
                  />
                }
              />
            </PieChart>
          </ChartContainer>

          {/* Stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4" style={{ color: COLORS.comercial }} />
                <span className="text-sm">Comercial</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold">{pct(summary.comercial)}%</span>
                <span className="text-xs text-muted-foreground ml-1">({summary.comercial})</span>
              </div>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct(summary.comercial)}%`, background: COLORS.comercial }} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4" style={{ color: COLORS.noite }} />
                <span className="text-sm">Noite/Madrugada</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold">{pct(summary.noite)}%</span>
                <span className="text-xs text-muted-foreground ml-1">({summary.noite})</span>
              </div>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct(summary.noite)}%`, background: COLORS.noite }} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: COLORS.fds }} />
                <span className="text-sm">Fim de Semana</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold">{pct(summary.fds)}%</span>
                <span className="text-xs text-muted-foreground ml-1">({summary.fds})</span>
              </div>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct(summary.fds)}%`, background: COLORS.fds }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default memo(BusinessHoursChart);
