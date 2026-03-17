

## Plano: Criar hooks `useInstances()` e `useInboxes()`

### Problema

O fetch de `instances` e `inboxes` está duplicado em ~10 componentes cada, com variações mínimas (colunas selecionadas, filtros). Isso gera código repetitivo e inconsistência.

### Componentes afetados

**useInstances** substituirá fetch em:
- `InstanceSelector.tsx` — `select('id, name, status, profile_pic_url')`
- `Sidebar.tsx` — `select('id, name, status').eq('disabled', false)`
- `DashboardHome.tsx` — `select('*').eq('disabled', false)`
- `CreateInboxUserDialog.tsx` — `select('id, name')`
- `InboxManagement.tsx` — `select('id, name, status')`
- `Settings.tsx` — `select('id, name, status').eq('disabled', false)`
- `Instances.tsx` — muito customizado (QR polling, create/delete), **não será migrado**

**useInboxes** substituirá fetch em:
- `Sidebar.tsx` — `select('id, name, instance_id')`
- `DashboardHome.tsx` — `select('id, name')`
- `CreateInboxUserDialog.tsx` — `select('id, name, instance_id')`
- `HelpDesk.tsx` — `select('id, name, instance_id, webhook_outgoing_url')`
- `Settings.tsx` — `select('id, name, instance_id')`
- `InboxManagement.tsx` / `AdminPanel.tsx` — muito customizados (CRUD), **não serão migrados**

### Design dos hooks

```typescript
// src/hooks/useInstances.ts
interface UseInstancesOptions {
  enabled?: boolean;        // default true
  excludeDisabled?: boolean; // default true - filtra disabled=false
  select?: string;          // colunas, default 'id, name, status, profile_pic_url'
}

function useInstances(options?: UseInstancesOptions) {
  // Returns { instances, loading, error, refetch }
  // Listens to window event 'instances-updated' for auto-refresh
}
```

```typescript
// src/hooks/useInboxes.ts
interface UseInboxesOptions {
  enabled?: boolean;
  select?: string;  // default 'id, name, instance_id'
}

function useInboxes(options?: UseInboxesOptions) {
  // Returns { inboxes, loading, error, refetch }
}
```

### Arquivos

- **Criar**: `src/hooks/useInstances.ts`, `src/hooks/useInboxes.ts`
- **Editar**: `InstanceSelector.tsx`, `Sidebar.tsx`, `DashboardHome.tsx`, `CreateInboxUserDialog.tsx`, `Settings.tsx`, `HelpDesk.tsx` — substituir fetch inline pelos hooks
- **Não alterar**: `Instances.tsx`, `AdminPanel.tsx`, `InboxManagement.tsx` (lógica CRUD muito acoplada)

### Resultado

Eliminação de ~6-8 blocos de fetch duplicados por hook, com uma API simples e consistente. Os hooks escutam eventos de atualização para manter dados sincronizados entre componentes.

