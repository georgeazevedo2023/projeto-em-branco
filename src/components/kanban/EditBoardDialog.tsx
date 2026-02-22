import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Users, Lock, UserPlus, Pencil, Eye, MessageSquare, Search, X, Database } from 'lucide-react';

interface KanbanBoard {
  id: string;
  name: string;
  description: string | null;
  visibility: 'shared' | 'private';
  inbox_id: string | null;
  instance_id: string | null;
}

interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  automation_enabled: boolean;
  automation_message: string | null;
}

interface KanbanField {
  id: string;
  name: string;
  field_type: 'text' | 'currency' | 'date' | 'select' | 'entity_select';
  options: string[] | null;
  position: number;
  is_primary: boolean;
  required: boolean;
  show_on_card: boolean;
  entity_id?: string | null;
}

interface Inbox {
  id: string;
  name: string;
  instance_id: string;
}

interface BoardMember {
  id: string;
  user_id: string;
  role: 'editor' | 'viewer';
  full_name: string | null;
  email: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
}

interface KanbanEntity {
  id: string;
  name: string;
  position: number;
  values: KanbanEntityValue[];
}

interface KanbanEntityValue {
  id: string;
  label: string;
  position: number;
}

interface EditBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: KanbanBoard;
  inboxes: Inbox[];
  onSaved: () => void;
}

const COLUMN_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

const FIELD_TYPES = [
  { value: 'text', label: 'Texto Curto' },
  { value: 'currency', label: 'Moeda (R$)' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'entity_select', label: 'Entidade' },
];

