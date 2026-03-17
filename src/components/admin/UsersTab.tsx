import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { edgeFunctionFetch } from '@/lib/edgeFunctionClient';
import { formatPhone } from '@/lib/phoneUtils';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Search, Inbox, Users, Loader2, Trash2, Settings, MonitorSmartphone, Shield, Pencil,
  Headphones, Mail, Briefcase, Building2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import ManageUserInstancesDialog from '@/components/dashboard/ManageUserInstancesDialog';
import type { Database } from '@/integrations/supabase/types';

type InboxRole = Database['public']['Enums']['inbox_role'];
type AppRole = 'super_admin' | 'gerente' | 'user';

const ROLE_LABELS: Record<InboxRole, string> = { admin: 'Admin', gestor: 'Gestor', agente: 'Agente' };

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
  inboxMemberships: { inbox_id: string; inbox_name: string; instance_name: string; role: InboxRole }[];
  departments: { id: string; name: string; inbox_name: string; is_default: boolean }[];
}

interface Props {
  onCreateUser?: () => void;
}

const UsersTab: React.FC<Props> = ({ onCreateUser }) => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersSearch, setUsersSearch] = useState('');

  // Create user
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('user');

  // Delete user
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Edit user
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Manage instances
  const [manageInstancesUser, setManageInstancesUser] = useState<UserWithRole | null>(null);
  const [isManageInstancesOpen, setIsManageInstancesOpen] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const [profilesRes, rolesRes, accessRes, instRes, inboxUsersRes, inboxesRes, deptMembersRes, deptsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_instance_access').select('user_id, instance_id'),
        supabase.from('instances').select('id, name, owner_jid'),
        supabase.from('inbox_users').select('user_id, inbox_id, role'),
        supabase.from('inboxes').select('id, name, instance_id'),
        supabase.from('department_members').select('user_id, department_id'),
        supabase.from('departments').select('id, name, inbox_id, is_default'),
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const access = accessRes.data || [];
      const instMap = new Map((instRes.data || []).map(i => [i.id, i]));
      const inboxUsers = inboxUsersRes.data || [];
      const inboxesList = inboxesRes.data || [];
      const inboxMap = new Map(inboxesList.map(ib => [ib.id, ib]));
      const deptMembers = deptMembersRes.data || [];
      const deptMap = new Map((deptsRes.data || []).map(d => [d.id, d]));

      const resolveRole = (userId: string): AppRole => {
        const userRoles = roles.filter(r => r.user_id === userId).map(r => r.role);
        if (userRoles.includes('super_admin')) return 'super_admin';
        if (userRoles.includes('gerente')) return 'gerente';
        return 'user';
      };

      setUsers(profiles.map(p => {
        const userAccess = access.filter(a => a.user_id === p.id);
        const userInstances = userAccess
          .map(a => { const i = instMap.get(a.instance_id); return i ? { id: i.id, name: i.name, phone: i.owner_jid } : null; })
          .filter(Boolean) as UserWithRole['instances'];
        const role = resolveRole(p.id);
        const inboxMemberships = inboxUsers.filter(iu => iu.user_id === p.id).map(iu => {
          const inbox = inboxMap.get(iu.inbox_id);
          const instance = inbox ? instMap.get(inbox.instance_id) : undefined;
          return { inbox_id: iu.inbox_id, inbox_name: inbox?.name || 'Desconhecida', instance_name: instance?.name || '', role: iu.role as InboxRole };
        });
        const departments = deptMembers.filter(dm => dm.user_id === p.id).map(dm => {
          const dept = deptMap.get(dm.department_id);
          if (!dept) return null;
          const inbox = inboxMap.get(dept.inbox_id);
          return { id: dept.id, name: dept.name, inbox_name: inbox?.name || '', is_default: dept.is_default };
        }).filter(Boolean) as UserWithRole['departments'];
        return { ...p, is_super_admin: role === 'super_admin', app_role: role, instance_count: userInstances.length, instances: userInstances, inboxMemberships, departments };
      }));
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserPassword.trim()) { toast.error('Email e senha são obrigatórios'); return; }
    setIsCreatingUser(true);
    try {
      await edgeFunctionFetch('admin-create-user', { email: newUserEmail, password: newUserPassword, full_name: newUserName, role: newUserRole });
      toast.success('Usuário criado!');
      setIsCreateUserOpen(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserRole('user');
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar usuário');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const openEditUser = (u: UserWithRole) => {
    setEditingUser(u); setEditUserName(u.full_name || ''); setEditUserEmail(u.email); setEditUserPassword('');
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    if (!editUserEmail.trim()) { toast.error('Email é obrigatório'); return; }
    if (editUserPassword && editUserPassword.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }
    setIsSavingUser(true);
    try {
      await edgeFunctionFetch('admin-update-user', {
        user_id: editingUser.id, email: editUserEmail.trim(), full_name: editUserName.trim(),
        ...(editUserPassword ? { password: editUserPassword } : {}),
      });
      toast.success('Usuário atualizado!');
      setEditingUser(null);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar usuário');
    } finally {
      setIsSavingUser(false);
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
      await edgeFunctionFetch('admin-delete-user', { user_id: userToDelete.id });
      toast.success('Usuário excluído!');
      setUserToDelete(null);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const filteredUsers = users.filter(
    u => u.email.toLowerCase().includes(usersSearch.toLowerCase()) ||
         u.full_name?.toLowerCase().includes(usersSearch.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar usuários..." className="pl-9" value={usersSearch} onChange={e => setUsersSearch(e.target.value)} />
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">{filteredUsers.length} {filteredUsers.length === 1 ? 'usuário' : 'usuários'}</span>
        </div>

        {usersLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum usuário encontrado" desc="Crie o primeiro usuário" />
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="space-y-3">
              {filteredUsers.map(u => (
                <div key={u.id} className="group p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card/60 transition-all duration-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 shrink-0 ring-2 ring-background">
                      <AvatarImage src={u.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{u.full_name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{u.full_name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" />{u.email}</p>
                    </div>
                    <Select value={u.app_role} onValueChange={(v) => handleChangeRole(u.id, v as AppRole)}>
                      <SelectTrigger className="h-8 w-32 sm:w-36 text-xs shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin"><span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> Super Admin</span></SelectItem>
                        <SelectItem value="gerente"><span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Gerente</span></SelectItem>
                        <SelectItem value="user"><span className="flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5" /> Atendente</span></SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEditUser(u)}><Pencil className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom"><p>Editar usuário</p></TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => { setManageInstancesUser(u); setIsManageInstancesOpen(true); }}><Settings className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom"><p>Gerenciar instâncias</p></TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10" onClick={() => setUserToDelete(u)}><Trash2 className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent side="bottom"><p>Excluir usuário</p></TooltipContent></Tooltip>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-[52px]">
                    <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border/30 text-xs text-muted-foreground cursor-default"><MonitorSmartphone className="w-3 h-3 shrink-0" /><span>{u.instance_count} {u.instance_count === 1 ? 'instância' : 'instâncias'}</span></div></TooltipTrigger><TooltipContent side="bottom" className="max-w-xs">{u.instances.length === 0 ? <p>Nenhuma instância atribuída</p> : <div className="space-y-1">{u.instances.map(i => <p key={i.id} className="text-xs">{i.name}{i.phone ? ` • ${formatPhone(i.phone)}` : ''}</p>)}</div>}</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border/30 text-xs text-muted-foreground cursor-default"><Inbox className="w-3 h-3 shrink-0" /><span>{u.inboxMemberships.length} {u.inboxMemberships.length === 1 ? 'caixa' : 'caixas'}</span></div></TooltipTrigger><TooltipContent side="bottom" className="max-w-xs">{u.inboxMemberships.length === 0 ? <p>Sem vínculo com caixas</p> : <div className="space-y-1">{u.inboxMemberships.map(m => <p key={m.inbox_id} className="text-xs flex items-center gap-1">{m.inbox_name} <span className="opacity-60">({ROLE_LABELS[m.role]})</span></p>)}</div>}</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border/30 text-xs text-muted-foreground cursor-default"><Building2 className="w-3 h-3 shrink-0" /><span>{u.departments.length} {u.departments.length === 1 ? 'departamento' : 'departamentos'}</span></div></TooltipTrigger><TooltipContent side="bottom" className="max-w-xs">{u.departments.length === 0 ? <p>Sem departamentos</p> : <div className="space-y-1">{u.departments.map(d => <p key={d.id} className="text-xs">{d.name} {d.is_default && <span className="opacity-60">(padrão)</span>}{d.inbox_name && <span className="opacity-60"> • {d.inbox_name}</span>}</p>)}</div>}</TooltipContent></Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Novo Usuário</DialogTitle><DialogDescription>Crie uma conta de usuário no sistema</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nome Completo</Label><Input placeholder="Nome do usuário" value={newUserName} onChange={e => setNewUserName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="email@exemplo.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Senha *</Label><Input type="password" placeholder="Mínimo 6 caracteres" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Perfil de Acesso *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'super_admin', label: 'Super Admin', desc: 'Acesso total ao sistema', Icon: Shield },
                  { value: 'gerente', label: 'Gerente', desc: 'Atendimento e CRM', Icon: Briefcase },
                  { value: 'user', label: 'Atendente', desc: 'Apenas suas caixas', Icon: Headphones },
                ] as { value: AppRole; label: string; desc: string; Icon: React.ElementType }[]).map(opt => (
                  <button key={opt.value} type="button" onClick={() => setNewUserRole(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${newUserRole === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40'}`}>
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
            <Button onClick={handleCreateUser} disabled={isCreatingUser}>{isCreatingUser ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Criar Usuário'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User */}
      <AlertDialog open={!!userToDelete} onOpenChange={open => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription><strong>{userToDelete?.full_name || userToDelete?.email}</strong> será excluído permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={isDeletingUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isDeletingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User */}
      <Dialog open={!!editingUser} onOpenChange={open => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle><DialogDescription>Altere nome, email ou senha do usuário</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nome</Label><Input placeholder="Nome completo" value={editUserName} onChange={e => setEditUserName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="email@exemplo.com" value={editUserEmail} onChange={e => setEditUserEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Nova Senha</Label><Input type="password" placeholder="Deixe vazio para manter atual" value={editUserPassword} onChange={e => setEditUserPassword(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleEditUser} disabled={isSavingUser}>{isSavingUser ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Instances */}
      <ManageUserInstancesDialog open={isManageInstancesOpen} onOpenChange={setIsManageInstancesOpen} user={manageInstancesUser} onSave={fetchUsers} />
    </>
  );
};

export default UsersTab;
export { UsersTab };
