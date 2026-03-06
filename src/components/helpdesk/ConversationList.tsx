import { useState } from 'react';
import { Search, Inbox, UserCheck, AlertCircle, Building2, SlidersHorizontal, Tag, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ConversationItem } from './ConversationItem';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ManageLabelsDialog } from './ManageLabelsDialog';
import type { Conversation } from '@/pages/dashboard/HelpDesk';
import type { Label } from './ConversationLabels';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (c: Conversation) => void;
  loading: boolean;
  inboxLabels?: Label[];
  conversationLabelsMap?: Record<string, string[]>;
  labelFilter?: string | null;
  onLabelFilterChange?: (labelId: string | null) => void;
  inboxId?: string;
  onLabelsChanged?: () => void;
  agentNamesMap?: Record<string, string>;
  conversationNotesSet?: Set<string>;
  assignmentFilter?: 'todas' | 'minhas' | 'nao-atribuidas';
  onAssignmentFilterChange?: (v: 'todas' | 'minhas' | 'nao-atribuidas') => void;
  priorityFilter?: 'todas' | 'alta' | 'media' | 'baixa';
  onPriorityFilterChange?: (v: 'todas' | 'alta' | 'media' | 'baixa') => void;
  inboxDepartments?: { id: string; name: string }[];
  departmentFilter?: string | null;
  onDepartmentFilterChange?: (v: string | null) => void;
}

const assignmentOptions: { value: 'todas' | 'minhas' | 'nao-atribuidas'; label: string; icon?: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'minhas', label: 'Minhas' },
  { value: 'nao-atribuidas', label: 'Não atribuídas' },
];

const priorityOptions: { value: 'todas' | 'alta' | 'media' | 'baixa'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'alta', label: '🔴 Alta' },
  { value: 'media', label: '🟡 Média' },
  { value: 'baixa', label: '🔵 Baixa' },
];

export const ConversationList = ({
  conversations,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  loading,
  inboxLabels = [],
  conversationLabelsMap = {},
  labelFilter,
  onLabelFilterChange,
  inboxId,
  onLabelsChanged,
  agentNamesMap = {},
  conversationNotesSet = new Set(),
  assignmentFilter = 'todas',
  onAssignmentFilterChange,
  priorityFilter = 'todas',
  onPriorityFilterChange,
  inboxDepartments = [],
  departmentFilter,
  onDepartmentFilterChange,
}: ConversationListProps) => {
  const [manageOpen, setManageOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const hasActiveFilters =
    assignmentFilter !== 'todas' ||
    priorityFilter !== 'todas' ||
    !!labelFilter ||
    !!departmentFilter;

  const activeFilterCount = [
    assignmentFilter !== 'todas',
    priorityFilter !== 'todas',
    !!labelFilter,
    !!departmentFilter,
  ].filter(Boolean).length;

  return (
    <>
      {/* Search + Filter Toggle */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Buscar conversa..."
              className="pl-9 h-9 text-sm bg-secondary/30 border-border/20 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </div>
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-200 shrink-0',
              filtersExpanded || hasActiveFilters
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-secondary/30 border-border/20 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Expandable filter pills */}
        <div
          className={cn(
            'grid transition-all duration-200 ease-in-out',
            filtersExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap gap-1.5 pb-1">
              {/* Assignment */}
              <Select
                value={assignmentFilter}
                onValueChange={(v) => onAssignmentFilterChange?.(v as 'todas' | 'minhas' | 'nao-atribuidas')}
              >
                <SelectTrigger
                  className={cn(
                    'h-7 text-[11px] rounded-lg border gap-1 px-2.5 w-auto',
                    assignmentFilter !== 'todas'
                      ? 'bg-primary/15 border-primary/30 text-primary font-medium'
                      : 'bg-secondary/40 border-border/20 text-muted-foreground'
                  )}
                >
                  <UserCheck className="w-3 h-3 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignmentOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Priority */}
              <Select
                value={priorityFilter}
                onValueChange={(v) => onPriorityFilterChange?.(v as 'todas' | 'alta' | 'media' | 'baixa')}
              >
                <SelectTrigger
                  className={cn(
                    'h-7 text-[11px] rounded-lg border gap-1 px-2.5 w-auto',
                    priorityFilter !== 'todas'
                      ? 'bg-primary/15 border-primary/30 text-primary font-medium'
                      : 'bg-secondary/40 border-border/20 text-muted-foreground'
                  )}
                >
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Labels */}
              {inboxLabels.length > 0 && onLabelFilterChange && (
                <Select
                  value={labelFilter || '_all'}
                  onValueChange={v => onLabelFilterChange(v === '_all' ? null : v)}
                >
                  <SelectTrigger
                    className={cn(
                      'h-7 text-[11px] rounded-lg border gap-1 px-2.5 w-auto',
                      labelFilter
                        ? 'bg-primary/15 border-primary/30 text-primary font-medium'
                        : 'bg-secondary/40 border-border/20 text-muted-foreground'
                    )}
                  >
                    <Tag className="w-3 h-3 shrink-0" />
                    <SelectValue placeholder="Etiqueta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all" className="text-xs">Todas</SelectItem>
                    {inboxLabels.map(l => (
                      <SelectItem key={l.id} value={l.id} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                          {l.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Department */}
              {inboxDepartments.length > 0 && onDepartmentFilterChange && (
                <Select
                  value={departmentFilter || '_all'}
                  onValueChange={v => onDepartmentFilterChange(v === '_all' ? null : v)}
                >
                  <SelectTrigger
                    className={cn(
                      'h-7 text-[11px] rounded-lg border gap-1 px-2.5 w-auto',
                      departmentFilter
                        ? 'bg-primary/15 border-primary/30 text-primary font-medium'
                        : 'bg-secondary/40 border-border/20 text-muted-foreground'
                    )}
                  >
                    <Building2 className="w-3 h-3 shrink-0" />
                    <SelectValue placeholder="Depto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all" className="text-xs">Todos</SelectItem>
                    {inboxDepartments.map(d => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Clear all */}
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    onAssignmentFilterChange?.('todas');
                    onPriorityFilterChange?.('todas');
                    onLabelFilterChange?.(null);
                    onDepartmentFilterChange?.(null);
                  }}
                  className="h-7 px-2.5 rounded-lg text-[11px] text-destructive/80 hover:text-destructive bg-destructive/10 border border-destructive/20 flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-border/30 mx-3" />

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma conversa</p>
            {hasActiveFilters && (
              <p className="text-xs mt-1 opacity-70">Tente limpar os filtros</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {conversations.map(c => (
              <ConversationItem
                key={c.id}
                conversation={c}
                isSelected={c.id === selectedId}
                onClick={() => onSelect(c)}
                labels={inboxLabels.filter(l => (conversationLabelsMap[c.id] || []).includes(l.id))}
                agentName={c.assigned_to ? agentNamesMap[c.assigned_to] || null : null}
                hasNotes={conversationNotesSet.has(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Manage Labels Dialog */}
      {inboxId && onLabelsChanged && (
        <ManageLabelsDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          inboxId={inboxId}
          labels={inboxLabels}
          onChanged={onLabelsChanged}
        />
      )}
    </>
  );
};
