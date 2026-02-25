

## Corrigir: instancia removida nao sai do menu lateral

### Problema

Ao remover (desabilitar) uma instancia na pagina de Instancias, a lista principal atualiza corretamente, mas o menu lateral (Sidebar) continua exibindo a instancia removida. Isso acontece porque a funcao `confirmDeleteInstance` nao dispara o evento `instances-updated` que o Sidebar escuta para se atualizar.

### Correcao

**Arquivo: `src/pages/dashboard/Instances.tsx`** (linha ~505)

Adicionar `window.dispatchEvent(new CustomEvent('instances-updated'))` logo apos o `fetchInstances()` dentro da funcao `confirmDeleteInstance`, para notificar o Sidebar a re-buscar a lista de instancias.

Antes:
```typescript
toast.success('Instância removida do painel');
setInstanceToDelete(null);
fetchInstances();
```

Depois:
```typescript
toast.success('Instância removida do painel');
setInstanceToDelete(null);
fetchInstances();
window.dispatchEvent(new CustomEvent('instances-updated'));
```

Uma unica linha adicionada. O Sidebar ja escuta esse evento e chama seu proprio `fetchInstances()` com o filtro `disabled = false`.

