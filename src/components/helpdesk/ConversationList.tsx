import { useState } from 'react';
import { Search, Inbox, UserCheck, AlertCircle, Building2 } from 'lucide-react';
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

const assignmentOptions: { value: 'todas' | 'minhas' | 'nao-atribuidas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'minhas', label: 'Minhas' },
  { value: 'nao-atribuidas', label: 'Não atribuídas' },
];

const priorityOptions: { value: 'todas' | 'alta' | 'media' | 'baixa'; label: string }[] = [
  { value: 'todas', label: 'Prioridade' },
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

  const hasActiveFilters =
    assignmentFilter !== 'todas' ||
    priorityFilter !== 'todas' ||
    !!labelFilter ||
    !!departmentFilter;

  return (
    <>
      {/* Filters */}
      <div className="p-2.5 border-b border-border/50 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-8 h-8 text-sm bg-secondary/40 border-border/30 focus-visible:ring-1"
          />
        </div>

        {/* Compact filter row */}
        <div className="flex gap-1.5">
          {/* Assignment select */}
          <Select
            value={assignmentFilter}
            onValueChange={(v) => onAssignmentFilterChange?.(v as 'todas' | 'minhas' | 'nao-atribuidas')}
          >
            <SelectTrigger
              className={cn(
                'flex-1 h-7 text-xs border-border/30 gap-1 min-w-0',
                assignmentFilter !== 'todas'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-secondary/40'
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

          {/* Priority select */}
          <Select
            value={priorityFilter}
            onValueChange={(v) => onPriorityFilterChange?.(v as 'todas' | 'alta' | 'media' | 'baixa')}
          >
            <SelectTrigger
              className={cn(
                'flex-1 h-7 text-xs border-border/30 gap-1 min-w-0',
                priorityFilter !== 'todas'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-secondary/40'
              )}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Label select — só se houver etiquetas */}
          {inboxLabels.length > 0 && onLabelFilterChange && (
            <Select
              value={labelFilter || '_all'}
              onValueChange={v => onLabelFilterChange(v === '_all' ? null : v)}
            >
              <SelectTrigger
                className={cn(
                  'flex-1 h-7 text-xs border-border/30 gap-1 min-w-0',
                  labelFilter
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-secondary/40'
                )}
              >
                <SelectValue placeholder="Etiqueta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all" className="text-xs">Etiquetas</SelectItem>
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

          {/* Department select */}
          {inboxDepartments.length > 0 && onDepartmentFilterChange && (
            <Select
              value={departmentFilter || '_all'}
              onValueChange={v => onDepartmentFilterChange(v === '_all' ? null : v)}
            >
              <SelectTrigger
                className={cn(
                  'flex-1 h-7 text-xs border-border/30 gap-1 min-w-0',
                  departmentFilter
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-secondary/40'
                )}
              >
                <Building2 className="w-3 h-3 shrink-0" />
                <SelectValue placeholder="Depto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all" className="text-xs">Departamento</SelectItem>
                {inboxDepartments.map(d => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              onAssignmentFilterChange?.('todas');
              onPriorityFilterChange?.('todas');
              onLabelFilterChange?.(null);
              onDepartmentFilterChange?.(null);
            }}
            className="text-[10px] text-primary/80 hover:text-primary transition-colors"
          >
            ✕ Limpar filtros
          </button>
        )}
      </div>

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
