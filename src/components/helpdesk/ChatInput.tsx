import { useState, useRef, useEffect } from 'react';
import { Send, StickyNote, Mic, X, Paperclip, Loader2, Plus, ImageIcon, Smile, Tags, CircleDot, Check } from 'lucide-react';
import { EmojiPicker, EmojiPickerContent } from '@/components/ui/emoji-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { nowBRISO } from '@/lib/dateUtils';
import type { Conversation } from '@/pages/dashboard/HelpDesk';
import type { Label } from './ConversationLabels';

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

  const autoAssignAgent = async () => {
    if (!user || conversation.assigned_to === user.id) return;
    try {
      await supabase
        .from('conversations')
        .update({ assigned_to: user.id })
        .eq('id', conversation.id);

      // Callback imediato para UI local (sem depender do broadcast)
      onAgentAssigned?.(conversation.id, user.id);

      // Broadcast para sincronizar outros agentes em tempo real
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

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [sendingFile, setSendingFile] = useState(false);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Priorizar OGG Opus (mais compatível com WhatsApp)
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic access error:', err);
      toast.error('Não foi possível acessar o microfone');
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        resolve(blob);
      };
      recorder.stop();

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
    });
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Manter data URI prefix para o proxy poder detectar e limpar
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSendAudio = async () => {
    const blob = await stopRecording();
    if (!blob || !user) return;

    setSending(true);
    try {
      const { data: instanceData } = await supabase
        .from('instances')
        .select('token')
        .eq('id', conversation.inbox?.instance_id || '')
        .maybeSingle();

      if (!instanceData?.token) {
        toast.error('Instância não encontrada');
        return;
      }

      const contactJid = conversation.contact?.jid;
      if (!contactJid) {
        toast.error('Contato sem JID');
        return;
      }

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

      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'send-audio',
            instanceToken: instanceData.token,
            jid: contactJid,
            audio: base64Audio,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao enviar áudio');
      }

      // Save to DB with media_url
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

      // Broadcast manual para atualizar o ChatPanel em tempo real
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
      setRecordingTime(0);
    }
  };

  const handleSendFile = async (file: File) => {
    if (!user) return;
    setSendingFile(true);
    try {
      const { data: instanceData } = await supabase
        .from('instances')
        .select('token')
        .eq('id', conversation.inbox?.instance_id || '')
        .maybeSingle();

      if (!instanceData?.token) {
        toast.error('Instância não encontrada');
        return;
      }

      const contactJid = conversation.contact?.jid;
      if (!contactJid) {
        toast.error('Contato sem JID');
        return;
      }

      // Upload file to storage
      const ext = file.name.split('.').pop() || 'bin';
      const fileName = `${conversation.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('helpdesk-media')
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('helpdesk-media')
        .getPublicUrl(fileName);
      const filePublicUrl = publicUrlData.publicUrl;

      // Convert to base64 for UAZAPI
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      const dataUri = `data:${file.type};base64,${base64}`;

      const isImage = file.type.startsWith('image/');
      const mediaType = isImage ? 'image' : 'document';

      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'send-media',
            instanceToken: instanceData.token,
            jid: contactJid,
            mediaUrl: dataUri,
            mediaType,
            filename: isImage ? undefined : file.name,
            caption: '',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(isImage ? 'Falha ao enviar imagem' : 'Falha ao enviar documento');
      }

      // Save to DB
      const { data: insertedMsg, error } = await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        direction: 'outgoing',
        content: isImage ? null : file.name,
        media_type: mediaType,
        media_url: filePublicUrl,
        sender_id: user.id,
      }).select().single();
      if (error) throw error;

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), last_message: mediaType === 'image' ? '📷 Foto' : '📎 Documento', status_ia: 'desligada' } as any)
        .eq('id', conversation.id);

      // Broadcast for realtime
      await supabase.channel('helpdesk-realtime').send({
        type: 'broadcast',
        event: 'new-message',
        payload: {
          conversation_id: conversation.id,
          message_id: insertedMsg.id,
          direction: 'outgoing',
          media_type: mediaType,
          content: isImage ? null : file.name,
          media_url: filePublicUrl,
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
          content: isImage ? null : file.name,
          media_type: mediaType,
          created_at: insertedMsg.created_at,
        },
      });

      await autoAssignAgent();
      await fireOutgoingWebhook({ message_type: mediaType, content: isImage ? null : file.name, media_url: filePublicUrl });
      onMessageSent();
      toast.success(isImage ? 'Imagem enviada!' : 'Documento enviado!');
    } catch (err: any) {
      console.error('Send file error:', err);
      toast.error(err.message || 'Erro ao enviar documento');
    } finally {
      setSendingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
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
        const { data: instanceData } = await supabase
          .from('instances')
          .select('token')
          .eq('id', conversation.inbox?.instance_id || '')
          .maybeSingle();

        if (!instanceData?.token) {
          toast.error('Instância não encontrada');
          return;
        }

        const contactJid = conversation.contact?.jid;
        if (!contactJid) {
          toast.error('Contato sem JID');
          return;
        }

        const { data: session } = await supabase.auth.getSession();
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.session?.access_token}`,
            },
            body: JSON.stringify({
              action: 'send-chat',
              instanceToken: instanceData.token,
              jid: contactJid,
              message: text.trim(),
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Falha ao enviar mensagem');
        }

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

        // Broadcast manual para atualizar o ChatPanel em tempo real
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 text-destructive"
            onClick={cancelRecording}
            title="Cancelar gravação"
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 flex-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
            </span>
            <span className="text-sm font-mono text-destructive">
              {formatTime(recordingTime)}
            </span>
            <span className="text-xs text-muted-foreground">Gravando...</span>
          </div>

          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={handleSendAudio}
            disabled={sending}
          >
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
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 20 * 1024 * 1024) {
                  toast.error('Arquivo deve ter no máximo 20MB');
                  return;
                }
                handleSendFile(file);
              }
            }}
          />
          <input
            type="file"
            ref={imageInputRef}
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 20 * 1024 * 1024) {
                  toast.error('Arquivo deve ter no máximo 20MB');
                  return;
                }
                handleSendFile(file);
              }
            }}
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
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors ${
                      isNote
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'hover:bg-accent text-foreground'
                    }`}
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
                  {/* Status submenu */}
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
                            className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors ${
                              isActive ? 'bg-accent font-medium' : 'hover:bg-secondary/50'
                            }`}
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
                      <button
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent text-foreground"
                        disabled={sending}
                      >
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
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={handleSend}
            disabled={!text.trim() || sending}
          >
            <Send className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={startRecording}
            disabled={isNote}
            title="Gravar áudio"
          >
            <Mic className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
