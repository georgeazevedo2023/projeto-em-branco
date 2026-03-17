

## Plano: Criar hook `useUserProfiles()`

### Problema

O fetch de `user_profiles` está duplicado em ~15 componentes com variações: todos os perfis, por IDs, como mapa de nomes. Isso gera código repetitivo.

### Padrões identificados

1. **Todos os perfis** (admin views): `select('id, full_name, email').order('full_name')` — usado em `AdminPanel`, `ManageInstanceAccessDialog`, `Instances`, `EditBoardDialog`
2. **Perfis por IDs**: `select('id, full_name').in('id', userIds)` — usado em `DashboardHome`, `KanbanBoard`, `HelpdeskMetricsCharts`, `DepartmentsTab`, `ContactInfoPanel`
3. **Mapa de nomes** (id→name): `select('id, full_name')` → `Record<string, string>` — usado em `HelpDesk`

### Design do hook

```typescript
// src/hooks/useUserProfiles.ts
interface UseUserProfilesOptions {
  enabled?: boolean;       // default true
  userIds?: string[];      // se definido, filtra por .in('id', userIds)
  select?: string;         // default 'id, full_name, email'
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url?: string | null;
}

function useUserProfiles(options?: UseUserProfilesOptions) {
  // Returns { profiles, profilesMap, namesMap, loading, error, refetch }
  // profilesMap: Record<string, UserProfile> — acesso rápido por ID
  // namesMap: Record<string, string> — mapa id→full_name (filtra nulls)
}
```

O `namesMap` é computado automaticamente via `useMemo`, eliminando o padrão repetido de `data.forEach(p => { if (p.full_name) map[p.id] = p.full_name })`.

### Componentes a migrar

| Componente | Padrão atual | Migração |
|---|---|---|
| `HelpDesk.tsx` | fetch all → namesMap | `useUserProfiles()` → `namesMap` substitui `fetchAgentNames` + `agentNamesMap` state |
| `DashboardHome.tsx` | fetch by IDs → profilesMap | `useUserProfiles({ userIds })` → `profilesMap` substitui fetch inline |
| `ContactInfoPanel.tsx` | fetch by IDs → agents list | `useUserProfiles()` → `profiles` substitui fetch inline |
| `HelpdeskMetricsCharts.tsx` | fetch by IDs → namesMap | `useUserProfiles({ userIds })` → `namesMap` |
| `ManageInstanceAccessDialog.tsx` | fetch all profiles | `useUserProfiles()` → `profiles` |

### Componentes NÃO migrados

- `AdminPanel.tsx` — fetch complexo com joins em 8 tabelas simultâneas
- `Instances.tsx` — fetch acoplado a lógica de create/delete
- `KanbanBoard.tsx` — fetch dentro de `loadCards` com lógica muito acoplada
- `EditBoardDialog.tsx` — fetch dentro de `loadBoardData` com lógica específica de membros
- `DepartmentsTab.tsx` — fetch dentro de `fetchDepartments` com joins complexos

### Arquivos

- **Criar**: `src/hooks/useUserProfiles.ts`
- **Editar**: `HelpDesk.tsx`, `DashboardHome.tsx`, `ContactInfoPanel.tsx`, `HelpdeskMetricsCharts.tsx`, `ManageInstanceAccessDialog.tsx`

