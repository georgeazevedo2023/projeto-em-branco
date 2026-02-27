import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ShieldCheck,
  Plus,
  Search,
  Inbox,
  Users,
  Headphones,
  Loader2,
  Trash2,
  Settings,
  MonitorSmartphone,
  Shield,
  User,
  ChevronDown,
  Link,
  Copy,
  Pencil,
  Check,
  X,
  UserPlus,
  Phone,
  AlertTriangle,
  Briefcase,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import ManageInboxUsersDialog from '@/components/dashboard/ManageInboxUsersDialog';
import ManageUserInstancesDialog from '@/components/dashboard/ManageUserInstancesDialog';
import CreateInboxUserDialog from '@/components/dashboard/CreateInboxUserDialog';
import BackupModule from '@/components/dashboard/BackupModule';
import DepartmentsTab from '@/components/dashboard/DepartmentsTab';
import type { Database } from '@/integrations/supabase/types';

type InboxRole = Database['public']['Enums']['inbox_role'];

// ─── Types ───────────────────────────────────────────────────────────────────

interface InboxWithDetails {
  id: string;
  name: string;
  instance_id: string;
  instance_name: string;
  instance_status: string;
  created_by: string;
  created_at: string;
  member_count: number;
  webhook_url: string | null;
  webhook_outgoing_url: string | null;
}

type AppRole = 'super_admin' | 'gerente' | 'user';

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_super_admin: boolean;
  app_role: AppRole;
  instance_count: number;
  instances: { id: string; name: string; phone: string | null }[];
}

interface InboxMembership {
  inbox_id: string;
  inbox_name: string;
  instance_name: string;
  role: InboxRole;
}

interface UserDepartment {
  id: string;
  name: string;
  inbox_name: string;
  is_default: boolean;
}

interface InboxUser {
  id: string;
  email: string;
  full_name: string | null;
  memberships: InboxMembership[];
  departments: UserDepartment[];
}

const ROLE_LABELS: Record<InboxRole, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  agente: 'Agente',
};

