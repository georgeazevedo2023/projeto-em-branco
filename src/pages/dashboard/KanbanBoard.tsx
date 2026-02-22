import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, Search, Kanban, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KanbanColumn, ColumnData } from '@/components/kanban/KanbanColumn';
import { KanbanCardItem, CardData } from '@/components/kanban/KanbanCardItem';
import { CardDetailSheet } from '@/components/kanban/CardDetailSheet';
import type { KanbanField } from '@/components/kanban/DynamicFormField';

interface BoardData {
  id: string;
  name: string;
  description: string | null;
  visibility: 'shared' | 'private';
  inbox_id: string | null;
  instance_id: string | null;
  created_by: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string;
}

interface EntityValueOption {
  id: string;
  label: string;
}


const KanbanBoard = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user, isSuperAdmin, isGerente } = useAuth();

  const [board, setBoard] = useState<BoardData | null>(null);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [fields, setFields] = useState<KanbanField[]>([]);
  const [entityValuesMap, setEntityValuesMap] = useState<Record<string, EntityValueOption[]>>({});
  const [entityValueLabels, setEntityValueLabels] = useState<Record<string, string>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  // Role from kanban_board_members: null = not a direct member (inbox or admin)
  const [directMemberRole, setDirectMemberRole] = useState<'editor' | 'viewer' | null>(null);

  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBoard = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Compute effective can-add-card: super_admin or gerente always can; direct viewer cannot
  const canAddCard = isSuperAdmin || isGerente || directMemberRole === 'editor';

  useEffect(() => {
    if (boardId) loadAll();
  }, [boardId, user]);

  const loadAll = async () => {
    if (!boardId || !user) return;
    setLoading(true);

    const [boardRes, colRes, fieldRes, memberRes] = await Promise.all([
      supabase.from('kanban_boards').select('*').eq('id', boardId).single(),
      supabase.from('kanban_columns').select('*').eq('board_id', boardId).order('position'),
      supabase.from('kanban_fields').select('*').eq('board_id', boardId).order('position'),
      supabase.from('kanban_board_members').select('role').eq('board_id', boardId).eq('user_id', user.id).maybeSingle(),
    ]);

    if (boardRes.error || !boardRes.data) {
      toast.error('Quadro não encontrado');
      navigate('/dashboard/crm');
      return;
    }

    const boardData = boardRes.data as BoardData;
    setBoard(boardData);
    setColumns((colRes.data || []) as ColumnData[]);

    const parsedFields = (fieldRes.data || []).map(f => ({
      ...f,
      options: f.options ? (f.options as string[]) : null,
      show_on_card: f.show_on_card ?? false,
      entity_id: (f as any).entity_id ?? null,
    })) as KanbanField[];
    setFields(parsedFields);

    // Set direct member role if user is a direct board member
    if (memberRes.data) {
      setDirectMemberRole(memberRes.data.role as 'editor' | 'viewer');
    } else {
      setDirectMemberRole(null);
    }

    // Load entity values for entity_select fields
    const evLabels = await loadEntityValues(boardData.id);

    await loadCards(boardData, parsedFields, evLabels);
    await loadTeamMembers(boardData);
    setLoading(false);
  };

  const loadEntityValues = async (bId: string): Promise<Record<string, string>> => {
    const { data: entitiesData } = await supabase
      .from('kanban_entities')
      .select('id')
      .eq('board_id', bId);

    if (!entitiesData || entitiesData.length === 0) {
      setEntityValuesMap({});
      setEntityValueLabels({});
      return {};
    }

    const entityIds = entitiesData.map(e => e.id);
    const { data: valuesData } = await supabase
      .from('kanban_entity_values')
      .select('id, entity_id, label')
      .in('entity_id', entityIds)
      .order('position');

    const map: Record<string, EntityValueOption[]> = {};
    const labels: Record<string, string> = {};
    (valuesData || []).forEach(v => {
      if (!map[v.entity_id]) map[v.entity_id] = [];
      map[v.entity_id].push({ id: v.id, label: v.label });
      labels[v.id] = v.label;
    });

    setEntityValuesMap(map);
    setEntityValueLabels(labels);
    return labels;
  };

  const loadCards = async (boardData: BoardData, fieldsData: KanbanField[], evLabels?: Record<string, string>) => {
    if (!user) return;
    const labels = evLabels || entityValueLabels;

    let query = supabase
      .from('kanban_cards')
      .select('*')
      .eq('board_id', boardData.id)
      .order('position');

    // Privacy filter (backend also enforces, but we apply here for UX consistency)
    if (boardData.visibility === 'private' && !isSuperAdmin) {
      query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
    }

    const { data: rawCards } = await query;
    if (!rawCards) return;

    // Load ALL field values for all cards at once
    const cardIds = rawCards.map(c => c.id);
    const primaryField = fieldsData.find(f => f.is_primary);

    // Map: card_id → { field_id → value }
    const allFieldsMap: Record<string, Record<string, string>> = {};
    if (cardIds.length > 0) {
      const { data: cardData } = await supabase
        .from('kanban_card_data')
        .select('card_id, field_id, value')
        .in('card_id', cardIds);
      (cardData || []).forEach(d => {
        if (!allFieldsMap[d.card_id]) allFieldsMap[d.card_id] = {};
        allFieldsMap[d.card_id][d.field_id] = d.value || '';
      });
    }

    // Load assignee names
    const assigneeIds = [...new Set(rawCards.filter(c => c.assigned_to).map(c => c.assigned_to!))];
    let nameMap: Record<string, string> = {};
    if (assigneeIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', assigneeIds);
      (profiles || []).forEach(p => {
        nameMap[p.id] = p.full_name || p.email;
      });
    }

    // Helper: resolve value for display (entity_select → label)
    const resolveDisplayValue = (field: KanbanField, rawValue: string): string => {
      if (field.field_type === 'entity_select' && rawValue) {
        return labels[rawValue] || rawValue;
      }
      return rawValue;
    };

    setCards(rawCards.map(c => {
      const cardFieldMap = allFieldsMap[c.id] || {};
      const fieldValuesArr = fieldsData
        .map(f => ({
          name: f.name,
          value: resolveDisplayValue(f, cardFieldMap[f.id] || ''),
          isPrimary: f.is_primary,
          showOnCard: f.show_on_card ?? false,
        }))
        .filter(fv => fv.value);

      const primaryRawValue = primaryField ? (cardFieldMap[primaryField.id] || '') : '';
      const primaryDisplayValue = primaryField ? resolveDisplayValue(primaryField, primaryRawValue) : undefined;

      return {
        id: c.id,
        title: c.title,
        column_id: c.column_id,
        board_id: c.board_id,
        assigned_to: c.assigned_to,
        tags: c.tags || [],
        position: c.position,
        notes: c.notes || null,
        assignedName: c.assigned_to ? nameMap[c.assigned_to] : undefined,
        primaryFieldValue: primaryDisplayValue || undefined,
        primaryFieldName: primaryField?.name,
        fieldValues: fieldValuesArr,
      };
    }));
  };

  const loadTeamMembers = async (boardData: BoardData) => {
    if (boardData.inbox_id) {
      const { data } = await supabase
        .from('inbox_users')
        .select('user_profiles(id, full_name, email)')
        .eq('inbox_id', boardData.inbox_id);
      const members = (data || [])
        .map((d: any) => d.user_profiles)
        .filter(Boolean) as TeamMember[];
      // Deduplicar por id
      const unique = [...new Map(members.map(m => [m.id, m])).values()];
      setTeamMembers(unique);
    } else {
      // Sem inbox: apenas membros diretos do quadro via kanban_board_members
      const { data: memberRows } = await supabase
        .from('kanban_board_members')
        .select('user_id')
        .eq('board_id', boardData.id);

      const memberIds = (memberRows || []).map(r => r.user_id);

      if (memberIds.length === 0) {
        setTeamMembers([]);
        return;
      }

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', memberIds)
        .order('full_name');

      setTeamMembers((profiles || []) as TeamMember[]);
    }
  };

  // ── Drag & Drop ──────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const card = cards.find(c => c.id === event.active.id);
    setActiveCard(card || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeCard = cards.find(c => c.id === active.id);
    if (!activeCard) return;

    const overId = over.id as string;

    // Dropped over a column
    const overColumn = columns.find(col => col.id === overId);
    if (overColumn && activeCard.column_id !== overColumn.id) {
      setCards(prev =>
        prev.map(c => c.id === activeCard.id ? { ...c, column_id: overColumn.id } : c)
      );
      return;
    }

    // Dropped over another card
    const overCard = cards.find(c => c.id === overId);
    if (overCard && overCard.column_id !== activeCard.column_id) {
      setCards(prev =>
        prev.map(c => c.id === activeCard.id ? { ...c, column_id: overCard.column_id } : c)
      );
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCardData = cards.find(c => c.id === activeId);
    if (!activeCardData) return;

    let newColumnId = activeCardData.column_id;

    // Check if dropped over a column header
    const overColumn = columns.find(col => col.id === overId);
    if (overColumn) {
      newColumnId = overColumn.id;
    }

    // Check if dropped over another card
    const overCard = cards.find(c => c.id === overId);
    if (overCard) {
      newColumnId = overCard.column_id;
    }

    // Reorder within column
    const colCards = cards.filter(c => c.column_id === newColumnId);
    const oldIdx = colCards.findIndex(c => c.id === activeId);
    const newIdx = overCard ? colCards.findIndex(c => c.id === overId) : colCards.length - 1;

    let reordered = colCards;
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
      reordered = arrayMove(colCards, oldIdx, newIdx);
    }

    const otherCards = cards.filter(c => c.column_id !== newColumnId && c.id !== activeId);
    const updatedCards = [
      ...otherCards,
      ...reordered.map((c, i) => ({ ...c, column_id: newColumnId, position: i })),
    ];
    setCards(updatedCards);

    // Persist to DB
    await supabase
      .from('kanban_cards')
      .update({ column_id: newColumnId })
      .eq('id', activeId);

    // Update positions
    for (let i = 0; i < reordered.length; i++) {
      await supabase
        .from('kanban_cards')
        .update({ position: i })
        .eq('id', reordered[i].id);
    }

    // Check automation
    const targetCol = columns.find(c => c.id === newColumnId);
    if (targetCol?.automation_enabled && targetCol.automation_message && board?.instance_id) {
      toast.info(`Automação ativa: coluna "${targetCol.name}"`, { description: 'Configure o disparo na Etapa 4.' });
    }
  };

  // ── Add card ─────────────────────────────────────────────
  const handleAddCard = async (columnId: string, title: string) => {
    if (!title.trim() || !user || !boardId) return;

    const colCards = cards.filter(c => c.column_id === columnId);

    // Em quadros privados sem inbox, auto-atribuir ao usuário logado
    const autoAssign = board?.visibility === 'private' ? user.id : null;

    const { error } = await supabase.from('kanban_cards').insert({
      board_id: boardId,
      column_id: columnId,
      title: title.trim(),
      created_by: user.id,
      assigned_to: autoAssign,
      position: colCards.length,
      tags: [],
    });

    if (error) { toast.error('Erro ao criar card'); return; }

    toast.success('Card criado!');
    loadAll();
  };

  const handleCardClick = (card: CardData) => {
    setSelectedCard(card);
    setSheetOpen(true);
  };

  const handleMoveCard = async (cardId: string, direction: 'prev' | 'next') => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const sortedCols = [...columns].sort((a, b) => a.position - b.position);
    const currentIdx = sortedCols.findIndex(c => c.id === card.column_id);
    const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (targetIdx < 0 || targetIdx >= sortedCols.length) return;

    const targetCol = sortedCols[targetIdx];
    const targetColCards = cards.filter(c => c.column_id === targetCol.id);

    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, column_id: targetCol.id, position: targetColCards.length } : c
    ));

    await supabase.from('kanban_cards').update({
      column_id: targetCol.id,
      position: targetColCards.length,
    }).eq('id', cardId);

    if (targetCol.automation_enabled && targetCol.automation_message && board?.instance_id) {
      toast.info(`Automação ativa: coluna "${targetCol.name}"`);
    }
  };

  // ── Filter ───────────────────────────────────────────────
  const searchFiltered = search
    ? cards.filter(c =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.tags.some(t => t.toLowerCase().includes(search.toLowerCase())) ||
        (c.assignedName || '').toLowerCase().includes(search.toLowerCase())
      )
    : cards;

  const filteredByAssignee = filterAssignee
    ? searchFiltered.filter(c => c.assigned_to === filterAssignee)
    : searchFiltered;

  const filteredCards = filteredByAssignee;

  const getColumnCards = (colId: string) =>
    filteredCards.filter(c => c.column_id === colId).sort((a, b) => a.position - b.position);

  // Helper: initials from name
  const getInitials = (name: string) =>
    name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!board) return null;

  // Members who actually have cards (for chips)
  const membersWithCards = teamMembers.filter(m =>
    cards.some(c => c.assigned_to === m.id)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard/crm')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Kanban className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">{board.name}</h1>
              {board.description && (
                <p className="text-xs text-muted-foreground truncate hidden sm:block">{board.description}</p>
              )}
            </div>
          </div>
          <div className="flex-1" />
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cards..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 w-48 text-sm"
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''}
          </span>
          {directMemberRole === 'viewer' && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
              👁️ Visualizador
            </span>
          )}
        </div>

        {/* Assignee filter chips */}
        {membersWithCards.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">Filtrar:</span>
            {membersWithCards.map(m => {
              const name = m.full_name || m.email;
              const count = cards.filter(c => c.assigned_to === m.id).length;
              const isActive = filterAssignee === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setFilterAssignee(isActive ? null : m.id)}
                  className={cn(
                    'flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border text-xs font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  <Avatar className="w-4 h-4 shrink-0">
                    <AvatarFallback className={cn('text-xs', isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary')}>
                      {getInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{name.split(' ')[0]}</span>
                  <span className={cn('px-1 rounded-full text-xs', isActive ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
                </button>
              );
            })}
            {filterAssignee && (
              <button
                onClick={() => setFilterAssignee(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                Limpar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Kanban board */}
      <div className="relative flex-1 overflow-hidden">
        {/* Scroll buttons — visíveis em touch/tablet */}
        <button
          onClick={() => scrollBoard('left')}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-card/90 border border-border shadow-md text-muted-foreground hover:text-foreground hover:bg-card active:scale-95 transition-all md:hidden"
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => scrollBoard('right')}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-card/90 border border-border shadow-md text-muted-foreground hover:text-foreground hover:bg-card active:scale-95 transition-all md:hidden"
          aria-label="Rolar para direita"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-4 h-full min-h-[calc(100vh-10rem)]">
            {columns.map((col, colIdx) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={getColumnCards(col.id)}
                onCardClick={handleCardClick}
                onAddCard={handleAddCard}
                canAddCard={canAddCard}
                onMoveCard={handleMoveCard}
                hasPrev={colIdx > 0}
                hasNext={colIdx < columns.length - 1}
              />
            ))}

            {columns.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-center">
                <div className="space-y-3">
                  <Kanban className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground text-sm">
                    Este quadro ainda não tem colunas.<br />
                    <span
                      className="text-primary cursor-pointer hover:underline"
                      onClick={() => navigate('/dashboard/crm')}
                    >
                      Edite o quadro
                    </span>{' '}
                    para adicionar etapas ao funil.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeCard && (
              <KanbanCardItem
                card={activeCard}
                onClick={() => {}}
                isDragging
              />
            )}
          </DragOverlay>
        </DndContext>
        </div>
      </div>

      {/* Card detail sheet */}
      <CardDetailSheet
        card={selectedCard}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        columns={columns}
        fields={fields}
        teamMembers={teamMembers}
        entityValuesMap={entityValuesMap}
        onSaved={loadAll}
        onDeleted={loadAll}
      />
    </div>
  );
};



export default KanbanBoard;

