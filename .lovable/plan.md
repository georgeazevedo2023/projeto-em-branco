

## Plano: Virtualização com react-window em ConversationList e LeadList

### Contexto

- **ConversationList**: Renderiza todas as conversas num `div` com `overflow-y-auto`. Sem limite. Com 500+ conversas, há DOM pesado.
- **LeadList**: Pagina em blocos de 50 dentro de `ScrollArea h-64`. Funcional, mas com 5000 leads a paginação manual é ruim para UX.
- `react-window` não está instalado — precisa adicionar.

### Desafio: Altura variável

`ConversationItem` tem altura variável: items com labels/agent/notes/department ocupam ~90px, items simples ~64px. Usaremos `VariableSizeList` com estimativa de altura baseada na presença de metadados.

`LeadRow` tem altura fixa (~52px) — usaremos `FixedSizeList`.

### Mudanças

**1. Instalar dependência**
- `react-window` + `@types/react-window`

**2. `ConversationList.tsx`** — Virtualizar com `VariableSizeList`
- Importar `VariableSizeList` de `react-window`
- Substituir o `div.divide-y` por `VariableSizeList`
- Função `getItemSize(index)`: retorna `90` se a conversa tem labels/agent/notes/dept, senão `64`
- Criar componente `Row` inline que recebe `{ index, style }` e renderiza `ConversationItem` com `style` aplicado
- Container pai precisa de ref para medir altura disponível — usar `useRef` + altura do container (`flex-1` → precisa calcular)
- Resetar scroll ao mudar filtros com `listRef.current?.scrollToItem(0)`

**3. `LeadList.tsx`** — Substituir paginação por virtualização
- Importar `FixedSizeList` de `react-window`
- Remover estado `currentPage`, constante `ITEMS_PER_PAGE`, `paginatedLeads`, e toda UI de paginação
- Substituir `ScrollArea h-64` por `FixedSizeList` com `height={256}`, `itemSize={52}`, `itemCount={filteredLeads.length}`
- Renderizar `LeadRow` via `Row({ index, style })` usando `filteredLeads[index]`
- Manter empty state fora da lista quando `filteredLeads.length === 0`

### Arquivos

| Arquivo | Ação |
|---|---|
| `package.json` | Adicionar `react-window`, `@types/react-window` |
| `src/components/helpdesk/ConversationList.tsx` | Virtualizar com `VariableSizeList` |
| `src/components/broadcast/LeadList.tsx` | Substituir paginação por `FixedSizeList` |

