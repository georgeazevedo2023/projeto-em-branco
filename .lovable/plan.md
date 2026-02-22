
# Corrigir: Erro 404 "Instance not found" ao enviar resposta do agente IA com inbox_id

## Problema

O fluxo quando o payload contem `inbox_id` + `status_ia` + mensagem:

1. Bloco `status_ia` (linha 89-196): funciona corretamente, resolve o inbox via `inbox_id`, atualiza status, e **cai para o processamento de mensagem**
2. Bloco `isRawMessage` (linha 200-211): reconstroi o payload com `instanceName: payload.owner` ("558181696546")
3. Busca de instancia (linha 257-258): procura `owner_jid.eq.558181696546@s.whatsapp.net` -- **so com sufixo**
4. No banco, o `owner_jid` esta salvo como `558181696546` (sem sufixo) --> **404 Instance not found**

Existem **dois problemas**:
- A busca na linha 257-258 tem o mesmo bug do owner_jid (so busca com sufixo)
- O `inbox_id` ja resolvido no bloco status_ia e descartado e nao e reaproveitado

## Solucao

### Arquivo: `supabase/functions/whatsapp-webhook/index.ts`

**Mudanca 1 - Linha 257-258:** Corrigir busca de instancia para procurar owner_jid com E sem sufixo (mesmo padrao aplicado no bloco status_ia):

```
// Antes (bugado):
const ownerJid = `${instanceName}@s.whatsapp.net`
instanceQuery = instanceQuery.or(`id.eq.${instanceName},name.eq.${instanceName},owner_jid.eq.${ownerJid}`)

// Depois (corrigido):
const ownerClean = instanceName.replace('@s.whatsapp.net', '')
const ownerWithSuffix = `${ownerClean}@s.whatsapp.net`
instanceQuery = instanceQuery.or(`id.eq.${instanceName},name.eq.${instanceName},owner_jid.eq.${ownerClean},owner_jid.eq.${ownerWithSuffix}`)
```

**Mudanca 2 - Propagar inbox_id resolvido:** Quando o bloco status_ia ja resolveu o inbox e a conversa, salvar essas informacoes para que o processamento de mensagem possa pular a busca de instancia/inbox. Adicionar uma variavel `resolvedFromStatusIa` antes do bloco status_ia e, no processamento de mensagem (apos linha 270), usar o inbox_id ja resolvido se disponivel.

Concretamente:
- Antes do bloco status_ia (linha 87): declarar `let resolvedInboxIdForMessage = ''` e `let resolvedConversationId = ''`
- Dentro do bloco status_ia, antes do fall-through (linha 194): atribuir `resolvedInboxIdForMessage = resolvedInboxId` e `resolvedConversationId = iaConv.id`
- No bloco de busca de instancia/inbox (linhas 242-280): se `resolvedInboxIdForMessage` ja tem valor, pular a busca e usar diretamente

Tambem, no bloco isRawMessage (linhas 200-211), propagar o `inbox_id` original para o payload sintetizado.

## Resumo

| Local | Mudanca |
|---|---|
| Linha 257-258 | Buscar owner_jid com e sem sufixo @s.whatsapp.net |
| Linhas 87, 194 | Propagar inbox_id e conversation_id resolvidos do bloco status_ia |
| Linhas 242-280 | Se inbox_id ja resolvido, pular busca de instancia |
| Linhas 200-211 | Propagar inbox_id no payload sintetizado do isRawMessage |
