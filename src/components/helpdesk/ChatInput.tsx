import { useState } from 'react';
import { Send, StickyNote, Mic, X, Paperclip, Loader2, Plus, ImageIcon, Smile, Tags, CircleDot, Check } from 'lucide-react';
import { EmojiPickerContent } from '@/components/ui/emoji-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { uazapiProxy } from '@/lib/uazapiClient';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { handleError } from '@/lib/errorUtils';
import { nowBRISO } from '@/lib/dateUtils';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useSendFile } from '@/hooks/useSendFile';
import type { Conversation, Label } from '@/types';

interface ChatInputProps {
  conversation: Conversation;
  onMessageSent: () => void;
  onAgentAssigned?: (conversationId: string, agentId: string) => void;
  inboxLabels?: Label[];
  assignedLabelIds?: string[];
  onLabelsChanged?: () => void;
  onStatusChange?: (status: string) => void;
}

export const ChatInput = ({ conversation, onMessageSent, onAgentAssigned, inboxLabels = [], assignedLabelIds = [], onLabelsChanged, onStatusChange }: ChatInputProps) => {
  const { user } = useAuth();
  const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording, formatTime } = useAudioRecorder();
  const { sendingFile, fileInputRef, imageInputRef, handleSendFile } = useSendFile();

  const autoAssignAgent = async () => {
    if (!user || conversation.assigned_to === user.id) return;
    try {
      await supabase
        .from('conversations')
        .update({ assigned_to: user.id })
        .eq('id', conversation.id);

      onAgentAssigned?.(conversation.id, user.id);

      await supabase.channel('helpdesk-conversations').send({
        type: 'broadcast',
        event: 'assigned-agent',
        payload: {
          conversation_id: conversation.id,
          assigned_to: user.id,
        },
      });
    } catch (err) {
      console.error('Auto-assign error:', err);
    }
  };

  const fireOutgoingWebhook = async (messageData: {
    message_type: string;
    content: string | null;
    media_url: string | null;
  }) => {
    const inbox = conversation.inbox as any;
    const webhookUrl = inbox?.webhook_outgoing_url;
    if (!webhookUrl || !user) return;
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const { data: instanceInfo } = await supabase
        .from('instances')
        .select('name')
        .eq('id', inbox?.instance_id || '')
        .maybeSingle();

      await supabase.functions.invoke('fire-outgoing-webhook', {
        body: {
          webhook_url: webhookUrl,
          payload: {
            timestamp: nowBRISO(),
            instance_name: instanceInfo?.name || '',
            instance_id: inbox?.instance_id || '',
            inbox_name: inbox?.name || '',
            inbox_id: inbox?.id || conversation.inbox_id,
            contact_name: conversation.contact?.name || '',
            remotejid: conversation.contact?.jid,
            fromMe: true,
            agent_name: profile?.full_name || user.email,
            agent_id: user.id,
            pausar_agente: 'sim',
            status_ia: 'desligada',
            message_type: messageData.message_type,
            message: messageData.content,
            media_url: messageData.media_url,
          },
        },
      });
    } catch (err) {
      console.error('Outgoing webhook error:', err);
    }
  };

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isNote, setIsNote] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [togglingLabel, setTogglingLabel] = useState<string | null>(null);

  const statusOptions = [
    { value: 'aberta', label: 'Aberta', dotClass: 'bg-emerald-500' },
    { value: 'pendente', label: 'Pendente', dotClass: 'bg-yellow-500' },
    { value: 'resolvida', label: 'Resolvida', dotClass: 'bg-muted-foreground/50' },
  ];

  const handleStatusChange = async (newStatus: string) => {
    const { error } = await supabase
      .from('conversations')
      .update({ status: newStatus })
      .eq('id', conversation.id);

    if (!error) {
      onStatusChange?.(newStatus);
      toast.success('Status atualizado');
      setMenuOpen(false);
      setShowStatus(false);
    } else {
      toast.error('Erro ao atualizar status');
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSendAudio = async () => {
    const blob = await stopRecording();
    if (!blob || !user) return;

    setSending(true);
    try {
      const instanceId = conversation.inbox?.instance_id || '';
      if (!instanceId) { toast.error('Instância não encontrada'); return; }
      const contactJid = conversation.contact?.jid;
      if (!contactJid) { toast.error('Contato sem JID'); return; }

      // Upload audio to storage
      const fileName = `${conversation.id}/${Date.now()}.ogg`;
      const { error: uploadError } = await supabase.storage
        .from('audio-messages')
        .upload(fileName, blob, { contentType: blob.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('audio-messages')
        .getPublicUrl(fileName);
      const audioPublicUrl = publicUrlData.publicUrl;

      const base64Audio = await blobToBase64(blob);

      await uazapiProxy({
        action: 'send-audio',
        instance_id: instanceId,
        jid: contactJid,
        audio: base64Audio,
      });

      const { data: insertedMsg, error } = await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        direction: 'outgoing',
        content: null,
        media_type: 'audio',
        media_url: audioPublicUrl,
        sender_id: user.id,
      }).select().single();
      if (error) throw error;

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), last_message: '🎵 Áudio', status_ia: 'desligada' } as any)
        .eq('id', conversation.id);

      await supabase.channel('helpdesk-realtime').send({
        type: 'broadcast',
        event: 'new-message',
        payload: {
          conversation_id: conversation.id,
          message_id: insertedMsg.id,
          direction: 'outgoing',
          media_type: 'audio',
          content: null,
          media_url: audioPublicUrl,
          created_at: insertedMsg.created_at,
          status_ia: 'desligada',
        },
      });
      await supabase.channel('helpdesk-conversations').send({
        type: 'broadcast',
        event: 'new-message',
        payload: {
          conversation_id: conversation.id,
          inbox_id: conversation.inbox_id,
          content: null,
          media_type: 'audio',
          created_at: insertedMsg.created_at,
        },
      });

      await autoAssignAgent();
      await fireOutgoingWebhook({ message_type: 'audio', content: null, media_url: audioPublicUrl });
      onMessageSent();
    } catch (err: any) {
      console.error('Send audio error:', err);
      toast.error(err.message || 'Erro ao enviar áudio');
    } finally {
      setSending(false);
    }
  };

  const onFileSelected = async (file: File) => {
    const instanceId = conversation.inbox?.instance_id || '';
    const contactJid = conversation.contact?.jid || '';
    const result = await handleSendFile(file, {
      conversationId: conversation.id,
      inboxId: conversation.inbox_id,
      instanceId,
      contactJid,
      userId: user?.id || '',
    });
    if (result.success) {
      await autoAssignAgent();
      await fireOutgoingWebhook({
        message_type: result.mediaType || 'document',
        content: result.mediaType === 'image' ? null : file.name,
        media_url: result.mediaUrl || null,
      });
      onMessageSent();
    }
  };

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    setSending(true);

    try {
      if (isNote) {
        const { error } = await supabase.from('conversation_messages').insert({
          conversation_id: conversation.id,
          direction: 'private_note',
          content: text.trim(),
          media_type: 'text',
          sender_id: user.id,
        });
        if (error) throw error;
      } else {
        const instanceId = conversation.inbox?.instance_id || '';
        if (!instanceId) { toast.error('Instância não encontrada'); return; }
        const contactJid = conversation.contact?.jid;
        if (!contactJid) { toast.error('Contato sem JID'); return; }

        await uazapiProxy({
          action: 'send-chat',
          instance_id: instanceId,
          jid: contactJid,
          message: text.trim(),
        });

        const { data: insertedMsg, error } = await supabase.from('conversation_messages').insert({
          conversation_id: conversation.id,
          direction: 'outgoing',
          content: text.trim(),
          media_type: 'text',
          sender_id: user.id,
        }).select().single();
        if (error) throw error;

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString(), last_message: text.trim(), status_ia: 'desligada' } as any)
          .eq('id', conversation.id);

        await supabase.channel('helpdesk-realtime').send({
          type: 'broadcast',
          event: 'new-message',
          payload: {
            conversation_id: conversation.id,
            message_id: insertedMsg.id,
            direction: 'outgoing',
            media_type: 'text',
            content: text.trim(),
            media_url: null,
            created_at: insertedMsg.created_at,
            status_ia: 'desligada',
          },
        });
        await supabase.channel('helpdesk-conversations').send({
          type: 'broadcast',
          event: 'new-message',
          payload: {
            conversation_id: conversation.id,
            inbox_id: conversation.inbox_id,
            content: text.trim(),
            media_type: 'text',
            created_at: insertedMsg.created_at,
          },
        });
      }

      if (!isNote) {
        await autoAssignAgent();
        await fireOutgoingWebhook({ message_type: 'text', content: text.trim(), media_url: null });
      }
      setText('');
      onMessageSent();
    } catch (err: any) {
      console.error('Send error:', err);
      toast.error(err.message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 border-t border-border/50 bg-card/50">
      {isNote && !isRecording && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-1 mb-2 text-xs text-yellow-400">
          📝 Escrevendo nota privada — o cliente não verá esta mensagem
        </div>
      )}

      {isRecording ? (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 text-destructive" onClick={cancelRecording} title="Cancelar gravação">
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
            </span>
            <span className="text-sm font-mono text-destructive">{formatTime(recordingTime)}</span>
            <span className="text-xs text-muted-foreground">Gravando...</span>
          </div>
          <Button size="icon" className="shrink-0 h-9 w-9" onClick={handleSendAudio} disabled={sending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
          />
          <input
            type="file"
            ref={imageInputRef}
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
          />

          {sendingFile ? (
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" disabled>
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : (
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9">
                  <Plus className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-48 p-1.5">
                <div className="flex flex-col gap-0.5">
                  <button
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${isNote ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-accent text-foreground'}`}
                    onClick={() => { setIsNote(!isNote); setMenuOpen(false); }}
                  >
                    <StickyNote className="w-4 h-4" />
                    {isNote ? 'Desativar nota' : 'Nota privada'}
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground disabled:opacity-50 disabled:pointer-events-none"
                    onClick={() => { imageInputRef.current?.click(); setMenuOpen(false); }}
                    disabled={isNote}
                  >
                    <ImageIcon className="w-4 h-4" />
                    Enviar imagem
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground disabled:opacity-50 disabled:pointer-events-none"
                    onClick={() => { fileInputRef.current?.click(); setMenuOpen(false); }}
                    disabled={isNote}
                  >
                    <Paperclip className="w-4 h-4" />
                    Enviar documento
                  </button>
                  {inboxLabels.length > 0 && (
                    <>
                      <button
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground"
                        onClick={() => setShowLabels(!showLabels)}
                      >
                        <Tags className="w-4 h-4" />
                        Etiquetas
                      </button>
                      {showLabels && (
                        <div className="border-t border-border/50 pt-1 mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                          {inboxLabels.map(label => {
                            const isAssigned = assignedLabelIds.includes(label.id);
                            return (
                              <button
                                key={label.id}
                                className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md hover:bg-secondary/50 text-sm disabled:opacity-50"
                                onClick={async () => {
                                  setTogglingLabel(label.id);
                                  try {
                                    if (isAssigned) {
                                      await supabase.from('conversation_labels').delete()
                                        .eq('conversation_id', conversation.id).eq('label_id', label.id);
                                    } else {
                                      await supabase.from('conversation_labels')
                                        .insert({ conversation_id: conversation.id, label_id: label.id });
                                    }
                                    onLabelsChanged?.();
                                  } catch (err: any) {
                                    toast.error(err.message || 'Erro');
                                  } finally {
                                    setTogglingLabel(null);
                                  }
                                }}
                                disabled={togglingLabel === label.id}
                              >
                                <Checkbox checked={isAssigned} className="pointer-events-none" />
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                                <span className="truncate">{label.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground"
                    onClick={() => setShowStatus(!showStatus)}
                  >
                    <CircleDot className="w-4 h-4" />
                    Status
                  </button>
                  {showStatus && (
                    <div className="border-t border-border/50 pt-1 mt-1 space-y-0.5">
                      {statusOptions.map(opt => {
                        const isActive = conversation.status === opt.value;
                        return (
                          <button
                            key={opt.value}
                            className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors ${isActive ? 'bg-accent font-medium' : 'hover:bg-secondary/50'}`}
                            onClick={() => handleStatusChange(opt.value)}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotClass}`} />
                            <span className="flex-1 text-left">{opt.label}</span>
                            {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground" disabled={sending}>
                        <Smile className="w-4 h-4" />
                        Enviar Emojis
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-[320px] p-0 z-[100]">
                      <EmojiPickerContent onEmojiSelect={(emoji) => setText(prev => prev + emoji)} />
                    </PopoverContent>
                  </Popover>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isNote ? 'Escrever nota privada...' : 'Escrever mensagem...'}
            className="min-h-[40px] max-h-32 resize-none text-sm md:text-sm text-base"
            rows={1}
          />
          <Button size="icon" className="shrink-0 h-9 w-9" onClick={handleSend} disabled={!text.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={startRecording} disabled={isNote} title="Gravar áudio">
            <Mic className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
