/**
 * Shared phone formatting utilities for WhatsApp JIDs and phone numbers.
 */

/** Format a WhatsApp JID (e.g. "5511999999999@s.whatsapp.net") into a readable phone string */
export const formatPhone = (jid: string | null): string => {
  if (!jid) return '';
  const clean = jid.replace(/@.*$/, '');
  if (!clean) return '';
  if (clean.length === 13)
    return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 9)}-${clean.slice(9)}`;
  if (clean.length === 12)
    return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 8)}-${clean.slice(8)}`;
  return clean;
};

/** Format a JID stripping domain — returns just digits or 'Desconhecido' */
export const formatPhoneSimple = (jid: string): string => {
  if (!jid) return 'Desconhecido';
  const phone = jid.split('@')[0];
  return phone || 'Desconhecido';
};

/** Format phone for display with +DDI DDD XXXXX-XXXX pattern */
export const formatPhoneForDisplay = (phone: string): string => {
  let number = phone.replace(/[^\d]/g, '');
  if (!number || number.length < 10) return phone;
  if (!number.startsWith('55') && number.length <= 11) {
    number = '55' + number;
  }
  if (number.length >= 12) {
    const ddi = number.slice(0, 2);
    const ddd = number.slice(2, 4);
    const parte1 = number.slice(4, 9);
    const parte2 = number.slice(9);
    return `+${ddi} ${ddd} ${parte1}-${parte2}`;
  }
  return phone;
};

/** Format phone display without + prefix: "DDI DDD NUMBER" */
export const formatPhoneDisplay = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 12) {
    const ddi = cleaned.slice(0, 2);
    const ddd = cleaned.slice(2, 4);
    const number = cleaned.slice(4);
    return `${ddi} ${ddd} ${number}`;
  }
  return cleaned;
};

/** Parse a phone number string into a JID format (e.g. "5511999999999@s.whatsapp.net") */
export const parsePhoneToJid = (phone: string): string | null => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
};
