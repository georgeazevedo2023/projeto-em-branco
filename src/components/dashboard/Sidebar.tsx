import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  MessageSquareMore,
  LayoutDashboard,
  MonitorSmartphone,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ChevronDown,
  Clock,
  Send,
  Headphones,
  Inbox,
  BrainCircuit,
  Kanban,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useState, useEffect } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';

interface Instance {
  id: string;
  name: string;
  status: string;
}

interface DepartmentItem {
  id: string;
  name: string;
  is_default: boolean;
}

interface InboxItem {
  id: string;
  name: string;
  instance_id: string;
  departments: DepartmentItem[];
}

interface InstanceWithInboxes extends Instance {
  inboxes: InboxItem[];
}

interface SidebarProps {
  isMobile?: boolean;
  onNavigate?: () => void;
}

const Sidebar = ({ isMobile = false, onNavigate }: SidebarProps) => {
  const location = useLocation();
  const { id: instanceId } = useParams<{ id: string }>();
  const { profile, isSuperAdmin, isGerente, signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [instancesOpen, setInstancesOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [helpdeskOpen, setHelpdeskOpen] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instancesWithInboxes, setInstancesWithInboxes] = useState<InstanceWithInboxes[]>([]);

  // No mobile, nunca está colapsado
  const isCollapsed = isMobile ? false : collapsed;

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Clock, label: 'Agendamentos', path: '/dashboard/scheduled' },
  ];

  const adminItems = [
    { icon: BrainCircuit, label: 'Inteligência', path: '/dashboard/intelligence' },
    { icon: ShieldCheck, label: 'Administração', path: '/dashboard/admin' },
    { icon: Settings, label: 'Configurações', path: '/dashboard/settings' },
  ];

  const isActive = (path: string) => location.pathname === path;
  const isInstancesActive = location.pathname.includes('/dashboard/instances');
  const isBroadcastActive = location.pathname.startsWith('/dashboard/broadcast');
  const isHelpdeskActive = location.pathname.startsWith('/dashboard/helpdesk');

  const fetchInstances = async () => {
    try {
      if (isSuperAdmin) {
        const [instancesRes, inboxesRes, deptsRes] = await Promise.all([
          supabase.from('instances').select('id, name, status').eq('disabled', false).order('name'),
          supabase.from('inboxes').select('id, name, instance_id').order('name'),
          supabase.from('departments').select('id, name, inbox_id, is_default').order('name'),
        ]);

        if (instancesRes.error) throw instancesRes.error;
        const allInstances = instancesRes.data || [];
        setInstances(allInstances);

        const allDepts = deptsRes.data || [];
        const allInboxes: InboxItem[] = (inboxesRes.data || []).map(ib => ({
          ...ib,
          departments: allDepts.filter(d => d.inbox_id === ib.id),
        }));
        const grouped: InstanceWithInboxes[] = allInstances
          .map(inst => ({
            ...inst,
            inboxes: allInboxes.filter(ib => ib.instance_id === inst.id),
          }))
          .filter(inst => inst.inboxes.length > 0);
        setInstancesWithInboxes(grouped);
      } else {
        // Non-admin: fetch only inboxes user has access to
        const [userInboxesRes, deptsRes2] = await Promise.all([
          supabase.from('inbox_users').select('inboxes(id, name, instance_id)').eq('user_id', user!.id),
          supabase.from('departments').select('id, name, inbox_id, is_default').order('name'),
        ]);

        const allDepts2 = deptsRes2.data || [];
        const rawInboxes = (userInboxesRes.data || []).map((d: any) => d.inboxes).filter(Boolean);
        const inboxList: InboxItem[] = rawInboxes.map((ib: any) => ({
          ...ib,
          departments: allDepts2.filter(d => d.inbox_id === ib.id),
        }));

        // Get unique instance IDs from user's inboxes
        const instanceIds = [...new Set(inboxList.map(ib => ib.instance_id))];
        if (instanceIds.length > 0) {
          const { data: instData } = await supabase
            .from('instances')
            .select('id, name, status')
            .in('id', instanceIds)
            .order('name');

          const instList = instData || [];
          setInstances(instList);
          const grouped: InstanceWithInboxes[] = instList
            .map(inst => ({
              ...inst,
              inboxes: inboxList.filter(ib => ib.instance_id === inst.id),
            }))
            .filter(inst => inst.inboxes.length > 0);
          setInstancesWithInboxes(grouped);
        } else {
          setInstances([]);
          setInstancesWithInboxes([]);
        }
      }
    } catch (error) {
      console.error('Error fetching instances:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchInstances();
    }
  }, [user, isSuperAdmin]);

  // Listen for instance updates (e.g., after sync/delete orphans)
  useEffect(() => {
    const handleInstancesUpdate = () => {
      fetchInstances();
    };

    window.addEventListener('instances-updated', handleInstancesUpdate);
    return () => {
      window.removeEventListener('instances-updated', handleInstancesUpdate);
    };
  }, []);

  // Classe base para links colapsados (centralizado)
  const collapsedLinkClass = cn(
    'flex items-center justify-center w-full px-3 py-2.5 rounded-lg transition-all'
  );

  const handleLinkClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'h-full flex flex-col transition-all duration-300',
          isMobile ? 'w-full sidebar-glass' : 'sidebar-glass',
          !isMobile && (isCollapsed ? 'w-20' : 'w-64')
        )}
      >
      {/* Header */}
      <div className={cn(
        'h-16 flex items-center justify-between px-4 border-b border-primary/10',
        isMobile && 'hidden' // No mobile, o header está no MobileHeader
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <MessageSquareMore className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display font-bold text-lg">WhatsPRO</span>
          </div>
        )}
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn('shrink-0', isCollapsed && 'mx-auto')}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {isSuperAdmin && navItems.map((item) => (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>
              <Link
                to={item.path}
                onClick={handleLinkClick}
                className={cn(
                  isCollapsed ? collapsedLinkClass : 'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                  isActive(item.path)
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
          </Tooltip>
        ))}

        {/* Atendimento - Collapsible com instâncias e inboxes */}
        {!isCollapsed ? (
          <Collapsible open={helpdeskOpen} onOpenChange={setHelpdeskOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left',
                  isHelpdeskActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Headphones className="w-5 h-5 shrink-0" />
                <span className="font-medium flex-1">Atendimento</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform',
                    helpdeskOpen && 'transform rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-5 mt-1 space-y-1">
              {instancesWithInboxes.map((instance) => (
                <div key={instance.id} className="space-y-0.5">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        instance.status === 'connected' ? 'bg-success' : 'bg-muted-foreground'
                      )}
                    />
                    <span className="truncate">{instance.name}</span>
                  </div>
                  {instance.inboxes.map((inbox) => (
                    <div key={inbox.id} className="space-y-0.5">
                      <Link
                        to={`/dashboard/helpdesk?inbox=${inbox.id}`}
                        onClick={handleLinkClick}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm pl-6',
                          location.search.includes(inbox.id) && !location.search.includes('dept=')
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                        )}
                      >
                        <Inbox className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{inbox.name}</span>
                      </Link>
                      {inbox.departments.map((dept) => (
                        <Link
                          key={dept.id}
                          to={`/dashboard/helpdesk?inbox=${inbox.id}&dept=${dept.id}`}
                          onClick={handleLinkClick}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1 rounded-lg transition-all text-xs pl-10',
                            location.search.includes(dept.id)
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground'
                          )}
                        >
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{dept.name}</span>
                          {dept.is_default && (
                            <span className="text-[9px] opacity-50 shrink-0">padrão</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              {instancesWithInboxes.length === 0 && (
                <span className="px-3 py-2 text-xs text-muted-foreground">Nenhuma caixa configurada</span>
              )}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/dashboard/helpdesk"
                onClick={handleLinkClick}
                className={cn(
                  collapsedLinkClass,
                  isHelpdeskActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Headphones className="w-5 h-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Atendimento</TooltipContent>
          </Tooltip>
        )}

        {/* CRM Kanban - visível apenas para super_admin e gerente */}
        {(isSuperAdmin || isGerente) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/dashboard/crm"
                onClick={handleLinkClick}
                className={cn(
                  isCollapsed ? collapsedLinkClass : 'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                  location.pathname.startsWith('/dashboard/crm')
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Kanban className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span className="font-medium">CRM</span>}
              </Link>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">CRM Kanban</TooltipContent>}
          </Tooltip>
        )}

        {/* Disparador - Collapsible apenas quando NÃO colapsado (apenas super admin) */}
        {isSuperAdmin && (!isCollapsed ? (
          <Collapsible open={broadcastOpen} onOpenChange={setBroadcastOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left',
                  isBroadcastActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Send className="w-5 h-5 shrink-0" />
                <span className="font-medium flex-1">Disparador</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform',
                    broadcastOpen && 'transform rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-5 mt-1 space-y-1">
              <Link
                to="/dashboard/broadcast"
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm',
                  isActive('/dashboard/broadcast')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                )}
              >
                <span>Grupos</span>
              </Link>
              <Link
                to="/dashboard/broadcast/history"
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm',
                  isActive('/dashboard/broadcast/history')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                )}
              >
                <span>Histórico</span>
              </Link>
              <Link
                to="/dashboard/broadcast/leads"
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm',
                  isActive('/dashboard/broadcast/leads')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                )}
              >
                <span>Leads</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/dashboard/broadcast"
                onClick={handleLinkClick}
                className={cn(
                  collapsedLinkClass,
                  isBroadcastActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Send className="w-5 h-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Disparador</TooltipContent>
          </Tooltip>
        ))}

        {/* Instâncias - Collapsible apenas quando NÃO colapsado (apenas super admin) */}
        {isSuperAdmin && (!isCollapsed ? (
          <Collapsible open={instancesOpen} onOpenChange={setInstancesOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full text-left',
                  isInstancesActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <MonitorSmartphone className="w-5 h-5 shrink-0" />
                <span className="font-medium flex-1">Instâncias</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform',
                    instancesOpen && 'transform rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-5 mt-1 space-y-1">
              <Link
                to="/dashboard/instances"
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm',
                  isActive('/dashboard/instances')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                )}
              >
                <span>Todas as instâncias</span>
              </Link>
              {instances.slice(0, 5).map((instance) => (
                <Link
                  key={instance.id}
                  to={`/dashboard/instances/${instance.id}`}
                  onClick={handleLinkClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm',
                    instanceId === instance.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      instance.status === 'connected' ? 'bg-success' : 'bg-muted-foreground'
                    )}
                  />
                  <span className="truncate">{instance.name}</span>
                </Link>
              ))}
              {instances.length > 5 && (
                <Link
                  to="/dashboard/instances"
                  onClick={handleLinkClick}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground"
                >
                  <span>+{instances.length - 5} mais...</span>
                </Link>
              )}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/dashboard/instances"
                onClick={handleLinkClick}
                className={cn(
                  collapsedLinkClass,
                  isInstancesActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <MonitorSmartphone className="w-5 h-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Instâncias</TooltipContent>
          </Tooltip>
        ))}

        {isSuperAdmin && (
          <>
            <div className="pt-4 pb-2">
              {!isCollapsed && (
                <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Admin</span>
                </div>
              )}
            </div>
            {adminItems.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    onClick={handleLinkClick}
                    className={cn(
                      isCollapsed ? collapsedLinkClass : 'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                      isActive(item.path)
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent'
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && <span className="font-medium">{item.label}</span>}
                  </Link>
                </TooltipTrigger>
                {isCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            ))}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-primary/10">
        <div
          className={cn(
            'flex items-center gap-3 p-2 rounded-lg',
            isCollapsed && 'justify-center'
          )}
        >
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{profile?.full_name || 'Usuário'}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              {/* Badge de papel */}
              <span className={cn(
                'inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 mt-0.5',
                isSuperAdmin
                  ? 'bg-primary/15 text-primary'
                  : isGerente
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-muted text-muted-foreground'
              )}>
                {isSuperAdmin ? 'Super Admin' : isGerente ? 'Gerente' : 'Atendente'}
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={signOut}
          className={cn(
            'w-full mt-2 text-muted-foreground hover:text-destructive',
            isCollapsed ? 'px-0 justify-center' : 'justify-start'
          )}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="ml-2">Sair</span>}
        </Button>
      </div>
    </aside>
    </TooltipProvider>
  );
};

export default Sidebar;
