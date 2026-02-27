import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Search, Plus, Trash2, Pencil, Copy, Star, Users, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

interface Department {
  id: string;
  name: string;
  description: string | null;
  inbox_id: string;
  is_default: boolean;
  created_at: string;
  inbox_name?: string;
  member_count?: number;
  members?: { user_id: string; full_name: string }[];
}

interface InboxOption {
  id: string;
  name: string;
}

interface AgentOption {
  user_id: string;
  full_name: string;
  inbox_id: string;
}

const DepartmentsTab = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inboxes, setInboxes] = useState<InboxOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInboxId, setFormInboxId] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formMembers, setFormMembers] = useState<Set<string>>(new Set());

  // Delete
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const { data: depts, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      if (error) throw error;

      const { data: inboxData } = await supabase.from('inboxes').select('id, name');
      const inboxMap = new Map((inboxData || []).map(i => [i.id, i.name]));

      const deptIds = (depts || []).map(d => d.id);
      let membersData: any[] = [];
      if (deptIds.length > 0) {
        const { data } = await supabase
          .from('department_members')
          .select('department_id, user_id')
          .in('department_id', deptIds);
        membersData = data || [];
      }

      // Get member names
      const userIds = [...new Set(membersData.map(m => m.user_id))];
      let profilesMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds);
        profilesMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.id]));
      }

      const membersByDept = new Map<string, { user_id: string; full_name: string }[]>();
      membersData.forEach(m => {
        if (!membersByDept.has(m.department_id)) membersByDept.set(m.department_id, []);
        membersByDept.get(m.department_id)!.push({
          user_id: m.user_id,
          full_name: profilesMap.get(m.user_id) || m.user_id,
        });
      });

      setDepartments((depts || []).map(d => ({
        ...d,
        inbox_name: inboxMap.get(d.inbox_id) || 'Desconhecida',
        member_count: membersByDept.get(d.id)?.length || 0,
        members: membersByDept.get(d.id) || [],
      })));
    } catch {
      toast.error('Erro ao carregar departamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInboxes = useCallback(async () => {
    const { data } = await supabase.from('inboxes').select('id, name').order('name');
    setInboxes(data || []);
  }, []);

  const fetchAgents = useCallback(async () => {
    const { data: inboxUsers } = await supabase.from('inbox_users').select('user_id, inbox_id');
    if (!inboxUsers?.length) { setAgents([]); return; }
    const userIds = [...new Set(inboxUsers.map(iu => iu.user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds);
    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.id]));
    setAgents(inboxUsers.map(iu => ({
      user_id: iu.user_id,
      full_name: profileMap.get(iu.user_id) || iu.user_id,
      inbox_id: iu.inbox_id,
    })));
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchInboxes();
    fetchAgents();
  }, [fetchDepartments, fetchInboxes, fetchAgents]);

  const openCreate = () => {
    setEditingDept(null);
    setFormName('');
    setFormDescription('');
    setFormInboxId(inboxes[0]?.id || '');
    setFormIsDefault(false);
    setFormMembers(new Set());
    setIsFormOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormName(dept.name);
    setFormDescription(dept.description || '');
    setFormInboxId(dept.inbox_id);
    setFormIsDefault(dept.is_default);
    setFormMembers(new Set(dept.members?.map(m => m.user_id) || []));
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formInboxId) {
      toast.error('Nome e caixa são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      let deptId: string;
      if (editingDept) {
        const { error } = await supabase
          .from('departments')
          .update({
            name: formName.trim(),
            description: formDescription.trim() || null,
            inbox_id: formInboxId,
            is_default: formIsDefault,
          } as any)
          .eq('id', editingDept.id);
        if (error) throw error;
        deptId = editingDept.id;
      } else {
        const { data, error } = await supabase
          .from('departments')
          .insert({
            name: formName.trim(),
            description: formDescription.trim() || null,
            inbox_id: formInboxId,
            is_default: formIsDefault,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        deptId = data.id;
      }

      // Sync members
      await supabase.from('department_members').delete().eq('department_id', deptId);
      if (formMembers.size > 0) {
        const rows = Array.from(formMembers).map(userId => ({
          department_id: deptId,
          user_id: userId,
        }));
        const { error: memErr } = await supabase.from('department_members').insert(rows as any);
        if (memErr) throw memErr;
      }

      toast.success(editingDept ? 'Departamento atualizado!' : 'Departamento criado!');
      setIsFormOpen(false);
      fetchDepartments();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deptToDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('departments').delete().eq('id', deptToDelete.id);
      if (error) throw error;
      toast.success('Departamento excluído');
      setDeptToDelete(null);
      fetchDepartments();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (dept: Department) => {
    try {
      const { error } = await supabase
        .from('departments')
        .update({ is_default: true } as any)
        .eq('id', dept.id);
      if (error) throw error;
      toast.success(`"${dept.name}" definido como padrão`);
      fetchDepartments();
    } catch {
      toast.error('Erro ao definir padrão');
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('ID copiado!');
  };

  const filteredDepts = departments.filter(
    d => d.name.toLowerCase().includes(search.toLowerCase()) ||
         d.inbox_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Agents for the selected inbox in the form
  const inboxAgents = agents.filter(a => a.inbox_id === formInboxId);
  // Deduplicate by user_id
  const uniqueInboxAgents = Array.from(new Map(inboxAgents.map(a => [a.user_id, a])).values());

  return (
    <div className="space-y-4">
      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar departamentos..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Departamento
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filteredDepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">Nenhum departamento encontrado</h3>
          <p className="text-sm text-muted-foreground">Crie o primeiro departamento</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDepts.map(dept => (
            <div
              key={dept.id}
              className="border border-border/50 bg-card/60 rounded-xl p-4 hover:bg-card/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm">{dept.name}</h3>
                    {dept.is_default && (
                      <Badge variant="outline" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/30 gap-0.5">
                        <Star className="w-2.5 h-2.5" />
                        Padrão
                      </Badge>
                    )}
                  </div>
                  {dept.description && (
                    <p className="text-xs text-muted-foreground mb-1.5">{dept.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Inbox className="w-3 h-3" />
                      {dept.inbox_name}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {dept.member_count} agente{dept.member_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* UUID */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <code className="text-[10px] text-muted-foreground/70 font-mono bg-muted/30 px-1.5 py-0.5 rounded select-all">
                      {dept.id}
                    </code>
                    <button
                      onClick={() => copyId(dept.id)}
                      className="text-muted-foreground/60 hover:text-primary transition-colors"
                      title="Copiar ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Members list */}
                  {dept.members && dept.members.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {dept.members.map(m => (
                        <Badge key={m.user_id} variant="secondary" className="text-[10px] h-5">
                          {m.full_name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!dept.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleSetDefault(dept)}
                      title="Definir como padrão"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(dept)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeptToDelete(dept)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDept ? 'Editar Departamento' : 'Novo Departamento'}</DialogTitle>
            <DialogDescription>
              {editingDept ? 'Atualize as informações do departamento' : 'Crie um novo departamento para organizar atendimentos'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Vendas" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Descrição do departamento"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Caixa de Entrada *</Label>
              <Select value={formInboxId} onValueChange={v => { setFormInboxId(v); setFormMembers(new Set()); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a caixa" />
                </SelectTrigger>
                <SelectContent>
                  {inboxes.map(ib => (
                    <SelectItem key={ib.id} value={ib.id}>{ib.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-default"
                checked={formIsDefault}
                onCheckedChange={v => setFormIsDefault(v === true)}
              />
              <Label htmlFor="is-default" className="cursor-pointer">Departamento padrão</Label>
            </div>
            {/* Agent assignment */}
            {formInboxId && (
              <div className="space-y-1.5">
                <Label>Agentes ({formMembers.size} selecionado{formMembers.size !== 1 ? 's' : ''})</Label>
                {uniqueInboxAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum agente nesta caixa</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-border/50 rounded-lg p-2 space-y-1">
                    {uniqueInboxAgents.map(agent => (
                      <label
                        key={agent.user_id}
                        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-secondary/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={formMembers.has(agent.user_id)}
                          onCheckedChange={checked => {
                            const next = new Set(formMembers);
                            if (checked) next.add(agent.user_id);
                            else next.delete(agent.user_id);
                            setFormMembers(next);
                          }}
                        />
                        <span className="text-sm">{agent.full_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editingDept ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deptToDelete} onOpenChange={open => !open && setDeptToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir departamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deptToDelete?.name}"? As conversas atribuídas ficarão sem departamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DepartmentsTab;
