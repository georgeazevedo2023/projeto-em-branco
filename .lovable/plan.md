

## Adicionar funcionalidade de editar atendentes da equipe (email e senha)

### Resumo

Adicionar um botao de editar em cada card de membro na aba "Equipe" do AdminPanel, abrindo um dialog onde o super admin pode alterar nome, email e senha do atendente.

### Alteracoes

**1. Nova Edge Function: `admin-update-user`**

Criar `supabase/functions/admin-update-user/index.ts` seguindo o mesmo padrao de autenticacao das funcoes existentes (`admin-create-user`, `admin-delete-user`):
- Valida Bearer token e verifica role `super_admin`
- Recebe `{ user_id, email?, password?, full_name? }`
- Usa `adminClient.auth.admin.updateUserById()` para alterar email e/ou senha
- Atualiza `user_profiles` (full_name, email) via service role client
- Retorna `{ success: true }` ou erro

**2. Atualizar `src/pages/dashboard/AdminPanel.tsx`**

- Adicionar estados para o dialog de edicao: `editingTeamUser`, `editTeamName`, `editTeamEmail`, `editTeamPassword`, `isSavingTeamUser`
- Adicionar funcao `handleEditTeamUser()` que chama a edge function `admin-update-user`
- Na aba "Equipe", adicionar botao de editar (icone `Pencil`) ao lado do nome de cada membro
- Adicionar um `Dialog` com campos: Nome, Email e Senha (opcional, placeholder "Deixe vazio para manter atual")
- Apos salvar, chamar `fetchTeam()` para atualizar a lista

**3. Atualizar `src/pages/dashboard/InboxUsersManagement.tsx`**

- Mesma funcionalidade de edicao para manter consistencia entre as duas paginas que exibem a equipe

### Detalhes tecnicos

A edge function usara:
```typescript
adminClient.auth.admin.updateUserById(user_id, {
  email: newEmail,       // se fornecido
  password: newPassword, // se fornecido
})
```

E atualizara o perfil:
```typescript
adminClient.from('user_profiles').update({ 
  full_name, email 
}).eq('id', user_id)
```

O dialog tera validacao basica: email obrigatorio, senha minimo 6 caracteres (quando preenchida).

