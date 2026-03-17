import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { edgeFunctionFetch } from '@/lib/edgeFunctionClient';
import { CopyableId } from '@/components/shared/CopyableId';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  Search, Inbox, Loader2, Trash2, User, Headphones, Pencil, Mail, Building2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import CreateInboxUserDialog from '@/components/dashboard/CreateInboxUserDialog';
import type { Database } from '@/integrations/supabase/types';

type InboxRole = Database['public']['Enums']['inbox_role'];

const ROLE_LABELS: Record<InboxRole, string> = { admin: 'Admin', gestor: 'Gestor', agente: 'Agente' };
const ROLE_COLORS: Record<InboxRole, string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  gestor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  agente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

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

interface InboxSimple {
  id: string;
  name: string;
  instance_name: string;
}

interface Props {
  onUsersChanged?: () => void;
}

const TeamTab: React.FC<Props> = ({ onUsersChanged }) => {
  const [teamUsers, setTeamUsers] = useState<InboxUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamSearch, setTeamSearch] = useState('');
  const [inboxes, setInboxes] = useState<InboxSimple[]>([]);

  // Create
  const [isCreateTeamUserOpen, setIsCreateTeamUserOpen] = useState(false);

  // Remove membership
  const [removeMembership, setRemoveMembership] = useState<{ userId: string; inboxId: string; userName: string; inboxName: string } | null>(null);
  const [isRemovingMembership, setIsRemovingMembership] = useState(false);

  // Edit
  const [editingTeamUser, setEditingTeamUser] = useState<InboxUser | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamEmail, setEditTeamEmail] = useState('');
  const [editTeamPassword, setEditTeamPassword] = useState('');
  const [isSavingTeamUser, setIsSavingTeamUser] = useState(false);
  const [editTeamInboxes, setEditTeamInboxes] = useState<Record<string, InboxRole>>({});

  // ── Fetch ──────────────────────────────────────────────────────────────────

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

      // Build inbox list for edit dialog
      setInboxes(inboxesList.map(ib => ({
        id: ib.id,
        name: ib.name,
        instance_name: instanceMap.get(ib.instance_id)?.name || '',
      })));

      setTeamUsers(profiles.filter(p => userIdsWithInbox.has(p.id)).map(profile => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        memberships: inboxUsers.filter(iu => iu.user_id === profile.id).map(iu => {
          const inbox = inboxMap.get(iu.inbox_id);
          const instance = inbox ? instanceMap.get(inbox.instance_id) : undefined;
          return { inbox_id: iu.inbox_id, inbox_name: inbox?.name || 'Desconhecida', instance_name: instance?.name || '', role: iu.role as InboxRole };
        }),
        departments: deptMembers.filter(dm => dm.user_id === profile.id).map(dm => {
          const dept = deptMap.get(dm.department_id);
          if (!dept) return null;
          const inbox = inboxMap.get(dept.inbox_id);
          return { id: dept.id, name: dept.name, inbox_name: inbox?.name || '', is_default: dept.is_default };
        }).filter(Boolean) as UserDepartment[],
      })));
    } catch {
      toast.error('Erro ao carregar equipe');
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRemoveMembership = async () => {
    if (!removeMembership) return;
    setIsRemovingMembership(true);
    try {
      const { error } = await supabase.from('inbox_users').delete().eq('user_id', removeMembership.userId).eq('inbox_id', removeMembership.inboxId);
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
    const map: Record<string, InboxRole> = {};
    u.memberships.forEach(m => { map[m.inbox_id] = m.role; });
    setEditTeamInboxes(map);
  };

  const handleEditTeamUser = async () => {
    if (!editingTeamUser) return;
    if (!editTeamEmail.trim()) { toast.error('Email é obrigatório'); return; }
    if (editTeamPassword && editTeamPassword.length < 6) { toast.error('A senha deve ter no mínimo 6 caracteres'); return; }
    setIsSavingTeamUser(true);
    try {
      await edgeFunctionFetch('admin-update-user', {
        user_id: editingTeamUser.id, email: editTeamEmail.trim(), full_name: editTeamName.trim(),
        ...(editTeamPassword ? { password: editTeamPassword } : {}),
      });
      const previousIds = editingTeamUser.memberships.map(m => m.inbox_id);
      const currentIds = new Set(Object.keys(editTeamInboxes));
      const toRemove = previousIds.filter(id => !currentIds.has(id));
      for (const inboxId of toRemove) {
        await supabase.from('inbox_users').delete().eq('user_id', editingTeamUser.id).eq('inbox_id', inboxId);
      }
      for (const [inboxId, role] of Object.entries(editTeamInboxes)) {
        const existing = editingTeamUser.memberships.find(m => m.inbox_id === inboxId);
        if (existing) {
          if (existing.role !== role) await supabase.from('inbox_users').update({ role }).eq('user_id', editingTeamUser.id).eq('inbox_id', inboxId);
        } else {
          await supabase.from('inbox_users').insert({ user_id: editingTeamUser.id, inbox_id: inboxId, role });
        }
      }
      toast.success('Atendente atualizado!');
      setEditingTeamUser(null);
      fetchTeam();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar atendente');
    } finally {
      setIsSavingTeamUser(false);
    }
  };

  const filteredTeam = teamUsers.filter(
    u => u.email.toLowerCase().includes(teamSearch.toLowerCase()) ||
         u.full_name?.toLowerCase().includes(teamSearch.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-tight">Equipe de Atendimento</h2>
          <p className="text-sm text-muted-foreground">Membros vinculados a caixas de entrada. Os IDs são usados para integrações (n8n, API).</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou email..." className="pl-9 h-11 text-sm" value={teamSearch} onChange={e => setTeamSearch(e.target.value)} />
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">{filteredTeam.length} {filteredTeam.length === 1 ? 'membro' : 'membros'}</span>
        </div>

        {teamLoading ? (
          <div className="grid gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
        ) : filteredTeam.length === 0 ? (
          <EmptyState icon={Headphones} title="Nenhum membro na equipe" desc="Adicione membros às caixas de atendimento" />
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="grid gap-4">
              {filteredTeam.map(u => (
                <div key={u.id} className="group border border-border/40 bg-card/50 backdrop-blur-sm rounded-xl overflow-hidden hover:bg-card/80 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-11 h-11 ring-2 ring-background shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-base">{u.full_name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate">{u.full_name || 'Sem nome'}</h3>
                        <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0" />{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditTeamUser(u)}><Pencil className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Editar atendente</TooltipContent></Tooltip>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">ID do Atendente</p>
                      <CopyableId label="User ID" id={u.id} icon={User} />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Caixas de Entrada ({u.memberships.length})</p>
                      <div className="space-y-2">
                        {u.memberships.map(m => (
                          <div key={m.inbox_id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/20">
                            <div className="flex items-center gap-2 min-w-0">
                              <Inbox className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <span className="text-sm font-medium truncate block">{m.inbox_name}</span>
                                {m.instance_name && <span className="text-xs text-muted-foreground">{m.instance_name}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className={ROLE_COLORS[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setRemoveMembership({ userId: u.id, inboxId: m.inbox_id, userName: u.full_name || u.email, inboxName: m.inbox_name })}><Trash2 className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Remover desta caixa</TooltipContent></Tooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {u.departments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Departamentos ({u.departments.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {u.departments.map(d => (
                            <Tooltip key={d.id}>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="gap-1.5 text-sm py-1 px-2.5 bg-primary/5 text-primary border-primary/20 cursor-default">
                                  <Building2 className="w-3.5 h-3.5" />{d.name}{d.is_default && <span className="text-[10px] opacity-60">(padrão)</span>}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">Caixa: {d.inbox_name}</p><p className="text-xs font-mono opacity-70">ID: {d.id}</p></TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Remove Membership */}
      <AlertDialog open={!!removeMembership} onOpenChange={open => !open && setRemoveMembership(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Remover membro da caixa?</AlertDialogTitle>
            <AlertDialogDescription>{removeMembership && <><strong>{removeMembership.userName}</strong> será removido de <strong>{removeMembership.inboxName}</strong>. A conta não será excluída.</>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMembership} disabled={isRemovingMembership} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isRemovingMembership ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Team Member */}
      <CreateInboxUserDialog open={isCreateTeamUserOpen} onOpenChange={setIsCreateTeamUserOpen} onCreated={() => { fetchTeam(); onUsersChanged?.(); }} />

      {/* Edit Team User */}
      <Dialog open={!!editingTeamUser} onOpenChange={open => !open && setEditingTeamUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Atendente</DialogTitle><DialogDescription>Altere nome, email ou senha do atendente</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nome</Label><Input placeholder="Nome completo" value={editTeamName} onChange={e => setEditTeamName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="email@exemplo.com" value={editTeamEmail} onChange={e => setEditTeamEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Nova Senha</Label><Input type="password" placeholder="Deixe vazio para manter atual" value={editTeamPassword} onChange={e => setEditTeamPassword(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Caixas de Entrada</Label>
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3">
                {inboxes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma caixa disponível</p> : inboxes.map(inbox => {
                  const isChecked = inbox.id in editTeamInboxes;
                  return (
                    <div key={inbox.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={isChecked} onChange={e => {
                        setEditTeamInboxes(prev => {
                          if (e.target.checked) return { ...prev, [inbox.id]: 'agente' };
                          const { [inbox.id]: _, ...rest } = prev;
                          return rest;
                        });
                      }} className="h-4 w-4 rounded border-primary" />
                      <span className="text-sm flex-1 truncate">{inbox.name} <span className="text-muted-foreground">({inbox.instance_name})</span></span>
                      {isChecked && (
                        <Select value={editTeamInboxes[inbox.id]} onValueChange={(v: InboxRole) => setEditTeamInboxes(prev => ({ ...prev, [inbox.id]: v }))}>
                          <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="gestor">Gestor</SelectItem>
                            <SelectItem value="agente">Agente</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTeamUser(null)}>Cancelar</Button>
            <Button onClick={handleEditTeamUser} disabled={isSavingTeamUser}>{isSavingTeamUser ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeamTab;
export { TeamTab };
