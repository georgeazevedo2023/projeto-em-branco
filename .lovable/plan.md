
## Mostrar o ID de cada agente na aba Equipe e no dialog de membros

### O que sera feito

Adicionar o `user_id` de cada agente/membro em dois locais do painel admin, com botao de copiar para facilitar o cadastro no n8n:

### Alteracoes

**1. Aba "Equipe" do AdminPanel (`src/pages/dashboard/AdminPanel.tsx`)**

Na secao de cada membro (linhas 957-966), abaixo do email, adicionar uma linha com o `user_id` e um botao de copiar:

```text
Nome do Agente
email@exemplo.com
ID: abc123-def456...  [copiar]
```

**2. Dialog "Membros" da inbox (`src/components/dashboard/ManageInboxUsersDialog.tsx`)**

Na lista de membros (linhas 289-291), abaixo do email, adicionar o `user_id` com botao de copiar:

```text
Nome do Membro
email@exemplo.com
ID: abc123-def456...  [copiar]
```

### Detalhes tecnicos

- O `user_id` ja esta disponivel como `u.id` na aba Equipe e como `member.user_id` no dialog de membros
- O botao de copiar usara `navigator.clipboard.writeText()` com feedback via `toast.success`
- O ID sera exibido em fonte monospacada (`font-mono`) e tamanho reduzido (`text-[10px]`) para nao poluir o layout
- Nenhuma alteracao de banco de dados necessaria
