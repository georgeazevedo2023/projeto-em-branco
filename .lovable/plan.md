

## Plano: Adicionar React.memo a ConversationItem, KanbanCardItem e LeadList rows

### Mudanças

**1. `ConversationItem.tsx`** — Envolver com `React.memo`
- Importar `memo` de React
- Mudar export de `const ConversationItem = (...)` para `export const ConversationItem = memo(function ConversationItem(...))`
- Sem custom comparator necessário — props são simples (conversation object, boolean, string, array)

**2. `KanbanCardItem.tsx`** — Envolver com `React.memo`
- Importar `memo` de React
- Mudar `export function KanbanCardItem` para `export const KanbanCardItem = memo(function KanbanCardItem(...))`
- Usa `useSortable` internamente — memo previne re-renders quando props do card não mudam

**3. `LeadList.tsx`** — Extrair `LeadRow` como componente memoizado
- O LeadList renderiza cada lead inline (linhas 193-226) com lógica de seleção e badges
- Extrair um componente `LeadRow` com props `{ lead, isSelected, onToggle }` e envolver com `React.memo`
- Mover `getVerificationBadge` e `getSourceBadge` para fora do componente pai (já são pure functions) para evitar recriação a cada render
- O `onToggle` callback será estabilizado com `useCallback` no `LeadList`

### Arquivos

- **Editar**: `src/components/helpdesk/ConversationItem.tsx`
- **Editar**: `src/components/kanban/KanbanCardItem.tsx`
- **Editar**: `src/components/broadcast/LeadList.tsx`