const ROLE_COLORS: Record<InboxRole, string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  gestor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  agente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const formatPhone = (jid: string | null): string => {
  if (!jid) return '';
  const clean = jid.replace(/@s\.whatsapp\.net$/, '');
  if (clean.length === 13)
    return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 9)}-${clean.slice(9)}`;
  if (clean.length === 12)
    return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 8)}-${clean.slice(8)}`;
  return clean;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminPanel = () => {
  const { isSuperAdmin, user } = useAuth();

  // Tabs
  const [activeTab, setActiveTab] = useState('inboxes');

  // Global search per tab
  const [inboxSearch, setInboxSearch] = useState('');
  const [usersSearch, setUsersSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  // Inboxes state
  const [inboxes, setInboxes] = useState<InboxWithDetails[]>([]);
  const [inboxesLoading, setInboxesLoading] = useState(true);
  const [instances, setInstances] = useState<{ id: string; name: string; status: string }[]>([]);

  // Create inbox dialog
  const [isCreateInboxOpen, setIsCreateInboxOpen] = useState(false);
  const [isCreatingInbox, setIsCreatingInbox] = useState(false);
  const [newInboxName, setNewInboxName] = useState('');
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookOutgoingUrl, setWebhookOutgoingUrl] = useState('');

  // Delete inbox
  const [inboxToDelete, setInboxToDelete] = useState<InboxWithDetails | null>(null);
  const [isDeletingInbox, setIsDeletingInbox] = useState(false);

  // Manage inbox members
  const [manageInbox, setManageInbox] = useState<InboxWithDetails | null>(null);

  // Webhook editing
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [editWebhookValue, setEditWebhookValue] = useState('');
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [editingOutgoingId, setEditingOutgoingId] = useState<string | null>(null);
  const [editOutgoingValue, setEditOutgoingValue] = useState('');
  const [isSavingOutgoing, setIsSavingOutgoing] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Create user dialog
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('user');

  // Delete user
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Manage user instances
  const [manageInstancesUser, setManageInstancesUser] = useState<UserWithRole | null>(null);
  const [isManageInstancesOpen, setIsManageInstancesOpen] = useState(false);

  // Team state
  const [teamUsers, setTeamUsers] = useState<InboxUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [isCreateTeamUserOpen, setIsCreateTeamUserOpen] = useState(false);
  const [removeMembership, setRemoveMembership] = useState<{
    userId: string;
    inboxId: string;
    userName: string;
    inboxName: string;
  } | null>(null);
  const [isRemovingMembership, setIsRemovingMembership] = useState(false);

  // Edit team user state
  const [editingTeamUser, setEditingTeamUser] = useState<InboxUser | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamEmail, setEditTeamEmail] = useState('');
  const [editTeamPassword, setEditTeamPassword] = useState('');
  const [isSavingTeamUser, setIsSavingTeamUser] = useState(false);
  const [editTeamInboxes, setEditTeamInboxes] = useState<Record<string, InboxRole>>({});

  // ── Fetch inboxes ──────────────────────────────────────────────────────────
  const fetchInboxes = useCallback(async () => {
    setInboxesLoading(true);
    try {
      const { data: inboxData, error } = await supabase
        .from('inboxes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!inboxData?.length) { setInboxes([]); return; }

      const instanceIds = [...new Set(inboxData.map(i => i.instance_id))];
      const { data: instanceData } = await supabase
        .from('instances')
        .select('id, name, status')
        .in('id', instanceIds);
      const instanceMap = new Map((instanceData || []).map(i => [i.id, i]));

      const { data: memberData } = await supabase.from('inbox_users').select('inbox_id');
      const memberCounts = new Map<string, number>();
      (memberData || []).forEach(m => memberCounts.set(m.inbox_id, (memberCounts.get(m.inbox_id) || 0) + 1));

      setInboxes(inboxData.map(inbox => ({
        id: inbox.id,
        name: inbox.name,
        instance_id: inbox.instance_id,
        instance_name: instanceMap.get(inbox.instance_id)?.name || 'Instância removida',
        instance_status: instanceMap.get(inbox.instance_id)?.status || 'disconnected',
        created_by: inbox.created_by,
        created_at: inbox.created_at,
        member_count: memberCounts.get(inbox.id) || 0,
        webhook_url: (inbox as any).webhook_url || null,
        webhook_outgoing_url: (inbox as any).webhook_outgoing_url || null,
      })));
    } catch (e) {
      toast.error('Erro ao carregar caixas');
    } finally {
      setInboxesLoading(false);
    }
  }, []);

  // ── Fetch instances ────────────────────────────────────────────────────────
  const fetchInstances = useCallback(async () => {
    const { data } = await supabase.from('instances').select('id, name, status').eq('disabled', false).order('name');
    if (data) setInstances(data);
  }, []);

  // ── Fetch users ────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const [profilesRes, rolesRes, accessRes, instRes] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_instance_access').select('user_id, instance_id'),
        supabase.from('instances').select('id, name, owner_jid'),
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const access = accessRes.data || [];
      const instMap = new Map((instRes.data || []).map(i => [i.id, i]));

      const resolveRole = (userId: string): AppRole => {
        const userRoles = roles.filter(r => r.user_id === userId).map(r => r.role);
        if (userRoles.includes('super_admin')) return 'super_admin';
        if (userRoles.includes('gerente')) return 'gerente';
        return 'user';
      };

      setUsers(profiles.map(p => {
        const userAccess = access.filter(a => a.user_id === p.id);
        const instances = userAccess
          .map(a => { const i = instMap.get(a.instance_id); return i ? { id: i.id, name: i.name, phone: i.owner_jid } : null; })
          .filter(Boolean) as UserWithRole['instances'];
        const role = resolveRole(p.id);
        return {
          ...p,
          is_super_admin: role === 'super_admin',
          app_role: role,
          instance_count: instances.length,
          instances,
        };
      }));
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ── Fetch team ─────────────────────────────────────────────────────────────
  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const [profilesRes, inboxUsersRes, inboxesRes, instancesRes, deptMembersRes, deptsRes] = await Promise.all([
        supabase.from('user_profiles').select('id, email, full_name'),
        supabase.from('inbox_users').select('user_id, inbox_id, role'),
        supabase.from('inboxes').select('id, name, instance_id'),
        supabase.from('instances').select('id, name'),
        supabase.from('department_members').select('user_id, department_id'),
        supabase.from('departments').select('id, name, inbox_id, is_default'),
      ]);

      const profiles = profilesRes.data || [];
      const inboxUsers = inboxUsersRes.data || [];
      const inboxesList = inboxesRes.data || [];
      const inboxMap = new Map(inboxesList.map(ib => [ib.id, ib]));
      const instanceMap = new Map((instancesRes.data || []).map(i => [i.id, i]));
      const deptMembers = deptMembersRes.data || [];
      const deptMap = new Map((deptsRes.data || []).map(d => [d.id, d]));
      const userIdsWithInbox = new Set(inboxUsers.map(iu => iu.user_id));

      const result: InboxUser[] = profiles
        .filter(p => userIdsWithInbox.has(p.id))
        .map(profile => ({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          memberships: inboxUsers
            .filter(iu => iu.user_id === profile.id)
            .map(iu => {
              const inbox = inboxMap.get(iu.inbox_id);
              const instance = inbox ? instanceMap.get(inbox.instance_id) : undefined;
              return {
                inbox_id: iu.inbox_id,
                inbox_name: inbox?.name || 'Desconhecida',
                instance_name: instance?.name || '',
                role: iu.role as InboxRole,
              };
            }),
          departments: deptMembers
            .filter(dm => dm.user_id === profile.id)
            .map(dm => {
              const dept = deptMap.get(dm.department_id);
              if (!dept) return null;
              const inbox = inboxMap.get(dept.inbox_id);
              return {
                id: dept.id,
                name: dept.name,
                inbox_name: inbox?.name || '',
                is_default: dept.is_default,
              };
            })
            .filter(Boolean) as UserDepartment[],
        }));

      setTeamUsers(result);
    } catch {
      toast.error('Erro ao carregar equipe');
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchInboxes();
    fetchInstances();
    fetchUsers();
    fetchTeam();
  }, [isSuperAdmin, fetchInboxes, fetchInstances, fetchUsers, fetchTeam]);

  // Guard after all hooks
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  // ── Handlers: Inbox ────────────────────────────────────────────────────────
  const handleCreateInbox = async () => {
    if (!newInboxName.trim() || !selectedInstanceId) {
      toast.error('Preencha nome e instância');
      return;
    }
    setIsCreatingInbox(true);
    try {
      const { error } = await supabase.from('inboxes').insert({
        name: newInboxName.trim(),
        instance_id: selectedInstanceId,
        created_by: user!.id,
        webhook_url: webhookUrl.trim() || null,
        webhook_outgoing_url: webhookOutgoingUrl.trim() || null,
      } as any);
      if (error) throw error;
      toast.success('Caixa criada!');
      setIsCreateInboxOpen(false);
      setNewInboxName(''); setSelectedInstanceId(''); setWebhookUrl(''); setWebhookOutgoingUrl('');
      fetchInboxes();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar caixa');
    } finally {
      setIsCreatingInbox(false);
    }
  };

  const handleDeleteInbox = async () => {
    if (!inboxToDelete) return;
    setIsDeletingInbox(true);
    try {
      await supabase.from('inbox_users').delete().eq('inbox_id', inboxToDelete.id);
      await supabase.from('labels').delete().eq('inbox_id', inboxToDelete.id);
      const { error } = await supabase.from('inboxes').delete().eq('id', inboxToDelete.id);
      if (error) throw error;
      toast.success('Caixa excluída');
      setInboxToDelete(null);
      fetchInboxes();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir');
    } finally {
      setIsDeletingInbox(false);
    }
  };

  const handleSaveWebhook = async (inboxId: string) => {
    setIsSavingWebhook(true);
    try {
      const { error } = await supabase.from('inboxes').update({ webhook_url: editWebhookValue.trim() || null } as any).eq('id', inboxId);
      if (error) throw error;
      toast.success('Webhook atualizado!');
      setEditingWebhookId(null);
      fetchInboxes();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleSaveOutgoing = async (inboxId: string) => {
    setIsSavingOutgoing(true);
    try {
      const { error } = await supabase.from('inboxes').update({ webhook_outgoing_url: editOutgoingValue.trim() || null } as any).eq('id', inboxId);
      if (error) throw error;
      toast.success('Webhook Outgoing atualizado!');
      setEditingOutgoingId(null);
      fetchInboxes();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSavingOutgoing(false);
    }
  };

  // ── Handlers: Users ────────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Email e senha são obrigatórios');
      return;
    }
    setIsCreatingUser(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newUserEmail, password: newUserPassword, full_name: newUserName, role: newUserRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao criar usuário');
      toast.success('Usuário criado!');
      setIsCreateUserOpen(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserRole('user');
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar usuário');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: AppRole) => {
    try {
      await supabase.from('user_roles').delete().eq('user_id', userId);
      await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
      toast.success('Papel atualizado!');
      fetchUsers();
    } catch {
      toast.error('Erro ao alterar papel');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userToDelete.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao excluir');
      toast.success('Usuário excluído!');
      setUserToDelete(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // ── Handlers: Team ─────────────────────────────────────────────────────────
  const handleRemoveMembership = async () => {
    if (!removeMembership) return;
    setIsRemovingMembership(true);
    try {
      const { error } = await supabase
        .from('inbox_users')
        .delete()
        .eq('user_id', removeMembership.userId)
        .eq('inbox_id', removeMembership.inboxId);
      if (error) throw error;
      toast.success('Membro removido da caixa');
      setRemoveMembership(null);
      fetchTeam();
    } catch {
      toast.error('Erro ao remover membro');
    } finally {
      setIsRemovingMembership(false);
    }
  };

  const openEditTeamUser = (u: InboxUser) => {
    setEditingTeamUser(u);
    setEditTeamName(u.full_name || '');
    setEditTeamEmail(u.email);
    setEditTeamPassword('');
    const inboxMap: Record<string, InboxRole> = {};
    u.memberships.forEach(m => { inboxMap[m.inbox_id] = m.role; });
    setEditTeamInboxes(inboxMap);
  };

  const handleEditTeamUser = async () => {
    if (!editingTeamUser) return;
    if (!editTeamEmail.trim()) {
      toast.error('Email é obrigatório');
      return;
    }
    if (editTeamPassword && editTeamPassword.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    setIsSavingTeamUser(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: editingTeamUser.id,
          email: editTeamEmail.trim(),
          full_name: editTeamName.trim(),
          ...(editTeamPassword ? { password: editTeamPassword } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao atualizar');
      // Sync inbox memberships
      const previousIds = editingTeamUser.memberships.map(m => m.inbox_id);
      const currentIds = new Set(Object.keys(editTeamInboxes));
      const toRemove = previousIds.filter(id => !currentIds.has(id));
      for (const inboxId of toRemove) {
        await supabase.from('inbox_users').delete().eq('user_id', editingTeamUser.id).eq('inbox_id', inboxId);
      }
      for (const [inboxId, role] of Object.entries(editTeamInboxes)) {
        const existing = editingTeamUser.memberships.find(m => m.inbox_id === inboxId);
        if (existing) {
          if (existing.role !== role) {
            await supabase.from('inbox_users').update({ role }).eq('user_id', editingTeamUser.id).eq('inbox_id', inboxId);
          }
        } else {
          await supabase.from('inbox_users').insert({ user_id: editingTeamUser.id, inbox_id: inboxId, role });
        }
      }
      toast.success('Atendente atualizado!');
      setEditingTeamUser(null);
      fetchTeam();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar atendente');
    } finally {
      setIsSavingTeamUser(false);
    }
  };

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredInboxes = inboxes.filter(
    i => i.name.toLowerCase().includes(inboxSearch.toLowerCase()) ||
         i.instance_name.toLowerCase().includes(inboxSearch.toLowerCase())
  );
  const filteredUsers = users.filter(
    u => u.email.toLowerCase().includes(usersSearch.toLowerCase()) ||
         u.full_name?.toLowerCase().includes(usersSearch.toLowerCase())
  );
  const filteredTeam = teamUsers.filter(
    u => u.email.toLowerCase().includes(teamSearch.toLowerCase()) ||
         u.full_name?.toLowerCase().includes(teamSearch.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Administração</h1>
            <p className="text-sm text-muted-foreground">Caixas, usuários e equipe de atendimento</p>
          </div>
        </div>

        {/* "Criar Novo" dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Criar Novo
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setIsCreateInboxOpen(true)}>
              <Inbox className="w-4 h-4 mr-2" />
              Nova Caixa de Entrada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsCreateUserOpen(true)}>
              <Shield className="w-4 h-4 mr-2" />
              Novo Usuário
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsCreateTeamUserOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Novo Membro de Atendimento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto no-scrollbar">
          <TabsTrigger value="inboxes" className="gap-2">
            <Inbox className="w-4 h-4" />
            <span>Caixas</span>
            <Badge variant="outline" className="ml-1 text-xs h-5 px-1.5">{inboxes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Shield className="w-4 h-4" />
            <span>Usuários</span>
            <Badge variant="outline" className="ml-1 text-xs h-5 px-1.5">{users.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Headphones className="w-4 h-4" />
            <span>Equipe</span>
            <Badge variant="outline" className="ml-1 text-xs h-5 px-1.5">{teamUsers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-2">
            <Users className="w-4 h-4" />
            <span>Departamentos</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2">
            <Briefcase className="w-4 h-4" />
            <span>Backup</span>
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: Caixas de Entrada                                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="inboxes" className="mt-6 space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar caixas..."
              className="pl-9"
              value={inboxSearch}
              onChange={e => setInboxSearch(e.target.value)}
            />
          </div>

          {inboxesLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : filteredInboxes.length === 0 ? (
            <EmptyState icon={Inbox} title="Nenhuma caixa encontrada" desc="Crie a primeira caixa de entrada" />
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredInboxes.map(inbox => (
                <AccordionItem
                  key={inbox.id}
                  value={inbox.id}
                  className="rounded-xl border border-border/50 bg-card/40 px-0 overflow-hidden"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                      {/* Status dot */}
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${inbox.instance_status === 'connected' ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
                      <div className="min-w-0 text-left">
                        <p className="font-semibold text-sm truncate">{inbox.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MonitorSmartphone className="w-3 h-3" />
                          {inbox.instance_name}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-auto mr-2 shrink-0 gap-1">
                        <Users className="w-3 h-3" />
                        {inbox.member_count}
                      </Badge>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4 space-y-4">
                    {/* Inbox ID */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Settings className="w-3 h-3" /> Inbox ID (para n8n)
                      </p>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                        <code className="text-xs text-muted-foreground truncate flex-1 font-mono">{inbox.id}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(inbox.id); toast.success('Inbox ID copiado!'); }}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Webhook URL */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Link className="w-3 h-3" /> Webhook Entrada (n8n)
                      </p>
                      {editingWebhookId === inbox.id ? (
                        <div className="flex gap-2">
                          <Input className="h-8 text-xs flex-1" value={editWebhookValue} onChange={e => setEditWebhookValue(e.target.value)} autoFocus placeholder="https://..." />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" disabled={isSavingWebhook} onClick={() => handleSaveWebhook(inbox.id)}>
                            {isSavingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingWebhookId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : inbox.webhook_url ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                          <span className="text-xs text-muted-foreground truncate flex-1">{inbox.webhook_url}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(inbox.webhook_url!); toast.success('Copiado!'); }}>
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setEditingWebhookId(inbox.id); setEditWebhookValue(inbox.webhook_url || ''); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8 text-xs w-full" onClick={() => { setEditingWebhookId(inbox.id); setEditWebhookValue(''); }}>
                          <Plus className="w-3 h-3 mr-1.5" /> Adicionar Webhook
                        </Button>
                      )}
                    </div>

                    {/* Webhook Outgoing */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Link className="w-3 h-3" /> Webhook Saída (outgoing)
                      </p>
                      {editingOutgoingId === inbox.id ? (
                        <div className="flex gap-2">
                          <Input className="h-8 text-xs flex-1" value={editOutgoingValue} onChange={e => setEditOutgoingValue(e.target.value)} autoFocus placeholder="https://..." />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" disabled={isSavingOutgoing} onClick={() => handleSaveOutgoing(inbox.id)}>
                            {isSavingOutgoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingOutgoingId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : inbox.webhook_outgoing_url ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                          <span className="text-xs text-muted-foreground truncate flex-1">{inbox.webhook_outgoing_url}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(inbox.webhook_outgoing_url!); toast.success('Copiado!'); }}>
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setEditingOutgoingId(inbox.id); setEditOutgoingValue(inbox.webhook_outgoing_url || ''); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8 text-xs w-full" onClick={() => { setEditingOutgoingId(inbox.id); setEditOutgoingValue(''); }}>
                          <Plus className="w-3 h-3 mr-1.5" /> Adicionar Webhook Saída
                        </Button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-border/30">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setManageInbox(inbox)}
                      >
                        <Users className="w-3.5 h-3.5 mr-1.5" />
                        Gerenciar Membros
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setInboxToDelete(inbox)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: Usuários                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="users" className="mt-6 space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              className="pl-9"
              value={usersSearch}
              onChange={e => setUsersSearch(e.target.value)}
            />
          </div>

          {usersLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuário encontrado" desc="Crie o primeiro usuário" />
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Instâncias</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, idx) => (
                      <tr key={u.id} className={`border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9 shrink-0">
                              <AvatarImage src={u.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                                {u.full_name?.charAt(0)?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{u.full_name || 'Sem nome'}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {/* Role badge com select inline */}
                          <Select value={u.app_role} onValueChange={(v) => handleChangeRole(u.id, v as AppRole)}>
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">
                                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> Super Admin</span>
                              </SelectItem>
                              <SelectItem value="gerente">
                                <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-info" /> Gerente</span>
                              </SelectItem>
                              <SelectItem value="user">
                                <span className="flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5 text-muted-foreground" /> Atendente</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-muted-foreground">
                            {u.instance_count === 0 ? (
                              <span className="text-xs italic">Nenhuma</span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs">
                                <MonitorSmartphone className="w-3.5 h-3.5" />
                                {u.instance_count} {u.instance_count === 1 ? 'instância' : 'instâncias'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => { setManageInstancesUser(u); setIsManageInstancesOpen(true); }}
                            >
                              <Settings className="w-3.5 h-3.5 mr-1" />
                              Instâncias
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setUserToDelete(u)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border/30">
                {filteredUsers.map(u => (
                  <div key={u.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="w-10 h-10 shrink-0">
                          <AvatarImage src={u.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {u.full_name?.charAt(0)?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.full_name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          u.app_role === 'super_admin'
                            ? 'gap-1 shrink-0 bg-primary/10 text-primary border-primary/20'
                            : u.app_role === 'gerente'
                            ? 'gap-1 shrink-0 bg-info/10 text-info border-info/20'
                            : 'gap-1 shrink-0 bg-muted text-muted-foreground border-border'
                        }
                      >
                        {u.app_role === 'super_admin'
                          ? <><Shield className="w-3 h-3" /> Admin</>
                          : u.app_role === 'gerente'
                          ? <><Briefcase className="w-3 h-3" /> Gerente</>
                          : <><Headphones className="w-3 h-3" /> Atendente</>}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={u.app_role} onValueChange={(v) => handleChangeRole(u.id, v as AppRole)}>
                        <SelectTrigger className="flex-1 h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">
                            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> Super Admin</span>
                          </SelectItem>
                          <SelectItem value="gerente">
                            <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-info" /> Gerente</span>
                          </SelectItem>
                          <SelectItem value="user">
                            <span className="flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5 text-muted-foreground" /> Atendente</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => { setManageInstancesUser(u); setIsManageInstancesOpen(true); }}>
                        <Settings className="w-3.5 h-3.5 mr-1" /> Instâncias
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" onClick={() => setUserToDelete(u)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: Equipe                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="team" className="mt-6 space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar membros..."
              className="pl-9"
              value={teamSearch}
              onChange={e => setTeamSearch(e.target.value)}
            />
          </div>

          {teamLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : filteredTeam.length === 0 ? (
            <EmptyState icon={Headphones} title="Nenhum membro na equipe" desc="Adicione membros às caixas de atendimento" />
          ) : (
            <div className="space-y-3">
              {filteredTeam.map(u => (
                <div key={u.id} className="p-4 rounded-xl border border-border/50 bg-card/40 space-y-3">
                  {/* User header */}
                   <div className="flex items-center gap-3">
                     <Avatar className="w-10 h-10">
                       <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                         {u.full_name?.charAt(0)?.toUpperCase() || 'U'}
                       </AvatarFallback>
                     </Avatar>
                     <div className="min-w-0 flex-1">
                       <p className="font-semibold text-sm truncate">{u.full_name || 'Sem nome'}</p>
                       <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                       <div className="flex items-center gap-1 mt-0.5">
                         <span className="text-[10px] font-mono text-muted-foreground truncate">ID: {u.id}</span>
                         <button
                           type="button"
                           className="text-muted-foreground hover:text-foreground transition-colors"
                           onClick={() => {
                             navigator.clipboard.writeText(u.id);
                             toast.success('ID copiado!');
                           }}
                         >
                           <Copy className="w-3 h-3" />
                         </button>
                       </div>
                     </div>
                     <Button
                       variant="ghost"
                       size="icon"
                       className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                       onClick={() => openEditTeamUser(u)}
                     >
                       <Pencil className="w-4 h-4" />
                     </Button>
                   </div>

                  {/* Memberships */}
                  <div className="space-y-1.5">
                    {u.memberships.map(m => (
                      <div key={m.inbox_id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Inbox className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{m.inbox_name}</span>
                          {m.instance_name && (
                            <span className="text-xs text-muted-foreground hidden sm:inline">({m.instance_name})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={ROLE_COLORS[m.role]}>
                            {ROLE_LABELS[m.role]}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setRemoveMembership({ userId: u.id, inboxId: m.inbox_id, userName: u.full_name || u.email, inboxName: m.inbox_name })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Departments */}
                  {u.departments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">Departamentos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {u.departments.map(d => (
                          <Badge key={d.id} variant="outline" className="gap-1 text-xs bg-primary/5 text-primary border-primary/20">
                            <Building2 className="w-3 h-3" />
                            {d.name}
                            {d.is_default && <span className="text-[9px] opacity-60">(padrão)</span>}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: Departamentos                                                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="departments" className="mt-6">
          <DepartmentsTab />
        </TabsContent>

        {/* TAB: Backup                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="backup" className="mt-6">
          <BackupModule />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}

      {/* Create Inbox */}
      <Dialog open={isCreateInboxOpen} onOpenChange={setIsCreateInboxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Caixa de Entrada</DialogTitle>
            <DialogDescription>Vincule uma caixa a uma instância WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Ex: Suporte, Vendas..." value={newInboxName} onChange={e => setNewInboxName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Instância WhatsApp *</Label>
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {instances.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${inst.status === 'connected' ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
                        {inst.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Webhook URL (n8n)</Label>
              <Input placeholder="https://seu-n8n.com/webhook/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Webhook Outgoing URL</Label>
              <Input placeholder="https://seu-n8n.com/webhook/outgoing..." value={webhookOutgoingUrl} onChange={e => setWebhookOutgoingUrl(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateInboxOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateInbox} disabled={isCreatingInbox}>
              {isCreatingInbox ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>Crie uma conta de usuário no sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input placeholder="Nome do usuário" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" placeholder="email@exemplo.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input type="password" placeholder="Mínimo 6 caracteres" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Perfil de Acesso *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'super_admin', label: 'Super Admin', desc: 'Acesso total ao sistema', Icon: Shield },
                  { value: 'gerente', label: 'Gerente', desc: 'Atendimento e CRM', Icon: Briefcase },
                  { value: 'user', label: 'Atendente', desc: 'Apenas suas caixas', Icon: Headphones },
                ] as { value: AppRole; label: string; desc: string; Icon: React.ElementType }[]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewUserRole(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${
                      newUserRole === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <opt.Icon className={`w-5 h-5 ${newUserRole === opt.value ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold leading-tight">{opt.label}</span>
                    <span className="text-[10px] opacity-70 leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateUserOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={isCreatingUser}>
              {isCreatingUser ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Inbox */}
      <AlertDialog open={!!inboxToDelete} onOpenChange={open => !open && setInboxToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Excluir caixa de entrada?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{inboxToDelete?.name}</strong> e todos seus membros e etiquetas serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInbox} disabled={isDeletingInbox} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeletingInbox ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User */}
      <AlertDialog open={!!userToDelete} onOpenChange={open => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Excluir usuário?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{userToDelete?.full_name || userToDelete?.email}</strong> será excluído permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={isDeletingUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeletingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Membership */}
      <AlertDialog open={!!removeMembership} onOpenChange={open => !open && setRemoveMembership(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Remover membro da caixa?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeMembership && (
                <><strong>{removeMembership.userName}</strong> será removido de <strong>{removeMembership.inboxName}</strong>. A conta não será excluída.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMembership} disabled={isRemovingMembership} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isRemovingMembership ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Inbox Members */}
      {manageInbox && (
        <ManageInboxUsersDialog
          open={!!manageInbox}
          onOpenChange={open => !open && setManageInbox(null)}
          inboxId={manageInbox.id}
          inboxName={manageInbox.name}
          onUpdate={() => { fetchInboxes(); fetchTeam(); }}
        />
      )}

      {/* Manage User Instances */}
      <ManageUserInstancesDialog
        open={isManageInstancesOpen}
        onOpenChange={setIsManageInstancesOpen}
        user={manageInstancesUser}
        onSave={fetchUsers}
      />

      {/* Create Team Member */}
      <CreateInboxUserDialog
        open={isCreateTeamUserOpen}
        onOpenChange={setIsCreateTeamUserOpen}
        onCreated={() => { fetchTeam(); fetchUsers(); }}
      />

      {/* Edit Team User */}
      <Dialog open={!!editingTeamUser} onOpenChange={open => !open && setEditingTeamUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Atendente</DialogTitle>
            <DialogDescription>Altere nome, email ou senha do atendente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input placeholder="Nome completo" value={editTeamName} onChange={e => setEditTeamName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" placeholder="email@exemplo.com" value={editTeamEmail} onChange={e => setEditTeamEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input type="password" placeholder="Deixe vazio para manter atual" value={editTeamPassword} onChange={e => setEditTeamPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Caixas de Entrada</Label>
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3">
                {inboxes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma caixa disponível</p>
                ) : (
                  inboxes.map(inbox => {
                    const isChecked = inbox.id in editTeamInboxes;
                    return (
                      <div key={inbox.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            setEditTeamInboxes(prev => {
                              if (e.target.checked) return { ...prev, [inbox.id]: 'agente' };
                              const { [inbox.id]: _, ...rest } = prev;
                              return rest;
                            });
                          }}
                          className="h-4 w-4 rounded border-primary"
                        />
                        <span className="text-sm flex-1 truncate">{inbox.name} <span className="text-muted-foreground">({inbox.instance_name})</span></span>
                        {isChecked && (
                          <Select value={editTeamInboxes[inbox.id]} onValueChange={(v: InboxRole) => setEditTeamInboxes(prev => ({ ...prev, [inbox.id]: v }))}>
                            <SelectTrigger className="w-28 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="gestor">Gestor</SelectItem>
                              <SelectItem value="agente">Agente</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTeamUser(null)}>Cancelar</Button>
            <Button onClick={handleEditTeamUser} disabled={isSavingTeamUser}>
              {isSavingTeamUser ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState = ({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-muted-foreground" />
    </div>
    <h3 className="font-semibold mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground">{desc}</p>
  </div>
);

export default AdminPanel;
