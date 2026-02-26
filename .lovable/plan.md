

## Adicionar edicao de caixas de entrada no dialog de editar atendente

### Resumo

O dialog "Editar Atendente" atualmente permite alterar nome, email e senha, mas nao permite editar as caixas de entrada (inboxes) que o atendente tem acesso. A ideia e adicionar uma secao de checkboxes com as inboxes disponiveis e selecao de role para cada inbox marcada.

### Alteracoes

**Arquivo: `src/pages/dashboard/AdminPanel.tsx`**

1. **Novos estados para o dialog de edicao:**
   - `editTeamInboxes`: `Record<string, InboxRole>` - mapa de inbox_id para role das inboxes selecionadas
   - Usar a lista `inboxes` ja carregada no componente para exibir as opcoes

2. **Atualizar `openEditTeamUser`** (funcao que inicializa o dialog):
   - Pre-carregar as memberships atuais do usuario no estado `editTeamInboxes` a partir de `editingTeamUser.memberships`

3. **Atualizar `handleEditTeamUser`** (funcao de salvar):
   - Apos salvar nome/email/senha via edge function, sincronizar as inboxes:
     - Remover memberships que foram desmarcadas (`DELETE FROM inbox_users WHERE user_id = X AND inbox_id = Y`)
     - Adicionar novas memberships que foram marcadas (`INSERT INTO inbox_users`)
     - Atualizar roles de memberships existentes que mudaram (`UPDATE inbox_users SET role = ...`)

4. **Atualizar o Dialog UI** (linhas 1274-1302):
   - Adicionar uma secao "Caixas de Entrada" abaixo do campo de senha
   - Para cada inbox disponivel, exibir um checkbox com o nome da inbox e instancia
   - Quando marcada, exibir um Select para escolher a role (admin/gestor/agente)
   - Agrupar por instancia para melhor organizacao visual

### Detalhes tecnicos

A sincronizacao de inboxes sera feita diretamente via Supabase client (nao precisa de edge function), pois o usuario logado e super_admin e ja tem permissao de gerenciar `inbox_users` via RLS.

```typescript
// Remover inboxes desmarcadas
const currentIds = new Set(Object.keys(editTeamInboxes));
const previousIds = editingTeamUser.memberships.map(m => m.inbox_id);
const toRemove = previousIds.filter(id => !currentIds.has(id));
for (const inboxId of toRemove) {
  await supabase.from('inbox_users').delete()
    .eq('user_id', editingTeamUser.id).eq('inbox_id', inboxId);
}

// Adicionar/atualizar inboxes marcadas
for (const [inboxId, role] of Object.entries(editTeamInboxes)) {
  await supabase.from('inbox_users').upsert({
    user_id: editingTeamUser.id, inbox_id: inboxId, role
  }, { onConflict: 'user_id,inbox_id' });
}
```

Nao e necessaria migracao de banco, pois a tabela `inbox_users` ja suporta a operacao. O `upsert` precisara de um unique constraint em `(user_id, inbox_id)` - verificarei se ja existe. Se nao existir, usarei insert/update separados com verificacao.

