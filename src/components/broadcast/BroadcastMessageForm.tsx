import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Image, LayoutGrid } from 'lucide-react';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { toast } from 'sonner';
import { ScheduleMessageDialog, ScheduleConfig } from '@/components/group/ScheduleMessageDialog';
import { TemplateSelector } from './TemplateSelector';
import MessagePreview from './MessagePreview';
import { CarouselEditor, CarouselData, createEmptyCard } from './CarouselEditor';
import { uploadCarouselImage, base64ToFile } from '@/lib/uploadCarouselImage';
import { saveToHelpdesk } from '@/lib/saveToHelpdesk';
import BroadcastProgressModal, { type SendProgress } from './BroadcastProgressModal';
import BroadcastMediaTab from './BroadcastMediaTab';
import BroadcastSendControls from './BroadcastSendControls';
import type { MessageTemplate } from '@/hooks/useMessageTemplates';
import type { Instance } from './InstanceSelector';
import type { Group } from './GroupSelector';

import {
  InitialData, MediaType, ActiveTab,
  MAX_MESSAGE_LENGTH, MAX_FILE_SIZE, SEND_DELAY_MS, GROUP_DELAY_MS,
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_AUDIO_TYPES,
  sendToNumber, sendMediaToNumber, sendCarouselToNumber,
  fileToBase64, compressImageToThumbnail, formatTime, getRandomDelay, getAcceptedTypes,
} from '@/lib/broadcastSender';

interface BroadcastMessageFormProps {
  instance: Instance;
  selectedGroups: Group[];
  onComplete?: () => void;
  initialData?: InitialData;
}

