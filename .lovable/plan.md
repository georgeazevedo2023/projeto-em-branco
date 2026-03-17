

## Plano: Criar hook `useDepartments()`

### Padrões identificados

| Componente | Query | Migração |
|---|---|---|
| `ContactInfoPanel.tsx` (L89-101) | `select('id, name').eq('inbox_id', X).order('name')` | `useDepartments({ inboxId })` → `departments` |
| `HelpDesk.tsx` (L98-112) | `select('id, name, inbox_id').in('inbox_id', [...]).order('name')` → grouped by inbox | `useDepartments({ inboxIds })` → `departmentsByInbox` |
| `HelpDesk.tsx` (L134-142) | `select('id, name').eq('inbox_id', X).order('name')` | `useDepartments({ inboxId })` → `departments` |
| `DepartmentsTab.tsx` (L73-126) | Fetch complexo com members + profiles + inboxes | **Não migrar** — CRUD acoplado |

### Design do hook

```typescript
// src/hooks/useDepartments.ts
interface UseDepartmentsOptions {
  enabled?: boolean;
  inboxId?: string;        // single inbox filter
  inboxIds?: string[];     // multi-inbox filter (for grouped dropdown)
}

interface DepartmentData {
  id: string;
  name: string;
  inbox_id: string;
}

function useDepartments(options?) {
  // Returns:
  // departments: DepartmentData[]
  // departmentsByInbox: Record<string, DepartmentData[]>  — grouped by inbox_id
  // loading, error, refetch
}
```

`departmentsByInbox` é computado via `useMemo`, substituindo o agrupamento manual no `HelpDesk.tsx`.

### Arquivos

- **Criar**: `src/hooks/useDepartments.ts`
- **Editar**: `ContactInfoPanel.tsx` — substituir useEffect L89-101 pelo hook
- **Editar**: `HelpDesk.tsx` — substituir dois fetches (L98-112, L134-142) pelo hook; remover `allInboxDepts` e `inboxDepartments` state
- **Não alterar**: `DepartmentsTab.tsx` — lógica CRUD muito acoplada

