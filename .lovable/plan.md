

## Corrigir exclusao de instancias: soft delete em vez de hard delete

### Problema

A funcao de "Excluir" instancia atualmente faz `supabase.from('instances').delete()`, removendo o registro do banco. O comportamento correto e apenas ocultar a instancia no CRM, sem comunicar com a UAZAPI nem excluir dados.

### Solucao

Adicionar uma coluna `disabled` na tabela `instances` e alterar a logica para fazer soft delete.

### Alteracoes

**1. Migracao de banco de dados**

Adicionar coluna `disabled` (boolean, default false) na tabela `instances`:

```sql
ALTER TABLE instances ADD COLUMN disabled boolean NOT NULL DEFAULT false;
```

**2. `src/pages/dashboard/Instances.tsx`**

- Na funcao `confirmDeleteInstance`: trocar `.delete()` por `.update({ disabled: true })` e ajustar a mensagem para "Instancia removida do painel"
- Na funcao `fetchInstances`: adicionar filtro `.eq('disabled', false)` na query para nao exibir instancias desabilitadas
- Atualizar o texto do AlertDialog: trocar "Excluir" por "Remover" e ajustar descricao para explicar que a instancia sera ocultada do painel (nao excluida da UAZAPI)

**3. Textos do modal**

- Titulo: "Remover instancia"
- Descricao: "A instancia **{nome}** sera removida do painel. Ela nao sera excluida na UAZAPI e podera ser restaurada posteriormente."
- Botao: "Remover" (em vez de "Excluir")