const BroadcastMessageForm = ({ instance, selectedGroups, onComplete, initialData }: BroadcastMessageFormProps) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (initialData && initialData.messageType === 'carousel') {
      return 'carousel';
    }
    if (initialData && initialData.messageType !== 'text') {
      return 'media';
    }
    return 'text';
  });
  const [message, setMessage] = useState(() => initialData?.content || '');
  const [excludeAdmins, setExcludeAdmins] = useState(false);
  // selectedGroups used directly for all participant logic
  const [randomDelay, setRandomDelay] = useState<'none' | '5-10' | '10-20'>('none');
  const [progress, setProgress] = useState<SendProgress>({
    currentGroup: 0,
    totalGroups: 0,
    currentMember: 0,
    totalMembers: 0,
    groupName: '',
    status: 'idle',
    results: [],
    startedAt: null,
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  
  // Participant selection for excludeAdmins mode
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  
  // Pause and cancel control using refs to allow immediate effect in async loops
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

  // Media states
  const [mediaType, setMediaType] = useState<MediaType>(() => {
    if (initialData) {
      if (initialData.messageType === 'image') return 'image';
      if (initialData.messageType === 'video') return 'video';
      if (initialData.messageType === 'audio' || initialData.messageType === 'ptt') return 'audio';
      if (initialData.messageType === 'document' || initialData.messageType === 'file') return 'file';
    }
    return 'image';
  });
  const [mediaUrl, setMediaUrl] = useState(() => initialData?.mediaUrl || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState(() => {
    if (initialData && initialData.messageType !== 'text') {
      return initialData.content || '';
    }
    return '';
  });
  const [isPtt, setIsPtt] = useState(() => initialData?.messageType === 'ptt');
  const [filename, setFilename] = useState('');
  

  // Carousel state - initialize from history if available
  const [carouselData, setCarouselData] = useState<CarouselData>(() => {
    if (initialData?.carouselData && initialData.carouselData.cards) {
      return {
        message: initialData.carouselData.message || '',
        cards: initialData.carouselData.cards.map((card) => ({
          id: card.id || crypto.randomUUID(),
          text: card.text || '',
          image: card.image || '',
          buttons: card.buttons?.map((btn) => ({
            id: btn.id || crypto.randomUUID(),
            type: btn.type,
            label: btn.label,
            url: btn.type === 'URL' ? (btn.value || '') : '',
            phone: btn.type === 'CALL' ? (btn.value || '') : '',
          })) || [],
        })),
      };
    }
    return {
      message: '',
      cards: [createEmptyCard(), createEmptyCard()],
    };
  });

  const totalMembers = selectedGroups.reduce((acc, g) => acc + g.size, 0);
  const totalRegularMembers = selectedGroups.reduce((acc, g) => {
    return acc + g.participants.filter(p => !p.isAdmin && !p.isSuperAdmin).length;
  }, 0);

  // Calculate unique regular members across all selected groups (for deduplication)
  const uniqueRegularMembers = useMemo(() => {
    const seenJids = new Set<string>();
    const uniqueMembers: { jid: string; groupName: string }[] = [];
    
    for (const group of selectedGroups) {
      const regularMembers = group.participants.filter(p => !p.isAdmin && !p.isSuperAdmin);
      for (const member of regularMembers) {
        if (!seenJids.has(member.jid)) {
          seenJids.add(member.jid);
          uniqueMembers.push({ jid: member.jid, groupName: group.name });
        }
      }
    }
    
    return uniqueMembers;
  }, [selectedGroups]);

  const uniqueRegularMembersCount = uniqueRegularMembers.length;

  // Initialize/reset selectedParticipants when excludeAdmins or groups change
  useEffect(() => {
    if (excludeAdmins) {
      // Auto-select all participants
      setSelectedParticipants(new Set(uniqueRegularMembers.map((m) => m.jid)));
    } else {
      setSelectedParticipants(new Set());
    }
  }, [excludeAdmins, uniqueRegularMembers]);

  // Callback for participant selection changes
  const handleParticipantSelectionChange = useCallback((newSelection: Set<string>) => {
    setSelectedParticipants(newSelection);
  }, []);

  // Cleanup preview URL on unmount or file change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Timer for elapsed time during sending
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if ((progress.status === 'sending' || progress.status === 'paused') && progress.startedAt) {
      intervalId = setInterval(() => {
        if (progress.status === 'sending') {
          setElapsedTime(Math.floor((Date.now() - progress.startedAt!) / 1000));
        }
      }, 1000);
    } else if (progress.status === 'idle') {
      setElapsedTime(0);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [progress.status, progress.startedAt]);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Wait while paused, checking every 100ms
  const waitWhilePaused = async (): Promise<void> => {
    while (isPausedRef.current) {
      await delay(100);
    }
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setProgress(p => ({ ...p, status: 'paused' }));
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setProgress(p => ({ ...p, status: 'sending' }));
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    isPausedRef.current = false; // Unpause to allow the loop to exit
  };

  // getRandomDelay, compressImageToThumbnail imported from broadcastSender
  const getGroupDelay = (): number => getRandomDelay(randomDelay, GROUP_DELAY_MS);

  // Save broadcast log to database
  const saveBroadcastLog = async (params: {
    messageType: string;
    content: string | null;
    mediaUrl: string | null;
    groupsTargeted: number;
    recipientsTargeted: number;
    recipientsSuccess: number;
    recipientsFailed: number;
    status: 'completed' | 'cancelled' | 'error';
    startedAt: number;
    errorMessage?: string;
    groupNames?: string[];
    carouselData?: CarouselData | null;
  }) => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;

      const completedAt = Date.now();
      const durationSeconds = Math.floor((completedAt - params.startedAt) / 1000);

      // Prepare carousel data for storage (upload files to storage for high-res)
      let storedCarouselData = null;
      if (params.carouselData) {
        const processedCards = await Promise.all(
          params.carouselData.cards.map(async (card, idx) => {
            let imageForStorage = card.image || '';
            
            try {
              // If we have a file, upload it to storage in high resolution
              if (card.imageFile) {
                imageForStorage = await uploadCarouselImage(card.imageFile);
              } else if (card.image && card.image.startsWith('data:')) {
                // If it's base64, convert to blob and upload
                const file = await base64ToFile(card.image, `card-${idx}.jpg`);
                imageForStorage = await uploadCarouselImage(file);
              }
              // If it's already an external URL (https://...), keep as is
            } catch (uploadErr) {
              console.error('Error uploading carousel image:', uploadErr);
              // Fallback: keep original image (may be low-res or base64)
            }
            
            return {
              id: card.id,
              text: card.text,
              image: imageForStorage,
              buttons: card.buttons.map(btn => ({
                id: btn.id,
                type: btn.type,
                label: btn.label,
                value: btn.url || btn.phone || '',
              })),
            };
          })
        );

        storedCarouselData = {
          message: params.carouselData.message,
          cards: processedCards,
        };
      }

      await supabase.from('broadcast_logs').insert({
        user_id: session.data.session.user.id,
        instance_id: instance.id,
        instance_name: instance.name,
        message_type: params.messageType,
        content: params.content,
        media_url: params.mediaUrl,
        groups_targeted: params.groupsTargeted,
        recipients_targeted: params.recipientsTargeted,
        recipients_success: params.recipientsSuccess,
        recipients_failed: params.recipientsFailed,
        exclude_admins: excludeAdmins,
        random_delay: randomDelay,
        status: params.status,
        started_at: new Date(params.startedAt).toISOString(),
        completed_at: new Date(completedAt).toISOString(),
        duration_seconds: durationSeconds,
        error_message: params.errorMessage || null,
        group_names: params.groupNames || selectedGroups.map(g => g.name),
        carousel_data: storedCarouselData,
      });
    } catch (err) {
      console.error('Error saving broadcast log:', err);
    }
  };

  // fileToBase64 imported from broadcastSender

  const clearFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFilename('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // getAcceptedTypes imported from broadcastSender

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande. Máximo: 10MB');
      return;
    }

    // Validate file type for specific media types
    if (mediaType === 'video' && !ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast.error('Apenas vídeos MP4 são suportados');
      return;
    }

    if (mediaType === 'image' && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato de imagem não suportado');
      return;
    }

    if (mediaType === 'audio' && !ALLOWED_AUDIO_TYPES.includes(file.type)) {
      toast.error('Formato de áudio não suportado (use MP3 ou OGG)');
      return;
    }

    clearFile();
    setSelectedFile(file);
    setFilename(file.name);

    // Create preview for images and videos
    if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  // Wrapper functions that bind instance.id to shared sender functions
  const sendText = (number: string, text: string, accessToken: string) =>
    sendToNumber(instance.id, number, text, accessToken);
  const sendMediaMsg = (number: string, mediaData: string, type: string, captionText: string, docName: string, accessToken: string) =>
    sendMediaToNumber(instance.id, number, mediaData, type, captionText, docName, accessToken);
  const sendCarouselMsg = (number: string, carousel: CarouselData, accessToken: string) =>
    sendCarouselToNumber(instance.id, number, carousel, accessToken, fileToBase64);

  const handleSend = async () => {
    if (activeTab === 'text') {
      await handleSendText();
    } else if (activeTab === 'carousel') {
      await handleSendCarousel();
    } else {
      await handleSendMedia();
    }
  };

  const handleSendText = async () => {
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage) {
      toast.error('Digite uma mensagem');
      return;
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres)`);
      return;
    }

    if (selectedGroups.length === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        setProgress(p => ({ ...p, status: 'error' }));
        return;
      }

      const accessToken = session.data.session.access_token;
      const results: SendProgress['results'] = [];
      
      // Reset cancel flag at start
      isCancelledRef.current = false;

      if (excludeAdmins) {
        // DEDUPLICATION: Get unique members across all groups, filtered by selection
        const membersToSend = uniqueRegularMembers.filter((m) => selectedParticipants.has(m.jid));
        
        if (membersToSend.length === 0) {
          toast.error('Selecione pelo menos um participante');
          return;
        }
        
        setProgress({
          currentGroup: 1,
          totalGroups: 1,
          currentMember: 0,
          totalMembers: membersToSend.length,
          groupName: `${selectedGroups.length} grupo(s) - Envio individual`,
          status: 'sending',
          results: [],
          startedAt: Date.now(),
        });

        let successCount = 0;
        let failCount = 0;

        for (let j = 0; j < membersToSend.length; j++) {
          // Check for cancellation
          if (isCancelledRef.current) {
            results.push({ 
              groupName: `Cancelado após ${successCount} envio(s)`, 
              success: true 
            });
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${successCount} mensagem(ns) enviada(s).`);
            
            // Save log for cancelled broadcast
            await saveBroadcastLog({
              messageType: 'text',
              content: trimmedMessage,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: membersToSend.length,
              recipientsSuccess: successCount,
              recipientsFailed: failCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          // Wait if paused
          await waitWhilePaused();
          
          // Check again after unpause (might have been cancelled while paused)
          if (isCancelledRef.current) {
            results.push({ 
              groupName: `Cancelado após ${successCount} envio(s)`, 
              success: true 
            });
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${successCount} mensagem(ns) enviada(s).`);
            
            // Save log for cancelled broadcast
            await saveBroadcastLog({
              messageType: 'text',
              content: trimmedMessage,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: membersToSend.length,
              recipientsSuccess: successCount,
              recipientsFailed: failCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          try {
            await sendText(membersToSend[j].jid, trimmedMessage, accessToken);
            successCount++;
            // Save to HelpDesk
            const phone = membersToSend[j].jid.replace('@s.whatsapp.net', '');
            saveToHelpdesk(instance.id, membersToSend[j].jid, phone, null, {
              content: trimmedMessage,
              media_type: 'text',
            });
          } catch (err) {
            console.error(`Erro ao enviar para ${membersToSend[j].jid}:`, err);
            failCount++;
          }
          
          setProgress(p => ({ ...p, currentMember: j + 1 }));
          
          if (j < membersToSend.length - 1) {
            await delay(getRandomDelay(randomDelay));
          }
        }

        results.push({ 
          groupName: `Envio individual (${membersToSend.length} contatos únicos)`,
          success: failCount === 0 
        });

        setProgress(p => ({ ...p, status: 'success', results }));

        // Save log for successful broadcast
        await saveBroadcastLog({
          messageType: 'text',
          content: trimmedMessage,
          mediaUrl: null,
          groupsTargeted: selectedGroups.length,
          recipientsTargeted: membersToSend.length,
          recipientsSuccess: successCount,
          recipientsFailed: failCount,
          status: 'completed',
          startedAt: progress.startedAt || Date.now(),
        });

        if (failCount > 0) {
          toast.warning(`Enviado para ${successCount} contato(s). ${failCount} falha(s).`);
        } else {
          toast.success(`Mensagem enviada para ${successCount} contato(s) únicos!`);
        }
      } else {
        // Normal group send (message goes to each group)
        setProgress({
          currentGroup: 0,
          totalGroups: selectedGroups.length,
          currentMember: 0,
          totalMembers: 0,
          groupName: '',
          status: 'sending',
          results: [],
          startedAt: Date.now(),
        });

        for (let i = 0; i < selectedGroups.length; i++) {
          // Check for cancellation
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} grupo(s) enviado(s).`);
            
            // Save log for cancelled broadcast
            await saveBroadcastLog({
              messageType: 'text',
              content: trimmedMessage,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: selectedGroups.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          // Wait if paused
          await waitWhilePaused();
          
          // Check again after unpause
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} grupo(s) enviado(s).`);
            
            // Save log for cancelled broadcast
            await saveBroadcastLog({
              messageType: 'text',
              content: trimmedMessage,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: selectedGroups.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          const group = selectedGroups[i];
          
          try {
            setProgress(p => ({
              ...p,
              currentGroup: i + 1,
              groupName: group.name,
              currentMember: 0,
              totalMembers: 1,
            }));

            await sendText(group.id, trimmedMessage, accessToken);
            setProgress(p => ({ ...p, currentMember: 1 }));

            results.push({ groupName: group.name, success: true });
          } catch (error) {
            console.error(`Erro ao enviar para grupo ${group.name}:`, error);
            results.push({ 
              groupName: group.name, 
              success: false, 
              error: error instanceof Error ? error.message : 'Erro desconhecido' 
            });
          }

          // Delay between groups
          if (i < selectedGroups.length - 1) {
            await delay(getGroupDelay());
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        setProgress(p => ({ ...p, status: 'success', results }));

        // Save log for successful broadcast
        await saveBroadcastLog({
          messageType: 'text',
          content: trimmedMessage,
          mediaUrl: null,
          groupsTargeted: selectedGroups.length,
          recipientsTargeted: selectedGroups.length,
          recipientsSuccess: successCount,
          recipientsFailed: failCount,
          status: 'completed',
          startedAt: progress.startedAt || Date.now(),
        });

        if (failCount > 0) {
          toast.warning(`Enviado para ${successCount} grupo(s). ${failCount} falha(s).`);
        } else {
          toast.success(`Mensagem enviada para ${successCount} grupo(s)!`);
        }
      }

      setMessage('');
      onComplete?.();
    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast.error('Erro ao enviar mensagens');
      setProgress(p => ({ ...p, status: 'error' }));
    }
  };

  const handleSendMedia = async () => {
    const finalMediaUrl = selectedFile ? await fileToBase64(selectedFile) : mediaUrl.trim();
    
    if (!finalMediaUrl) {
      toast.error('Selecione um arquivo ou informe uma URL');
      return;
    }

    if (selectedGroups.length === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }

    if (mediaType === 'file' && !filename.trim()) {
      toast.error('Informe o nome do arquivo');
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        setProgress(p => ({ ...p, status: 'error' }));
        return;
      }

      const accessToken = session.data.session.access_token;
      const results: SendProgress['results'] = [];
      
      const sendType = mediaType === 'audio' && isPtt ? 'ptt' : mediaType === 'file' ? 'document' : mediaType;
      const docName = mediaType === 'file' ? filename.trim() : '';
      
      // Reset cancel flag at start
      isCancelledRef.current = false;

      if (excludeAdmins) {
        // DEDUPLICATION: Get unique members across all groups, filtered by selection
        const membersToSend = uniqueRegularMembers.filter((m) => selectedParticipants.has(m.jid));
        
        if (membersToSend.length === 0) {
          toast.error('Selecione pelo menos um participante');
          return;
        }
        
        setProgress({
          currentGroup: 1,
          totalGroups: 1,
          currentMember: 0,
          totalMembers: membersToSend.length,
          groupName: `${selectedGroups.length} grupo(s) - Envio individual`,
          status: 'sending',
          results: [],
          startedAt: Date.now(),
        });

        let successCount = 0;
        let failCount = 0;

        for (let j = 0; j < membersToSend.length; j++) {
          // Check for cancellation
          if (isCancelledRef.current) {
            const mediaLabel = mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : 'Arquivo';
            results.push({ 
              groupName: `Cancelado após ${successCount} envio(s)`, 
              success: true 
            });
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${successCount} ${mediaLabel.toLowerCase()}(s) enviado(s).`);
            
            // Save log for cancelled media broadcast
            await saveBroadcastLog({
              messageType: sendType,
              content: caption.trim() || null,
              mediaUrl: mediaUrl.trim() || null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: membersToSend.length,
              recipientsSuccess: successCount,
              recipientsFailed: failCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          // Wait if paused
          await waitWhilePaused();
          
          // Check again after unpause
          if (isCancelledRef.current) {
            const mediaLabel = mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : 'Arquivo';
            results.push({ 
              groupName: `Cancelado após ${successCount} envio(s)`, 
              success: true 
            });
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${successCount} ${mediaLabel.toLowerCase()}(s) enviado(s).`);
            
            // Save log for cancelled media broadcast
            await saveBroadcastLog({
              messageType: sendType,
              content: caption.trim() || null,
              mediaUrl: mediaUrl.trim() || null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: membersToSend.length,
              recipientsSuccess: successCount,
              recipientsFailed: failCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          try {
            await sendMediaMsg(membersToSend[j].jid, finalMediaUrl, sendType, caption.trim(), docName, accessToken);
            successCount++;
            // Save to HelpDesk
            const phone = membersToSend[j].jid.replace('@s.whatsapp.net', '');
            saveToHelpdesk(instance.id, membersToSend[j].jid, phone, null, {
              content: caption.trim() || null,
              media_type: sendType === 'ptt' ? 'audio' : sendType === 'document' ? 'document' : sendType,
              media_url: mediaUrl.trim() || null,
            });
          } catch (err) {
            console.error(`Erro ao enviar mídia para ${membersToSend[j].jid}:`, err);
            failCount++;
          }
          
          setProgress(p => ({ ...p, currentMember: j + 1 }));
          
          if (j < membersToSend.length - 1) {
            await delay(getRandomDelay(randomDelay));
          }
        }

        results.push({ 
          groupName: `Envio individual (${membersToSend.length} contatos únicos)`,
          success: failCount === 0 
        });

        setProgress(p => ({ ...p, status: 'success', results }));

        // Save log for successful media broadcast
        await saveBroadcastLog({
          messageType: sendType,
          content: caption.trim() || null,
          mediaUrl: mediaUrl.trim() || null,
          groupsTargeted: selectedGroups.length,
          recipientsTargeted: membersToSend.length,
          recipientsSuccess: successCount,
          recipientsFailed: failCount,
          status: 'completed',
          startedAt: progress.startedAt || Date.now(),
        });

        const mediaLabel = mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : 'Arquivo';
        if (failCount > 0) {
          toast.warning(`${mediaLabel} enviado para ${successCount} contato(s). ${failCount} falha(s).`);
        } else {
          toast.success(`${mediaLabel} enviado para ${successCount} contato(s) únicos!`);
        }
      } else {
        // Normal group send (message goes to each group)
        setProgress({
          currentGroup: 0,
          totalGroups: selectedGroups.length,
          currentMember: 0,
          totalMembers: 0,
          groupName: '',
          status: 'sending',
          results: [],
          startedAt: Date.now(),
        });

        for (let i = 0; i < selectedGroups.length; i++) {
          // Check for cancellation
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} grupo(s) enviado(s).`);
            
            // Save log for cancelled media broadcast
            await saveBroadcastLog({
              messageType: sendType,
              content: caption.trim() || null,
              mediaUrl: mediaUrl.trim() || null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: selectedGroups.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          // Wait if paused
          await waitWhilePaused();
          
          // Check again after unpause
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} grupo(s) enviado(s).`);
            
            // Save log for cancelled media broadcast
            await saveBroadcastLog({
              messageType: sendType,
              content: caption.trim() || null,
              mediaUrl: mediaUrl.trim() || null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: selectedGroups.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: progress.startedAt || Date.now(),
            });
            return;
          }
          
          const group = selectedGroups[i];
          
          try {
            setProgress(p => ({
              ...p,
              currentGroup: i + 1,
              groupName: group.name,
              currentMember: 0,
              totalMembers: 1,
            }));

            await sendMediaMsg(group.id, finalMediaUrl, sendType, caption.trim(), docName, accessToken);
            setProgress(p => ({ ...p, currentMember: 1 }));

            results.push({ groupName: group.name, success: true });
          } catch (error) {
            console.error(`Erro ao enviar mídia para grupo ${group.name}:`, error);
            results.push({ 
              groupName: group.name, 
              success: false, 
              error: error instanceof Error ? error.message : 'Erro desconhecido' 
            });
          }

          if (i < selectedGroups.length - 1) {
            await delay(getGroupDelay());
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        setProgress(p => ({ ...p, status: 'success', results }));

        // Save log for successful media broadcast
        await saveBroadcastLog({
          messageType: sendType,
          content: caption.trim() || null,
          mediaUrl: mediaUrl.trim() || null,
          groupsTargeted: selectedGroups.length,
          recipientsTargeted: selectedGroups.length,
          recipientsSuccess: successCount,
          recipientsFailed: failCount,
          status: 'completed',
          startedAt: progress.startedAt || Date.now(),
        });

        if (failCount > 0) {
          toast.warning(`Enviado para ${successCount} grupo(s). ${failCount} falha(s).`);
        } else {
          const mediaLabel = mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : 'Arquivo';
          toast.success(`${mediaLabel} enviado para ${successCount} grupo(s)!`);
        }
      }

      clearFile();
      setMediaUrl('');
      setCaption('');
      onComplete?.();
    } catch (error) {
      console.error('Error sending media broadcast:', error);
      toast.error('Erro ao enviar mídia');
      setProgress(p => ({ ...p, status: 'error' }));
    }
  };

  const handleSendCarousel = async () => {
    // Validate carousel
    if (carouselData.cards.length < 2) {
      toast.error('O carrossel precisa ter pelo menos 2 cards');
      return;
    }

    const hasInvalidCards = carouselData.cards.some(card => 
      (!card.image && !card.imageFile) || !card.text.trim()
    );
    if (hasInvalidCards) {
      toast.error('Todos os cards devem ter imagem e texto');
      return;
    }

    const hasInvalidButtons = carouselData.cards.some(card =>
      card.buttons.some(btn => {
        if (!btn.label.trim()) return true;
        if (btn.type === 'URL' && !btn.url?.trim()) return true;
        if (btn.type === 'CALL' && !btn.phone?.trim()) return true;
        return false;
      })
    );
    if (hasInvalidButtons) {
      toast.error('Preencha todos os campos dos botões');
      return;
    }

    if (selectedGroups.length === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }

    // Validate participant selection when excludeAdmins is enabled
    if (excludeAdmins && selectedParticipants.size === 0) {
      toast.error('Selecione pelo menos um participante');
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        setProgress(p => ({ ...p, status: 'error' }));
        return;
      }

      const accessToken = session.data.session.access_token;
      const results: SendProgress['results'] = [];
      const startedAtTimestamp = Date.now(); // Capture timestamp locally to avoid stale closure
      
      isCancelledRef.current = false;

      if (excludeAdmins) {
        // Send to individual participants
        const membersToSend = uniqueRegularMembers.filter(m => selectedParticipants.has(m.jid));

        setProgress({
          currentGroup: 0,
          totalGroups: 1,
          currentMember: 0,
          totalMembers: membersToSend.length,
          groupName: `${membersToSend.length} participante(s)`,
          status: 'sending',
          results: [],
          startedAt: startedAtTimestamp,
        });

        for (let j = 0; j < membersToSend.length; j++) {
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} mensagem(s) enviada(s).`);
            
            await saveBroadcastLog({
              messageType: 'carousel',
              content: carouselData.message || null,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: membersToSend.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: startedAtTimestamp,
              carouselData: carouselData,
            });
            return;
          }

          await waitWhilePaused();

          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} mensagem(s) enviada(s).`);
            
            await saveBroadcastLog({
              messageType: 'carousel',
              content: carouselData.message || null,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: membersToSend.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: startedAtTimestamp,
              carouselData: carouselData,
            });
            return;
          }

          const member = membersToSend[j];

          try {
            setProgress(p => ({
              ...p,
              currentMember: j + 1,
              groupName: `Enviando para ${j + 1} de ${membersToSend.length}`,
            }));

            await sendCarouselMsg(member.jid, carouselData, accessToken);
            results.push({ groupName: member.jid, success: true });
            // Save to HelpDesk
            const phone = member.jid.replace('@s.whatsapp.net', '');
            // Upload carousel images before saving to helpdesk
            try {
              const helpdeskCards = await Promise.all(
                carouselData.cards.map(async (c) => {
                  let imageUrl = c.image || '';
                  if (c.imageFile) {
                    imageUrl = await uploadCarouselImage(c.imageFile);
                  } else if (c.image && c.image.startsWith('data:')) {
                    const file = await base64ToFile(c.image, `card-${c.id}.jpg`);
                    imageUrl = await uploadCarouselImage(file);
                  }
                  return {
                    id: c.id,
                    text: c.text,
                    image: imageUrl,
                    buttons: c.buttons.map(b => ({
                      id: b.id,
                      type: b.type,
                      label: b.label,
                      value: b.url || b.phone || '',
                    })),
                  };
                })
              );
              saveToHelpdesk(instance.id, member.jid, phone, null, {
                content: carouselData.message || '📋 Carrossel enviado',
                media_type: 'carousel',
                media_url: JSON.stringify({
                  message: carouselData.message,
                  cards: helpdeskCards,
                }),
              });
            } catch (uploadErr) {
              console.error('[BroadcastMessageForm] Error uploading carousel images for helpdesk:', uploadErr);
            }
          } catch (error) {
            console.error(`Erro ao enviar carrossel para ${member.jid}:`, error);
            results.push({
              groupName: member.jid,
              success: false,
              error: error instanceof Error ? error.message : 'Erro desconhecido',
            });
          }

          if (j < membersToSend.length - 1) {
            await delay(getRandomDelay(randomDelay));
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        setProgress(p => ({ ...p, status: 'success', results }));

        await saveBroadcastLog({
          messageType: 'carousel',
          content: carouselData.message || null,
          mediaUrl: null,
          groupsTargeted: selectedGroups.length,
          recipientsTargeted: membersToSend.length,
          recipientsSuccess: successCount,
          recipientsFailed: failCount,
          status: 'completed',
          startedAt: startedAtTimestamp,
          carouselData: carouselData,
        });

        if (failCount > 0) {
          toast.warning(`Carrossel enviado para ${successCount} contato(s). ${failCount} falha(s).`);
        } else {
          toast.success(`Carrossel enviado para ${successCount} contato(s)!`);
        }
      } else {
        // Send to groups (original flow)
        setProgress({
          currentGroup: 0,
          totalGroups: selectedGroups.length,
          currentMember: 0,
          totalMembers: 0,
          groupName: '',
          status: 'sending',
          results: [],
          startedAt: startedAtTimestamp,
        });

        for (let i = 0; i < selectedGroups.length; i++) {
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} grupo(s) enviado(s).`);
            
            await saveBroadcastLog({
              messageType: 'carousel',
              content: carouselData.message || null,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: selectedGroups.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: startedAtTimestamp,
              carouselData: carouselData,
            });
            return;
          }
          
          await waitWhilePaused();
          
          if (isCancelledRef.current) {
            const sentCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            setProgress(p => ({ ...p, status: 'cancelled', results }));
            toast.info(`Envio cancelado. ${sentCount} grupo(s) enviado(s).`);
            
            await saveBroadcastLog({
              messageType: 'carousel',
              content: carouselData.message || null,
              mediaUrl: null,
              groupsTargeted: selectedGroups.length,
              recipientsTargeted: selectedGroups.length,
              recipientsSuccess: sentCount,
              recipientsFailed: failedCount,
              status: 'cancelled',
              startedAt: startedAtTimestamp,
              carouselData: carouselData,
            });
            return;
          }
          
          const group = selectedGroups[i];
          
          try {
            setProgress(p => ({
              ...p,
              currentGroup: i + 1,
              groupName: group.name,
              currentMember: 0,
              totalMembers: 1,
            }));

            await sendCarouselMsg(group.id, carouselData, accessToken);
            setProgress(p => ({ ...p, currentMember: 1 }));

            results.push({ groupName: group.name, success: true });
          } catch (error) {
            console.error(`Erro ao enviar carrossel para grupo ${group.name}:`, error);
            results.push({ 
              groupName: group.name, 
              success: false, 
              error: error instanceof Error ? error.message : 'Erro desconhecido' 
            });
          }

          if (i < selectedGroups.length - 1) {
            await delay(getGroupDelay());
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        setProgress(p => ({ ...p, status: 'success', results }));

        await saveBroadcastLog({
          messageType: 'carousel',
          content: carouselData.message || null,
          mediaUrl: null,
          groupsTargeted: selectedGroups.length,
          recipientsTargeted: selectedGroups.length,
          recipientsSuccess: successCount,
          recipientsFailed: failCount,
          status: 'completed',
          startedAt: startedAtTimestamp,
          carouselData: carouselData,
        });

        if (failCount > 0) {
          toast.warning(`Carrossel enviado para ${successCount} grupo(s). ${failCount} falha(s).`);
        } else {
          toast.success(`Carrossel enviado para ${successCount} grupo(s)!`);
        }
      }

      // Reset carousel
      setCarouselData({
        message: '',
        cards: [createEmptyCard(), createEmptyCard()],
      });
      onComplete?.();
    } catch (error) {
      console.error('Error sending carousel broadcast:', error);
      toast.error('Erro ao enviar carrossel');
      setProgress(p => ({ ...p, status: 'error' }));
    }
  };

  const handleSchedule = async (config: ScheduleConfig) => {
    if (activeTab === 'text') {
      await handleScheduleText(config);
    } else if (activeTab === 'carousel') {
      toast.error('Agendamento de carrossel não suportado ainda');
      return;
    } else {
      await handleScheduleMedia(config);
    }
  };

  const handleScheduleText = async (config: ScheduleConfig) => {
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage) {
      toast.error('Digite uma mensagem');
      return;
    }

    if (selectedGroups.length === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }

    setIsScheduling(true);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        return;
      }

      // Criar um agendamento para cada grupo selecionado
      const insertPromises = selectedGroups.map(group => {
        const regularMembers = group.participants.filter(p => !p.isAdmin && !p.isSuperAdmin);
        const recipients = excludeAdmins && regularMembers.length > 0
          ? regularMembers.map(m => ({ jid: m.jid }))
          : null;

        return supabase.from('scheduled_messages').insert({
          user_id: session.data.session!.user.id,
          instance_id: instance.id,
          group_jid: group.id,
          group_name: group.name,
          exclude_admins: excludeAdmins,
          recipients,
          message_type: 'text',
          content: trimmedMessage,
          scheduled_at: config.scheduledAt.toISOString(),
          next_run_at: config.scheduledAt.toISOString(),
          is_recurring: config.isRecurring,
          recurrence_type: config.isRecurring ? config.recurrenceType : null,
          recurrence_interval: config.recurrenceInterval,
          recurrence_days: config.recurrenceDays.length > 0 ? config.recurrenceDays : null,
          recurrence_end_at: config.recurrenceEndAt?.toISOString() || null,
          recurrence_count: config.recurrenceCount || null,
          random_delay: config.randomDelay,
          status: 'pending',
        });
      });

      const results = await Promise.all(insertPromises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        throw new Error(`Falha ao agendar ${errors.length} grupo(s)`);
      }

      toast.success(`${selectedGroups.length} agendamento(s) criado(s)!`);
      setMessage('');
      setShowScheduleDialog(false);
      onComplete?.();
    } catch (error) {
      console.error('Error scheduling broadcast:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao agendar');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleScheduleMedia = async (config: ScheduleConfig) => {
    const trimmedUrl = mediaUrl.trim();
    
    if (!trimmedUrl) {
      toast.error('Para agendar mídia, informe uma URL (não arquivo local)');
      return;
    }

    if (selectedGroups.length === 0) {
      toast.error('Selecione pelo menos um grupo');
      return;
    }

    if (mediaType === 'file' && !filename.trim()) {
      toast.error('Informe o nome do arquivo');
      return;
    }

    setIsScheduling(true);

    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada');
        return;
      }

      const sendType = mediaType === 'audio' && isPtt ? 'ptt' : mediaType === 'file' ? 'document' : mediaType;

      const insertPromises = selectedGroups.map(group => {
        const regularMembers = group.participants.filter(p => !p.isAdmin && !p.isSuperAdmin);
        const recipients = excludeAdmins && regularMembers.length > 0
          ? regularMembers.map(m => ({ jid: m.jid }))
          : null;

        return supabase.from('scheduled_messages').insert({
          user_id: session.data.session!.user.id,
          instance_id: instance.id,
          group_jid: group.id,
          group_name: group.name,
          exclude_admins: excludeAdmins,
          recipients,
          message_type: sendType,
          content: caption.trim() || null,
          media_url: trimmedUrl,
          filename: mediaType === 'file' ? filename.trim() : null,
          scheduled_at: config.scheduledAt.toISOString(),
          next_run_at: config.scheduledAt.toISOString(),
          is_recurring: config.isRecurring,
          recurrence_type: config.isRecurring ? config.recurrenceType : null,
          recurrence_interval: config.recurrenceInterval,
          recurrence_days: config.recurrenceDays.length > 0 ? config.recurrenceDays : null,
          recurrence_end_at: config.recurrenceEndAt?.toISOString() || null,
          recurrence_count: config.recurrenceCount || null,
          random_delay: config.randomDelay,
          status: 'pending',
        });
      });

      const results = await Promise.all(insertPromises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        throw new Error(`Falha ao agendar ${errors.length} grupo(s)`);
      }

      toast.success(`${selectedGroups.length} agendamento(s) de mídia criado(s)!`);
      setMediaUrl('');
      setCaption('');
      setFilename('');
      setShowScheduleDialog(false);
      onComplete?.();
    } catch (error) {
      console.error('Error scheduling media broadcast:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao agendar mídia');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCloseProgress = () => {
    setProgress(p => ({ ...p, status: 'idle', results: [], startedAt: null }));
    setElapsedTime(0);
  };

  const characterCount = message.length;
  const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;
  const isSending = progress.status === 'sending' || progress.status === 'paused';

  const targetCount = excludeAdmins ? selectedParticipants.size : selectedGroups.length;

  // Calcular tempo estimado de envio
  const getEstimatedTime = (): { min: number; max: number } | null => {
    if (randomDelay === 'none' || targetCount <= 1) return null;
    
    const messagesCount = targetCount - 1; // Delays happen between messages, not after the last one
    
    if (randomDelay === '5-10') {
      return {
        min: messagesCount * 5,  // 5 seconds minimum
        max: messagesCount * 10, // 10 seconds maximum
      };
    } else {
      return {
        min: messagesCount * 10, // 10 seconds minimum
        max: messagesCount * 20, // 20 seconds maximum
      };
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      if (minutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h${minutes}min`;
    }
    
    return `${minutes} min`;
  };

  const estimatedTime = getEstimatedTime();

  // Calculate remaining time during sending
  const getRemainingTime = (): number | null => {
    if (!progress.startedAt || elapsedTime === 0) return null;
    
    const totalItems = excludeAdmins ? progress.totalMembers : progress.totalGroups;
    const completedItems = excludeAdmins ? progress.currentMember : progress.currentGroup;
    
    if (completedItems === 0 || completedItems >= totalItems) return null;
    
    const avgTimePerItem = elapsedTime / completedItems;
    const remainingItems = totalItems - completedItems;
    
    return Math.ceil(avgTimePerItem * remainingItems);
  };

  const remainingTime = getRemainingTime();

  const isMediaValid = activeTab === 'media' && (selectedFile || mediaUrl.trim()) && (mediaType !== 'file' || filename.trim());
  const isTextValid = activeTab === 'text' && message.trim() && !isOverLimit;
  const isCarouselValid = activeTab === 'carousel' && carouselData.cards.length >= 2 && 
    carouselData.cards.every(card => (card.image || card.imageFile) && card.text.trim()) &&
    carouselData.cards.every(card => card.buttons.every(btn => 
      btn.label.trim() && 
      (btn.type !== 'URL' || btn.url?.trim()) && 
      (btn.type !== 'CALL' || btn.phone?.trim())
    ));
  const canSend = (isTextValid || isMediaValid || isCarouselValid) && selectedGroups.length > 0 && !(excludeAdmins && activeTab !== 'carousel' && selectedParticipants.size === 0);
  const canSchedule = activeTab === 'text' 
    ? !!(message.trim() && !isOverLimit && selectedGroups.length > 0)
    : activeTab === 'media'
    ? !!(mediaUrl.trim() && selectedGroups.length > 0 && (mediaType !== 'file' || filename.trim()))
    : false;

  const handleSelectTemplate = (template: MessageTemplate) => {
    if (template.message_type === 'carousel' && template.carousel_data) {
      setActiveTab('carousel');
      setCarouselData(template.carousel_data);
    } else if (template.message_type === 'text') {
      setActiveTab('text');
      setMessage(template.content || '');
    } else {
      setActiveTab('media');
      // Map message types
      const typeMap: Record<string, MediaType> = {
        'image': 'image',
        'video': 'video',
        'audio': 'audio',
        'ptt': 'audio',
        'document': 'file',
      };
      const newMediaType = typeMap[template.message_type] || 'image';
      setMediaType(newMediaType);
      setIsPtt(template.message_type === 'ptt');
      setMediaUrl(template.media_url || '');
      setCaption(template.content || '');
      setFilename(template.filename || '');
      clearFile();
    }
    toast.success(`Template "${template.name}" aplicado`);
  };

  const handleSaveTemplate = async () => {
    if (activeTab === 'carousel') {
      if (carouselData.cards.length < 2) {
        toast.error('O carrossel precisa ter pelo menos 2 cards');
        return null;
      }
      // Upload local files to storage before saving
      const hasLocalFiles = carouselData.cards.some(card => card.imageFile);
      if (hasLocalFiles) {
        toast.info('Enviando imagens do carrossel...');
      }
      try {
        const uploadedCards = await Promise.all(
          carouselData.cards.map(async (card) => {
            if (card.imageFile) {
              const url = await uploadCarouselImage(card.imageFile);
              return { ...card, image: url, imageFile: undefined };
            }
            return { ...card, imageFile: undefined };
          })
        );
        return {
          name: '',
          content: carouselData.message || undefined,
          message_type: 'carousel',
          carousel_data: {
            message: carouselData.message,
            cards: uploadedCards,
          },
        };
      } catch (err) {
        console.error('Error uploading carousel images:', err);
        toast.error('Erro ao enviar imagens. Tente novamente.');
        return null;
      }
    } else if (activeTab === 'text') {
      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        toast.error('Digite uma mensagem para salvar');
        return null;
      }
      return {
        name: '',
        content: trimmedMessage,
        message_type: 'text',
      };
    } else {
      const trimmedUrl = mediaUrl.trim();
      if (!trimmedUrl && !selectedFile) {
        toast.error('Selecione uma mídia para salvar');
        return null;
      }
      // For templates, we only save URL (not uploaded files)
      if (!trimmedUrl) {
        toast.error('Para salvar template de mídia, use uma URL');
        return null;
      }
      const sendType = mediaType === 'audio' && isPtt ? 'ptt' : mediaType === 'file' ? 'document' : mediaType;
      return {
        name: '',
        content: caption.trim() || undefined,
        message_type: sendType,
        media_url: trimmedUrl,
        filename: mediaType === 'file' ? filename.trim() : undefined,
      };
    }
  };

  return (
    <>
      <BroadcastProgressModal
        progress={progress}
        elapsedTime={elapsedTime}
        remainingTime={remainingTime}
        excludeAdmins={excludeAdmins}
        activeTab={activeTab}
        formatDuration={formatDuration}
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onClose={handleCloseProgress}
      />

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Compor Mensagem
            </CardTitle>
            <TemplateSelector
              onSelect={handleSelectTemplate}
              onSave={handleSaveTemplate}
              disabled={isSending}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Texto
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Mídia
              </TabsTrigger>
              <TabsTrigger value="carousel" className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                Carrossel
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="text" className="space-y-4">
              <Textarea
                placeholder="Digite sua mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isSending}
                className="min-h-[120px] resize-none"
                maxLength={MAX_MESSAGE_LENGTH + 100}
              />
              
              <div className="flex items-center justify-between">
                <EmojiPicker onEmojiSelect={(emoji) => setMessage(prev => prev + emoji)} disabled={isSending} />
                <span className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {characterCount.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()} caracteres
                </span>
              </div>
            </TabsContent>

            <TabsContent value="media" className="space-y-4">
              <BroadcastMediaTab
                mediaType={mediaType}
                setMediaType={setMediaType}
                mediaUrl={mediaUrl}
                setMediaUrl={setMediaUrl}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                previewUrl={previewUrl}
                setPreviewUrl={setPreviewUrl}
                caption={caption}
                setCaption={setCaption}
                isPtt={isPtt}
                setIsPtt={setIsPtt}
                filename={filename}
                setFilename={setFilename}
                isSending={isSending}
              />
            </TabsContent>

            <TabsContent value="carousel" className="space-y-4">
              <CarouselEditor
                value={carouselData}
                onChange={setCarouselData}
                disabled={isSending}
              />
            </TabsContent>

            {/* Message Preview - only for text and media tabs */}
            {activeTab !== 'carousel' && (
              <MessagePreview 
                type={activeTab === 'text' ? 'text' : mediaType}
                text={activeTab === 'text' ? message : caption}
                mediaUrl={activeTab === 'media' ? mediaUrl : undefined}
                previewUrl={activeTab === 'media' ? previewUrl : undefined}
                filename={filename}
                isPtt={isPtt}
                onTextChange={(newText) => {
                  if (activeTab === 'text') {
                    setMessage(newText);
                  } else {
                    setCaption(newText);
                  }
                }}
                disabled={isSending}
              />
            )}

            <BroadcastSendControls
              activeTab={activeTab}
              selectedGroups={selectedGroups}
              excludeAdmins={excludeAdmins}
              setExcludeAdmins={setExcludeAdmins}
              selectedParticipants={selectedParticipants}
              onParticipantSelectionChange={handleParticipantSelectionChange}
              uniqueRegularMembersCount={uniqueRegularMembersCount}
              totalMembers={totalMembers}
              totalRegularMembers={totalRegularMembers}
              randomDelay={randomDelay}
              setRandomDelay={setRandomDelay}
              estimatedTime={estimatedTime}
              formatDuration={formatDuration}
              mediaType={mediaType}
              isPtt={isPtt}
              carouselCardCount={carouselData.cards.length}
              isSending={isSending}
              canSend={canSend}
              canSchedule={canSchedule}
              onSend={handleSend}
              onSchedule={() => setShowScheduleDialog(true)}
            />
          </Tabs>
        </CardContent>
      </Card>

      <ScheduleMessageDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        onConfirm={handleSchedule}
        isLoading={isScheduling}
      />
    </>
  );
};

export default BroadcastMessageForm;
