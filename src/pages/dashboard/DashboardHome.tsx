import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import StatsCard from '@/components/dashboard/StatsCard';
import InstanceCard from '@/components/dashboard/InstanceCard';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Users, Wifi, WifiOff, MessageSquare, UsersRound, RefreshCw, UserPlus } from 'lucide-react';
import HelpdeskMetricsCharts from '@/components/dashboard/HelpdeskMetricsCharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import InstanceFilterSelect from '@/components/dashboard/InstanceFilterSelect';
import { toast } from 'sonner';
import { startOfDay, subDays } from 'date-fns';
import { formatBR } from '@/lib/dateUtils';

interface Instance {
  id: string;
  name: string;
  status: string;
  owner_jid: string | null;
  profile_pic_url: string | null;
  user_id: string;
  token: string;
  user_profiles?: {
    full_name: string | null;
    email: string;
  };
}

interface InstanceStats {
  instanceId: string;
  instanceName: string;
  groupsCount: number;
  participantsCount: number;
  status: string;
}

interface HelpdeskLeadsStats {
  today: number;
  yesterday: number;
  total: number;
  dailyData: { day: string; label: string; leads: number }[];
}

const DashboardHome = () => {
  const { profile, isSuperAdmin } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [instanceStats, setInstanceStats] = useState<InstanceStats[]>([]);
  const [helpdeskLeads, setHelpdeskLeads] = useState<HelpdeskLeadsStats>({ today: 0, yesterday: 0, total: 0, dailyData: [] });
  const [selectedHelpdeskInstance, setSelectedHelpdeskInstance] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchHelpdeskLeadsStats();
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchHelpdeskLeadsStats(selectedHelpdeskInstance ?? undefined);
  }, [selectedHelpdeskInstance]);

  // Subscribe to realtime updates for helpdesk leads
  useEffect(() => {
    const channel = supabase
      .channel('helpdesk-leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_database_entries',
          filter: 'source=eq.helpdesk',
        },
        (payload) => {
          // Refresh stats when a new helpdesk lead is added
          if (payload.eventType === 'INSERT') {
            fetchHelpdeskLeadsStats(selectedHelpdeskInstance ?? undefined);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedHelpdeskInstance]);

  const fetchData = async () => {
    try {
      // Fetch instances
      const { data: instancesData, error: instancesError } = await supabase
        .from('instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (instancesError) throw instancesError;

      // Fetch user profiles for each instance
      if (instancesData && instancesData.length > 0) {
        const userIds = [...new Set(instancesData.map((i) => i.user_id))];
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);

        const instancesWithProfiles = instancesData.map((instance) => ({
          ...instance,
          user_profiles: profilesMap.get(instance.user_id),
        }));

        setInstances(instancesWithProfiles as Instance[]);
        
        // Fetch groups stats for each connected instance
        await fetchGroupsStats(instancesWithProfiles as Instance[]);
      } else {
        setInstances([]);
      }

      // Fetch total users count if super admin
      if (isSuperAdmin) {
        const { count } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true });
        setTotalUsers(count || 0);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHelpdeskLeadsStats = async (instanceId?: string) => {
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const yesterdayStart = startOfDay(subDays(now, 1)).toISOString();
      const sevenDaysAgo = startOfDay(subDays(now, 6)).toISOString();

      // If filtering by instance, first get the database IDs for that instance
      let databaseIds: string[] | null = null;
      if (instanceId) {
        const { data: dbs } = await supabase
          .from('lead_databases')
          .select('id')
          .eq('instance_id', instanceId);
        databaseIds = dbs?.map(d => d.id) || [];
        if (databaseIds.length === 0) {
          setHelpdeskLeads({ today: 0, yesterday: 0, total: 0, dailyData: [] });
          return;
        }
      }

      const buildQuery = (baseQuery: ReturnType<typeof supabase.from>) => {
        let q = baseQuery;
        if (databaseIds) {
          q = q.in('database_id', databaseIds);
        }
        return q;
      };

      // Fetch today, yesterday, total and last 7 days in parallel
      const [todayRes, yesterdayRes, totalRes, weekRes] = await Promise.all([
        buildQuery(
          supabase
            .from('lead_database_entries')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'helpdesk')
            .gte('created_at', todayStart)
        ),
        buildQuery(
          supabase
            .from('lead_database_entries')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'helpdesk')
            .gte('created_at', yesterdayStart)
            .lt('created_at', todayStart)
        ),
        buildQuery(
          supabase
            .from('lead_database_entries')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'helpdesk')
        ),
        buildQuery(
          supabase
            .from('lead_database_entries')
            .select('created_at')
            .eq('source', 'helpdesk')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: true })
        ),
      ]);

      const todayCount = todayRes.count || 0;
      const yesterdayCount = yesterdayRes.count || 0;
      const totalCount = totalRes.count || 0;

      // Group by day
      const dayMap = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = subDays(now, i);
        dayMap.set(formatBR(d, 'yyyy-MM-dd'), 0);
      }
      weekRes.data?.forEach((entry) => {
        const dayKey = formatBR(entry.created_at!, 'yyyy-MM-dd');
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);
      });

      const dailyData = Array.from(dayMap.entries()).map(([day, count]) => ({
        day,
        label: formatBR(day, 'EEE'),
        leads: count,
      }));

      setHelpdeskLeads({ today: todayCount, yesterday: yesterdayCount, total: totalCount, dailyData });
    } catch (error) {
      console.error('Error fetching helpdesk leads stats:', error);
    }
  };

  const fetchGroupsStats = async (instancesList: Instance[]) => {
    setLoadingStats(true);
    const stats: InstanceStats[] = [];

    const connectedInstances = instancesList.filter(
      (i) => i.status === 'connected' || i.status === 'online'
    );

    await Promise.all(
      connectedInstances.map(async (instance) => {
        try {
          const { data, error } = await supabase.functions.invoke('uazapi-proxy', {
            body: {
              action: 'groups',
              token: instance.token,
            },
          });

          if (error) throw error;

          const groups = Array.isArray(data) ? data : [];
          let totalParticipants = 0;

          // Sum participants from each group
          // UAZAPI returns fields in PascalCase, check all possible formats
          groups.forEach((group: Record<string, unknown>) => {
            const participantCount = 
              (group.ParticipantCount as number) ||
              (group.Size as number) ||
              (group.size as number) ||
              (Array.isArray(group.Participants) ? group.Participants.length : 0) ||
              (Array.isArray(group.participants) ? group.participants.length : 0) ||
              0;
            totalParticipants += participantCount;
          });

          stats.push({
            instanceId: instance.id,
            instanceName: instance.name,
            groupsCount: groups.length,
            participantsCount: totalParticipants,
            status: instance.status,
          });
        } catch (error) {
          console.error(`Error fetching groups for ${instance.name}:`, error);
          stats.push({
            instanceId: instance.id,
            instanceName: instance.name,
            groupsCount: 0,
            participantsCount: 0,
            status: instance.status,
          });
        }
      })
    );

    // Add offline instances with 0 stats
    const offlineInstances = instancesList.filter(
      (i) => i.status !== 'connected' && i.status !== 'online'
    );
    offlineInstances.forEach((instance) => {
      stats.push({
        instanceId: instance.id,
        instanceName: instance.name,
        groupsCount: 0,
        participantsCount: 0,
        status: instance.status,
      });
    });

    setInstanceStats(stats);
    setLoadingStats(false);
  };

  const handleRefreshStats = useCallback(async () => {
    if (instances.length === 0) return;
    toast.info('Atualizando estatísticas...');
    await fetchGroupsStats(instances);
    toast.success('Estatísticas atualizadas!');
  }, [instances]);

  const connectedInstances = useMemo(() => 
    instances.filter((i) => i.status === 'connected' || i.status === 'online'),
    [instances]
  );
  
  const disconnectedInstances = useMemo(() => 
    instances.filter((i) => i.status !== 'connected' && i.status !== 'online'),
    [instances]
  );

  const totalGroups = useMemo(() => instanceStats.reduce((acc, s) => acc + s.groupsCount, 0), [instanceStats]);
  const totalParticipants = useMemo(() => instanceStats.reduce((acc, s) => acc + s.participantsCount, 0), [instanceStats]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-xl md:text-2xl font-display font-bold">
          Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? 'Visão geral de todas as instâncias do sistema'
            : 'Gerencie suas instâncias do WhatsApp'}
        </p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <StatsCard
          title="Total de Instâncias"
          value={instances.length}
          icon={Server}
        />
        <StatsCard
          title="Instâncias Online"
          value={connectedInstances.length}
          icon={Wifi}
        />
        <StatsCard
          title="Total de Grupos"
          value={loadingStats ? '...' : totalGroups}
          icon={MessageSquare}
        />
        <StatsCard
          title="Total de Participantes"
          value={loadingStats ? '...' : totalParticipants.toLocaleString('pt-BR')}
          icon={UsersRound}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4 animate-fade-in" style={{ animationDelay: '150ms' }}>
        <StatsCard
          title="Instâncias Offline"
          value={disconnectedInstances.length}
          icon={WifiOff}
        />
        {isSuperAdmin && (
          <StatsCard
            title="Total de Usuários"
            value={totalUsers}
            icon={Users}
          />
        )}
        <div className="col-span-2 lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">Filtrar por instância</span>
            <InstanceFilterSelect
              instances={instances.map(i => ({ id: i.id, name: i.name, status: i.status }))}
              selectedId={selectedHelpdeskInstance}
              onSelect={setSelectedHelpdeskInstance}
            />
          </div>
          <StatsCard
            title={selectedHelpdeskInstance
              ? `Leads Helpdesk Hoje — ${instances.find(i => i.id === selectedHelpdeskInstance)?.name || ''}`
              : 'Leads Helpdesk Hoje'}
            value={helpdeskLeads.today}
            icon={UserPlus}
            description={`${helpdeskLeads.total} leads capturados no total`}
            trend={helpdeskLeads.yesterday > 0 ? {
              value: Math.round(((helpdeskLeads.today - helpdeskLeads.yesterday) / helpdeskLeads.yesterday) * 100),
              positive: helpdeskLeads.today >= helpdeskLeads.yesterday,
            } : undefined}
          />
        </div>
      </div>

      {/* Charts Section */}
      <DashboardCharts
        instanceStats={instanceStats}
        connectedCount={connectedInstances.length}
        disconnectedCount={disconnectedInstances.length}
        loading={loadingStats}
        helpdeskLeadsDailyData={helpdeskLeads.dailyData}
        helpdeskChartTitle={selectedHelpdeskInstance
          ? `Leads Helpdesk — ${instances.find(i => i.id === selectedHelpdeskInstance)?.name || ''} — 7 dias`
          : undefined
        }
      />

      {/* Instance Groups Breakdown */}
      <div className="space-y-4 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Grupos por Instância</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshStats}
            disabled={loadingStats}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingStats ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        
        {loadingStats ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : instanceStats.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-8 text-center text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Nenhuma estatística disponível</p>
              <p className="text-sm mt-1">Conecte uma instância para ver os dados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {instanceStats.map((stat) => (
              <Card 
                key={stat.instanceId} 
                className="glass-card-hover"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium truncate">
                      {stat.instanceName}
                    </CardTitle>
                    <Badge 
                      variant={stat.status === 'connected' || stat.status === 'online' ? 'default' : 'secondary'}
                      className={
                        stat.status === 'connected' || stat.status === 'online'
                          ? 'bg-green-500/10 text-green-600 border-green-500/20'
                          : ''
                      }
                    >
                      {stat.status === 'connected' || stat.status === 'online' ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MessageSquare className="w-4 h-4" />
                      <span>Grupos</span>
                    </div>
                    <span className="font-semibold">{stat.groupsCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UsersRound className="w-4 h-4" />
                      <span>Participantes</span>
                    </div>
                    <span className="font-semibold">{stat.participantsCount.toLocaleString('pt-BR')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Helpdesk Metrics Section */}
      <div className="animate-fade-in" style={{ animationDelay: '250ms' }}>
        <HelpdeskMetricsCharts />
      </div>

      {/* Recent Instances */}
      <div className="space-y-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h2 className="text-lg font-semibold">Instâncias Recentes</h2>
        {instances.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma instância encontrada</p>
            {isSuperAdmin && (
              <p className="text-sm mt-2">
                Acesse o menu "Instâncias" para criar uma nova
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {instances.slice(0, 6).map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                showOwner={isSuperAdmin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
