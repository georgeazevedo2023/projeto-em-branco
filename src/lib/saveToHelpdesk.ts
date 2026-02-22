import { supabase } from '@/integrations/supabase/client';

interface HelpdeskMessageData {
  content: string | null;
  media_type: string; // 'text' | 'image' | 'video' | 'audio' | 'document' | 'carousel'
  media_url?: string | null;
}

/**
 * Normalize a phone number by extracting the last 8-10 significant digits.
 * This handles variations like with/without the extra '9' digit in Brazilian numbers.
 */
const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  // Return last 8 digits for matching (handles 9-digit vs 8-digit variations)
  return digits.slice(-8);
};

/**
 * After a successful broadcast send, save the outgoing message to the HelpDesk
 * so it appears in the conversation history.
 */
export const saveToHelpdesk = async (
  instanceId: string,
  contactJid: string,
  contactPhone: string,
  contactName: string | null,
  messageData: HelpdeskMessageData
): Promise<void> => {
  try {
    // 1. Find inbox linked to this instance
    const { data: inbox } = await supabase
      .from('inboxes')
      .select('id')
      .eq('instance_id', instanceId)
      .maybeSingle();

    if (!inbox) {
      // No inbox configured for this instance – skip silently
      return;
    }

    // 2. Find contact by JID first, then fallback to phone number matching
    let contactId: string | null = null;

    const { data: exactContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('jid', contactJid)
      .maybeSingle();

    if (exactContact) {
      contactId = exactContact.id;
      // Update name if we have a better one
      if (contactName) {
        await supabase
          .from('contacts')
          .update({ name: contactName })
          .eq('id', contactId);
      }
    } else {
      // Fallback 1: Try JID variation (Brazilian 9th digit issue)
      // e.g. 5581993856099@s.whatsapp.net vs 558193856099@s.whatsapp.net
      const jidNumber = contactJid.replace('@s.whatsapp.net', '');
      let altJid = '';
      // If number has 13 digits (55 + 2-digit DDD + 9 + 8 digits), try without the 9
      if (jidNumber.length === 13 && jidNumber.startsWith('55')) {
        altJid = '55' + jidNumber.slice(2, 4) + jidNumber.slice(5) + '@s.whatsapp.net';
      }
      // If number has 12 digits (55 + 2-digit DDD + 8 digits), try with the 9
      else if (jidNumber.length === 12 && jidNumber.startsWith('55')) {
        altJid = '55' + jidNumber.slice(2, 4) + '9' + jidNumber.slice(4) + '@s.whatsapp.net';
      }

      if (altJid) {
        const { data: altContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('jid', altJid)
          .maybeSingle();

        if (altContact) {
          contactId = altContact.id;
          if (contactName) {
            await supabase
              .from('contacts')
              .update({ name: contactName })
              .eq('id', contactId);
          }
        }
      }

      // Fallback 2: Search by phone suffix (last 8 digits) directly in DB
      if (!contactId) {
        const suffix = normalizePhone(contactPhone);
        const { data: phoneMatch } = await supabase
          .from('contacts')
          .select('id')
          .ilike('phone', `%${suffix}`)
          .limit(1)
          .maybeSingle();

        if (phoneMatch) {
          contactId = phoneMatch.id;
          if (contactName) {
            await supabase
              .from('contacts')
              .update({ name: contactName })
              .eq('id', contactId);
          }
        }
      }

      if (!contactId) {
        // Create new contact
        const { data: newContact, error: insertErr } = await supabase
          .from('contacts')
          .insert({
            jid: contactJid,
            phone: contactPhone,
            name: contactName,
          })
          .select('id')
          .single();

        if (insertErr || !newContact) {
          console.error('[saveToHelpdesk] Error creating contact:', insertErr);
          return;
        }
        contactId = newContact.id;
      }
    }

    // 3. Find open/pending conversation or create new one
    const now = new Date().toISOString();

    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('inbox_id', inbox.id)
      .eq('contact_id', contactId)
      .in('status', ['aberta', 'pendente'])
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;

    if (existingConv) {
      conversationId = existingConv.id;
      const lastPreview = messageData.content || (messageData.media_type === 'image' ? '📷 Foto' : messageData.media_type === 'video' ? '🎥 Vídeo' : messageData.media_type === 'audio' ? '🎵 Áudio' : messageData.media_type === 'document' ? '📎 Documento' : '');
      // Update last_message_at and last_message
      await supabase
        .from('conversations')
        .update({ last_message_at: now, updated_at: now, last_message: lastPreview } as any)
        .eq('id', conversationId);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          inbox_id: inbox.id,
          contact_id: contactId,
          status: 'aberta',
          last_message_at: now,
        })
        .select('id')
        .single();

      if (convErr || !newConv) {
        console.error('[saveToHelpdesk] Error creating conversation:', convErr);
        return;
      }
      conversationId = newConv.id;
    }

    // 4. Insert message into conversation_messages
    const { error: msgErr } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outgoing',
        content: messageData.content,
        media_type: messageData.media_type,
        media_url: messageData.media_url || null,
      });

    if (msgErr) {
      console.error('[saveToHelpdesk] Error inserting message:', msgErr);
      return;
    }

    // 5. Broadcast realtime update for HelpDesk
    const channel = supabase.channel('helpdesk-conversations');
    await channel.send({
      type: 'broadcast',
      event: 'conversation_updated',
      payload: { conversation_id: conversationId, inbox_id: inbox.id },
    });
    supabase.removeChannel(channel);
  } catch (err) {
    console.error('[saveToHelpdesk] Unexpected error:', err);
  }
};