export function EditBoardDialog({ open, onOpenChange, board, inboxes, onSaved }: EditBoardDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description || '');
  const [visibility, setVisibility] = useState<'shared' | 'private'>(board.visibility);
  const [inboxId, setInboxId] = useState<string>(board.inbox_id || 'none');
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [fields, setFields] = useState<KanbanField[]>([]);
  const [entities, setEntities] = useState<KanbanEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Access tab state
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'editor' | 'viewer'>('editor');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [inboxMemberCount, setInboxMemberCount] = useState<number>(0);
  const [inboxName, setInboxName] = useState<string>('');

  useEffect(() => {
    if (open && board.id) {
      loadBoardData();
    }
  }, [open, board.id]);

  const loadBoardData = async () => {
    setLoading(true);
    const [colRes, fieldRes] = await Promise.all([
      supabase.from('kanban_columns').select('*').eq('board_id', board.id).order('position'),
      supabase.from('kanban_fields').select('*').eq('board_id', board.id).order('position'),
    ]);
    if (colRes.data) setColumns(colRes.data as KanbanColumn[]);
    if (fieldRes.data) {
      setFields(fieldRes.data.map(f => ({
        ...f,
        options: f.options ? (f.options as string[]) : null,
        show_on_card: (f as any).show_on_card ?? false,
        entity_id: (f as any).entity_id ?? null,
      })) as KanbanField[]);
    }

    // Load access data + entities
    await Promise.all([loadMembers(), loadAllUsers(), loadInboxInfo(), loadEntities()]);
    setLoading(false);
  };

  const loadEntities = async () => {
    const { data: entitiesData } = await supabase
      .from('kanban_entities')
      .select('*')
      .eq('board_id', board.id)
      .order('position');

    if (!entitiesData || entitiesData.length === 0) {
      setEntities([]);
      return;
    }

    const entityIds = entitiesData.map(e => e.id);
    const { data: valuesData } = await supabase
      .from('kanban_entity_values')
      .select('*')
      .in('entity_id', entityIds)
      .order('position');

    const valuesMap: Record<string, KanbanEntityValue[]> = {};
    (valuesData || []).forEach(v => {
      if (!valuesMap[v.entity_id]) valuesMap[v.entity_id] = [];
      valuesMap[v.entity_id].push({ id: v.id, label: v.label, position: v.position });
    });

    setEntities(entitiesData.map(e => ({
      id: e.id,
      name: e.name,
      position: e.position,
      values: valuesMap[e.id] || [],
    })));
  };

  const loadMembers = async () => {
    const { data } = await supabase
      .from('kanban_board_members')
      .select('id, user_id, role')
      .eq('board_id', board.id);

    if (!data || data.length === 0) { setMembers([]); return; }

    const userIds = data.map(m => m.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    const profileMap: Record<string, UserProfile> = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    setMembers(data.map(m => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role as 'editor' | 'viewer',
      full_name: profileMap[m.user_id]?.full_name || null,
      email: profileMap[m.user_id]?.email || '',
    })));
  };

  const loadAllUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .order('full_name');
    setAllUsers((data || []) as UserProfile[]);
  };

  const loadInboxInfo = async () => {
    if (!board.inbox_id) return;
    const [inboxRes, membersRes] = await Promise.all([
      supabase.from('inboxes').select('name').eq('id', board.inbox_id).single(),
      supabase.from('inbox_users').select('id', { count: 'exact', head: true }).eq('inbox_id', board.inbox_id),
    ]);
    if (inboxRes.data) setInboxName(inboxRes.data.name);
    setInboxMemberCount(membersRes.count ?? 0);
  };

  // ── Columns ──────────────────────────────────────────────
  const addColumn = () => {
    const newCol: KanbanColumn = {
      id: `new_${Date.now()}`,
      name: 'Nova Coluna',
      color: COLUMN_COLORS[columns.length % COLUMN_COLORS.length],
      position: columns.length,
      automation_enabled: false,
      automation_message: null,
    };
    setColumns(prev => [...prev, newCol]);
  };

  const updateColumn = (id: string, patch: Partial<KanbanColumn>) => {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const removeColumn = (id: string) => {
    setColumns(prev => prev.filter(c => c.id !== id));
  };

  const moveColumn = (id: string, dir: 'up' | 'down') => {
    setColumns(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (dir === 'up' && idx === 0) return prev;
      if (dir === 'down' && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  // ── Fields ───────────────────────────────────────────────
  const addField = () => {
    const newField: KanbanField = {
      id: `new_${Date.now()}`,
      name: 'Novo Campo',
      field_type: 'text',
      options: null,
      position: fields.length,
      is_primary: fields.length === 0,
      required: false,
      show_on_card: false,
      entity_id: null,
    };
    setFields(prev => [...prev, newField]);
  };

  const updateField = (id: string, patch: Partial<KanbanField>) => {
    setFields(prev => prev.map(f => {
      if (f.id === id) return { ...f, ...patch };
      if (patch.is_primary && f.id !== id) return { ...f, is_primary: false };
      return f;
    }));
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const moveField = (id: string, dir: 'up' | 'down') => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (dir === 'up' && idx === 0) return prev;
      if (dir === 'down' && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  // ── Entities ─────────────────────────────────────────────
  const addEntity = () => {
    setEntities(prev => [...prev, {
      id: `new_${Date.now()}`,
      name: 'Nova Entidade',
      position: prev.length,
      values: [],
    }]);
  };

  const updateEntity = (id: string, name: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, name } : e));
  };

  const removeEntity = (id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
    // Clear entity_id from fields referencing this entity
    setFields(prev => prev.map(f => f.entity_id === id ? { ...f, entity_id: null, field_type: 'text' as const } : f));
  };

  const addEntityValue = (entityId: string) => {
    setEntities(prev => prev.map(e => {
      if (e.id !== entityId) return e;
      return {
        ...e,
        values: [...e.values, { id: `new_${Date.now()}`, label: '', position: e.values.length }],
      };
    }));
  };

  const updateEntityValue = (entityId: string, valueId: string, label: string) => {
    setEntities(prev => prev.map(e => {
      if (e.id !== entityId) return e;
      return {
        ...e,
        values: e.values.map(v => v.id === valueId ? { ...v, label } : v),
      };
    }));
  };

  const removeEntityValue = (entityId: string, valueId: string) => {
    setEntities(prev => prev.map(e => {
      if (e.id !== entityId) return e;
      return { ...e, values: e.values.filter(v => v.id !== valueId) };
    }));
  };

  // ── Members ──────────────────────────────────────────────
  const filteredUsers = allUsers.filter(u => {
    const alreadyMember = members.some(m => m.user_id === u.id);
    if (alreadyMember) return false;
    const q = userSearch.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const handleAddMember = async () => {
    if (!selectedUser) return;
    setAddingMember(true);

    const { error } = await supabase.from('kanban_board_members').insert({
      board_id: board.id,
      user_id: selectedUser.id,
      role: newMemberRole,
    });

    setAddingMember(false);
    if (error) {
      toast.error('Erro ao adicionar membro');
      return;
    }

    toast.success(`${selectedUser.full_name || selectedUser.email} adicionado(a)!`);
    setSelectedUser(null);
    setUserSearch('');
    loadMembers();
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    const { error } = await supabase.from('kanban_board_members').delete().eq('id', memberId);
    if (error) { toast.error('Erro ao remover membro'); return; }
    toast.success(`${memberName} removido(a)`);
    loadMembers();
  };

  const handleUpdateMemberRole = async (memberId: string, role: 'editor' | 'viewer') => {
    const { error } = await supabase.from('kanban_board_members').update({ role }).eq('id', memberId);
    if (error) { toast.error('Erro ao atualizar papel'); return; }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const selectedInbox = inboxId !== 'none' ? inboxes.find(i => i.id === inboxId) : null;

    const { error: boardErr } = await supabase
      .from('kanban_boards')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        inbox_id: selectedInbox?.id || null,
        instance_id: selectedInbox?.instance_id || null,
      })
      .eq('id', board.id);

    if (boardErr) {
      toast.error('Erro ao salvar quadro');
      setSaving(false);
      return;
    }

    // Sync columns
    const existingColIds = columns.filter(c => !c.id.startsWith('new_')).map(c => c.id);
    const { data: dbCols } = await supabase.from('kanban_columns').select('id').eq('board_id', board.id);
    const dbColIds = (dbCols || []).map((c: any) => c.id);
    const toDelete = dbColIds.filter((id: string) => !existingColIds.includes(id));
    if (toDelete.length > 0) await supabase.from('kanban_columns').delete().in('id', toDelete);

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const isNew = col.id.startsWith('new_');
      if (isNew) {
        await supabase.from('kanban_columns').insert({ board_id: board.id, name: col.name, color: col.color, position: i, automation_enabled: col.automation_enabled, automation_message: col.automation_message });
      } else {
        await supabase.from('kanban_columns').update({ name: col.name, color: col.color, position: i, automation_enabled: col.automation_enabled, automation_message: col.automation_message }).eq('id', col.id);
      }
    }

    // Sync entities — get map of temp IDs to real UUIDs
    const entityIdMap = await saveEntities();

    // Sync fields (after entities so we can resolve IDs)
    const existingFieldIds = fields.filter(f => !f.id.startsWith('new_')).map(f => f.id);
    const { data: dbFields } = await supabase.from('kanban_fields').select('id').eq('board_id', board.id);
    const dbFieldIds = (dbFields || []).map((f: any) => f.id);
    const fieldsToDelete = dbFieldIds.filter((id: string) => !existingFieldIds.includes(id));
    if (fieldsToDelete.length > 0) await supabase.from('kanban_fields').delete().in('id', fieldsToDelete);

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const isNew = field.id.startsWith('new_');
      // Resolve entity_id using the map (handles temp IDs created in same session)
      const resolvedEntityId = field.field_type === 'entity_select' && field.entity_id
        ? (entityIdMap[field.entity_id] || field.entity_id)
        : null;
      const payload: any = {
        board_id: board.id,
        name: field.name,
        field_type: field.field_type,
        options: field.field_type === 'select' ? field.options : null,
        position: i,
        is_primary: field.is_primary,
        required: field.required,
        show_on_card: field.show_on_card,
        entity_id: resolvedEntityId,
      };
      if (isNew) {
        await supabase.from('kanban_fields').insert(payload);
      } else {
        await supabase.from('kanban_fields').update(payload).eq('id', field.id);
      }
    }

    setSaving(false);
    toast.success('Quadro salvo com sucesso!');
    onSaved();
    onOpenChange(false);
  };

  const saveEntities = async (): Promise<Record<string, string>> => {
    // Get existing entity IDs from DB
    const { data: dbEntities } = await supabase.from('kanban_entities').select('id').eq('board_id', board.id);
    const dbEntityIds = (dbEntities || []).map((e: any) => e.id);
    const currentEntityIds = entities.filter(e => !e.id.startsWith('new_')).map(e => e.id);
    const entitiesToDelete = dbEntityIds.filter((id: string) => !currentEntityIds.includes(id));
    if (entitiesToDelete.length > 0) {
      await supabase.from('kanban_entity_values').delete().in('entity_id', entitiesToDelete);
      await supabase.from('kanban_entities').delete().in('id', entitiesToDelete);
    }

    // Map old temp IDs to real IDs for entity_id references in fields
    const entityIdMap: Record<string, string> = {};

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const isNew = entity.id.startsWith('new_');
      let realEntityId = entity.id;

      if (isNew) {
        const { data: inserted } = await supabase.from('kanban_entities').insert({
          board_id: board.id,
          name: entity.name,
          position: i,
        }).select('id').single();
        if (inserted) {
          realEntityId = inserted.id;
          entityIdMap[entity.id] = realEntityId;
        }
      } else {
        await supabase.from('kanban_entities').update({ name: entity.name, position: i }).eq('id', entity.id);
      }

      // Sync values
      const { data: dbValues } = await supabase.from('kanban_entity_values').select('id').eq('entity_id', realEntityId);
      const dbValueIds = (dbValues || []).map((v: any) => v.id);
      const currentValueIds = entity.values.filter(v => !v.id.startsWith('new_')).map(v => v.id);
      const valuesToDelete = dbValueIds.filter((id: string) => !currentValueIds.includes(id));
      if (valuesToDelete.length > 0) await supabase.from('kanban_entity_values').delete().in('id', valuesToDelete);

      for (let j = 0; j < entity.values.length; j++) {
        const val = entity.values[j];
        if (!val.label.trim()) continue;
        if (val.id.startsWith('new_')) {
          await supabase.from('kanban_entity_values').insert({
            entity_id: realEntityId,
            label: val.label.trim(),
            position: j,
          });
        } else {
          await supabase.from('kanban_entity_values').update({ label: val.label.trim(), position: j }).eq('id', val.id);
        }
      }
    }

    // Update fields UI state (async, not relied upon for save logic)
    setFields(prev => prev.map(f => {
      if (f.entity_id && entityIdMap[f.entity_id]) {
        return { ...f, entity_id: entityIdMap[f.entity_id] };
      }
      return f;
    }));

    return entityIdMap;
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    return email[0].toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Quadro</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="colunas">Colunas</TabsTrigger>
            <TabsTrigger value="campos">Campos</TabsTrigger>
            <TabsTrigger value="entidades">Entidades</TabsTrigger>
            <TabsTrigger value="acesso">Acesso</TabsTrigger>
          </TabsList>

          {/* ── Aba Geral ── */}
          <TabsContent value="geral" className="space-y-4 mt-4 overflow-y-auto flex-1">
            <div className="space-y-1.5">
              <Label>Nome do Quadro *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Privacidade dos Leads</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('shared')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all ${
                    visibility === 'shared'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span className="text-xs font-medium">Compartilhado</span>
                  <span className="text-[10px] opacity-70 leading-tight">Todos os membros veem todos os leads. Ideal para equipes colaborativas.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all ${
                    visibility === 'private'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <Lock className="w-5 h-5" />
                  <span className="text-xs font-medium">Individual</span>
                  <span className="text-[10px] opacity-70 leading-tight">Cada atendente vê só seus leads. Ideal para corretores, vendedores autônomos.</span>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Caixa de Entrada WhatsApp <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Select value={inboxId} onValueChange={setInboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem conexão WhatsApp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem conexão WhatsApp</SelectItem>
                  {inboxes.map(inbox => (
                    <SelectItem key={inbox.id} value={inbox.id}>{inbox.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Vincula uma caixa de atendimento para habilitar automações de mensagem por etapa.</p>
            </div>
          </TabsContent>

          {/* ── Aba Colunas ── */}
          <TabsContent value="colunas" className="flex flex-col flex-1 min-h-0 mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Defina as etapas do seu funil</p>
              <Button size="sm" variant="outline" onClick={addColumn} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
              {!loading && columns.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma coluna. Clique em Adicionar para começar.</p>
              )}
              {columns.map((col, idx) => (
                <div key={col.id} className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card">
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-2.5 shrink-0" />
                  <div className="shrink-0 mt-1">
                    <div className="flex flex-wrap gap-1 w-24">
                      {COLUMN_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          className={`w-4 h-4 rounded-full transition-transform ${col.color === color ? 'ring-2 ring-offset-1 ring-foreground scale-125' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => updateColumn(col.id, { color })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={col.name}
                      onChange={e => updateColumn(col.id, { name: e.target.value })}
                      placeholder="Nome da coluna"
                      className="h-8 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`auto_${col.id}`}
                        checked={col.automation_enabled}
                        onCheckedChange={v => updateColumn(col.id, { automation_enabled: v })}
                      />
                      <Label htmlFor={`auto_${col.id}`} className="text-xs">Mensagem automática ao mover</Label>
                    </div>
                    {col.automation_enabled && (
                      <Textarea
                        value={col.automation_message || ''}
                        onChange={e => updateColumn(col.id, { automation_message: e.target.value })}
                        placeholder="Olá {{nome}}, seu status foi atualizado! Use {{campo:NOME}} para dados do lead."
                        rows={2}
                        className="text-xs"
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveColumn(col.id, 'up')} disabled={idx === 0}>
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveColumn(col.id, 'down')} disabled={idx === columns.length - 1}>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeColumn(col.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Aba Campos ── */}
          <TabsContent value="campos" className="flex flex-col flex-1 min-h-0 mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Campos do formulário de cada lead</p>
              <Button size="sm" variant="outline" onClick={addField} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
              {!loading && fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum campo. Clique em Adicionar para começar.</p>
              )}
              {fields.map((field, idx) => (
                <div key={field.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      value={field.name}
                      onChange={e => updateField(field.id, { name: e.target.value })}
                      placeholder="Nome do campo"
                      className="h-8 text-sm flex-1"
                    />
                    <Select value={field.field_type} onValueChange={v => {
                      const patch: Partial<KanbanField> = { field_type: v as any };
                      if (v !== 'entity_select') patch.entity_id = null;
                      if (v !== 'select') patch.options = null;
                      updateField(field.id, patch);
                    }}>
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveField(field.id, 'up')} disabled={idx === 0}>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveField(field.id, 'down')} disabled={idx === fields.length - 1}>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive shrink-0" onClick={() => removeField(field.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {field.field_type === 'select' && (
                    <div className="pl-6">
                      <Input
                        value={field.options?.join(', ') || ''}
                        onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="Opção 1, Opção 2, Opção 3"
                        className="h-7 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Separe as opções por vírgula</p>
                    </div>
                  )}
                  {field.field_type === 'entity_select' && (
                    <div className="pl-6">
                      <Select
                        value={field.entity_id || 'none'}
                        onValueChange={v => updateField(field.id, { entity_id: v === 'none' ? null : v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecionar entidade..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">— Selecionar entidade —</SelectItem>
                          {entities.map(e => (
                            <SelectItem key={e.id} value={e.id} className="text-xs">
                              {e.name} ({e.values.length} valores)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {entities.length === 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Crie entidades na aba <strong>Entidades</strong> antes de usar este tipo.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 pl-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`primary_${field.id}`}
                        checked={field.is_primary}
                        onCheckedChange={v => updateField(field.id, { is_primary: v })}
                      />
                      <Label htmlFor={`primary_${field.id}`} className="text-xs font-medium">Título do card</Label>
                    </div>
                    {!field.is_primary && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`show_on_card_${field.id}`}
                          checked={field.show_on_card}
                          onCheckedChange={v => updateField(field.id, { show_on_card: v })}
                        />
                        <Label htmlFor={`show_on_card_${field.id}`} className="text-xs">Exibir no card</Label>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`required_${field.id}`}
                        checked={field.required}
                        onCheckedChange={v => updateField(field.id, { required: v })}
                      />
                      <Label htmlFor={`required_${field.id}`} className="text-xs">Obrigatório</Label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Aba Entidades ── */}
          <TabsContent value="entidades" className="flex flex-col flex-1 min-h-0 mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Tabelas de valores reutilizáveis (ex: Planos, Bancos, Pizzas)</p>
              <Button size="sm" variant="outline" onClick={addEntity} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
              {!loading && entities.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <Database className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                  <p className="text-sm text-muted-foreground">Nenhuma entidade criada.</p>
                  <p className="text-xs text-muted-foreground">
                    Crie entidades como "Planos", "Bancos" ou "Produtos" para usar em campos do tipo <strong>Entidade</strong>.
                  </p>
                </div>
              )}
              {entities.map(entity => (
                <div key={entity.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary shrink-0" />
                    <Input
                      value={entity.name}
                      onChange={e => updateEntity(entity.id, e.target.value)}
                      placeholder="Nome da entidade (ex: Planos)"
                      className="h-8 text-sm flex-1 font-medium"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeEntity(entity.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Values list */}
                  <div className="pl-6 space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Valores:</p>
                    {entity.values.map(val => (
                      <div key={val.id} className="flex items-center gap-2">
                        <Input
                          value={val.label}
                          onChange={e => updateEntityValue(entity.id, val.id, e.target.value)}
                          placeholder="Ex: Ouro, Calabresa..."
                          className="h-7 text-xs flex-1"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removeEntityValue(entity.id, val.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-primary"
                      onClick={() => addEntityValue(entity.id)}
                    >
                      <Plus className="w-3 h-3" /> Adicionar valor
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Aba Acesso ── */}
          <TabsContent value="acesso" className="flex flex-col flex-1 min-h-0 mt-4 space-y-4 overflow-y-auto">

            {/* Visibilidade contextual */}
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${
              visibility === 'private'
                ? 'border-warning/40 bg-warning/5'
                : 'border-primary/30 bg-primary/5'
            }`}>
              {visibility === 'private' ? (
                <Lock className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              ) : (
                <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-xs font-medium text-foreground">
                  Modo: {visibility === 'shared' ? 'Compartilhado' : 'Individual'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {visibility === 'shared'
                    ? 'Todos os membros com acesso a este quadro veem todos os cards uns dos outros.'
                    : 'Cada atendente vê apenas os cards onde é criador ou responsável. Ideal para corretores, representantes comerciais e vendedores autônomos.'
                  }
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Para alterar, vá na aba <strong>Geral</strong>.
                </p>
              </div>
            </div>

            {/* Acesso via inbox */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Acesso via WhatsApp / Caixa de Entrada
              </p>
              {board.inbox_id ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{inboxName || 'Caixa vinculada'}</p>
                    <p className="text-xs text-muted-foreground">{inboxMemberCount} membro{inboxMemberCount !== 1 ? 's' : ''} com acesso automático</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border text-muted-foreground">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <p className="text-xs">Sem caixa de entrada vinculada — acesso independente de WhatsApp</p>
                </div>
              )}
            </div>

            {/* Membros diretos */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Membros com Acesso Direto
              </p>

              {members.length === 0 ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-border text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Nenhum membro adicionado diretamente</p>
                  <p className="text-[11px] mt-0.5 opacity-70">Use o campo abaixo para conceder acesso a usuários específicos</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {getInitials(member.full_name, member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{member.full_name || member.email}</p>
                        {member.full_name && <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>}
                      </div>
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleUpdateMemberRole(member.id, v as 'editor' | 'viewer')}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor" className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <Pencil className="w-3 h-3" /> Editor
                            </span>
                          </SelectItem>
                          <SelectItem value="viewer" className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3 h-3" /> Visualizador
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                        onClick={() => handleRemoveMember(member.id, member.full_name || member.email)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Adicionar membro */}
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adicionar Membro</p>

              {/* User search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setSelectedUser(null); }}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Selected user chip */}
              {selectedUser && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/30">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                      {getInitials(selectedUser.full_name, selectedUser.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-primary flex-1 truncate">{selectedUser.full_name || selectedUser.email}</span>
                  <button onClick={() => { setSelectedUser(null); setUserSearch(''); }}>
                    <X className="w-3 h-3 text-primary" />
                  </button>
                </div>
              )}

              {/* Search results dropdown */}
              {userSearch.length > 0 && !selectedUser && filteredUsers.length > 0 && (
                <div className="border border-border rounded-md bg-popover shadow-md max-h-40 overflow-y-auto">
                  {filteredUsers.slice(0, 8).map(u => (
                    <button
                      key={u.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                      onClick={() => { setSelectedUser(u); setUserSearch(''); }}
                    >
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                          {getInitials(u.full_name, u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{u.full_name || u.email}</p>
                        {u.full_name && <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {userSearch.length > 0 && !selectedUser && filteredUsers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhum usuário encontrado</p>
              )}

              <div className="flex gap-2">
                <Select value={newMemberRole} onValueChange={v => setNewMemberRole(v as 'editor' | 'viewer')}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">
                      <span className="flex items-center gap-1.5">
                        <Pencil className="w-3 h-3" /> Editor
                      </span>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3" /> Visualizador
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddMember}
                  disabled={!selectedUser || addingMember}
                  className="gap-1.5 flex-1"
                  size="sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {addingMember ? 'Adicionando...' : 'Adicionar'}
                </Button>
              </div>

              <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium">Sobre os papéis:</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Pencil className="w-2.5 h-2.5 shrink-0" />
                  <strong>Editor</strong> — pode criar, mover e editar cards
                </p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Eye className="w-2.5 h-2.5 shrink-0" />
                  <strong>Visualizador</strong> — apenas visualiza os cards, sem editar
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
