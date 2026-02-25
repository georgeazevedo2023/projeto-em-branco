
## Melhorar os modais de confirmacao de exclusao em todos os modulos

### Problema

A pagina de Instancias usa `confirm()` nativo do navegador (aquele modal feio com "Uma pagina incorporada em..."). Os demais modulos ja usam o componente `AlertDialog` estilizado, mas podem ser melhorados visualmente com icone de alerta e estilo consistente.

### Alteracoes

**1. Instancias (`src/pages/dashboard/Instances.tsx`) - Substituir `confirm()` por `AlertDialog`**

- Adicionar estado `instanceToDelete` para controlar o dialog
- Substituir a chamada `confirm(...)` na funcao `handleDelete` por `setInstanceToDelete(instance)`
- Adicionar um `AlertDialog` no JSX com icone `AlertTriangle`, titulo, descricao com nome da instancia em negrito, e botoes Cancelar/Excluir estilizados (vermelho destrutivo com spinner durante exclusao)

**2. Padronizar todos os AlertDialogs existentes para ter icone de alerta**

Nos modulos que ja usam `AlertDialog` mas sem icone:

- **AdminPanel** - Dialog de exclusao de inbox (linha ~1130): adicionar icone `AlertTriangle` no titulo (ja existe no de usuario, falta no de inbox e no de remover membro)
- **LeadDatabaseSelector** - Dialog de exclusao de base de leads: adicionar icone `AlertTriangle`
- **BroadcastHistory** - Dialogs de exclusao individual e em lote: adicionar icone `AlertTriangle`
- **BoardCard (KanbanCRM)** - Dialog de exclusao de quadro: adicionar icone `AlertTriangle`

### Detalhes tecnicos

- Na pagina Instances: importar `AlertDialog*`, `AlertTriangle`, `Loader2`; adicionar `const [instanceToDelete, setInstanceToDelete] = useState<Instance | null>(null)` e `const [isDeletingInstance, setIsDeletingInstance] = useState(false)`
- A funcao `handleDelete` sera dividida: o clique no menu seta `instanceToDelete`, e a confirmacao no dialog executa a exclusao com loading state
- Todos os dialogs seguirao o mesmo padrao visual: icone vermelho `AlertTriangle` no titulo, texto descritivo com nome em negrito, botao vermelho "Excluir" com spinner
