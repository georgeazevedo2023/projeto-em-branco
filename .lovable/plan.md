

## Fix: Dashboard travado no loading

### Problema Raiz
O `fetchData()` faz `await fetchGroupsStats(...)` na linha 122 antes de chamar `setLoading(false)`. Como `fetchGroupsStats` faz chamadas `uazapi-proxy` para TODAS as instancias conectadas via `Promise.all`, se qualquer chamada demorar ou travar, o dashboard inteiro fica no skeleton de loading indefinidamente.

### Correções

#### 1. Separar loading principal do loading de stats
**Arquivo:** `src/pages/dashboard/DashboardHome.tsx`

- Remover o `await` do `fetchGroupsStats` dentro de `fetchData` -- chamar sem await para que `setLoading(false)` execute imediatamente após carregar as instancias
- O dashboard renderiza com os dados de instancias/KPIs enquanto os stats dos grupos carregam em background (já controlados por `loadingStats`)

```text
Antes:
  setInstances(...)
  await fetchGroupsStats(...)   <-- bloqueia tudo
  ...
  finally { setLoading(false) } <-- só roda quando TODAS as chamadas proxy terminam

Depois:
  setInstances(...)
  fetchGroupsStats(...)         <-- fire-and-forget (erros já tratados internamente)
  ...
  finally { setLoading(false) } <-- roda imediatamente após carregar instancias
```

#### 2. Adicionar timeout nas chamadas do proxy
**Arquivo:** `src/pages/dashboard/DashboardHome.tsx`

- Adicionar `AbortController` com timeout de 15s para cada chamada `uazapi-proxy` no `fetchGroupsStats`
- Se uma instancia demorar demais, falha graciosamente (já existe catch que coloca 0 grupos)

#### 3. Corrigir LazySection IntersectionObserver
**Arquivo:** `src/components/dashboard/LazySection.tsx`

- O `IntersectionObserver` usa `root: null` (viewport), mas o scroll acontece dentro do `<main>` com `overflow-y-auto`
- Corrigir para detectar o ancestral scrollável ou usar `rootMargin` mais generoso como fallback
- Alternativa pragmatica: usar um timeout de 2s como fallback para forçar renderização

### Arquivos a Editar

1. `src/pages/dashboard/DashboardHome.tsx` -- remover await do fetchGroupsStats, adicionar timeout
2. `src/components/dashboard/LazySection.tsx` -- fallback timeout para IntersectionObserver

### Impacto
- Dashboard carrega instantaneamente com instancias e KPIs
- Gráficos de grupos carregam progressivamente em background
- Seções lazy renderizam mesmo se o observer não detectar interseção

