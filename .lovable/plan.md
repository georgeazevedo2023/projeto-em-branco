

## Plano: Dividir EditBoardDialog.tsx em sub-componentes por tab

### Estrutura

Extrair 4 componentes de tab, mantendo o estado e lógica de save no `EditBoardDialog` (que passa handlers via props):

| Componente | Linhas atuais | Responsabilidade |
|---|---|---|
| `ColumnsTab.tsx` | 615-682 | Lista de colunas, cores, automação, reordenação |
| `FieldsTab.tsx` | 684-801 | Lista de campos dinâmicos, tipo, opções, entity select, switches |
| `EntitiesTab.tsx` | 803-875 | Entidades reutilizáveis e seus valores |
| `AccessTab.tsx` | 877-1085 | Visibilidade, inbox info, membros diretos, busca/adicionar membro |

### Interfaces compartilhadas

Mover `KanbanColumn`, `KanbanField`, `KanbanEntity`, `KanbanEntityValue`, `BoardMember`, `UserProfile` e as constantes `COLUMN_COLORS` e `FIELD_TYPES` para o início do `EditBoardDialog.tsx` (exportados) para que os sub-componentes importem de lá.

### Props de cada componente

- **ColumnsTab**: `columns`, `loading`, `addColumn`, `updateColumn`, `removeColumn`, `moveColumn`
- **FieldsTab**: `fields`, `entities`, `loading`, `addField`, `updateField`, `removeField`, `moveField`
- **EntitiesTab**: `entities`, `loading`, `addEntity`, `updateEntity`, `removeEntity`, `addEntityValue`, `updateEntityValue`, `removeEntityValue`
- **AccessTab**: `visibility`, `board`, `members`, `allUsers`, `userSearch`, `setUserSearch`, `selectedUser`, `setSelectedUser`, `newMemberRole`, `setNewMemberRole`, `addingMember`, `inboxMemberCount`, `inboxName`, `filteredUsers`, `handleAddMember`, `handleRemoveMember`, `handleUpdateMemberRole`, `getInitials`

### Resultado

`EditBoardDialog.tsx` ficará com ~530 linhas (estado, data loading, save logic, shell do dialog com Tabs). Cada sub-componente terá entre 70-220 linhas com JSX puro.

### Arquivos

- **Criar**: `src/components/kanban/ColumnsTab.tsx`, `FieldsTab.tsx`, `EntitiesTab.tsx`, `AccessTab.tsx`
- **Editar**: `src/components/kanban/EditBoardDialog.tsx` (exportar tipos/constantes, substituir JSX inline por componentes)

