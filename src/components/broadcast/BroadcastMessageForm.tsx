import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Send, Users, MessageSquare, Image, Loader2, CheckCircle2, XCircle, Clock, Video, Mic, FileIcon, Upload, X, Pause, Play, Timer, StopCircle, LayoutGrid } from 'lucide-react';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { toast } from 'sonner';
import { ScheduleMessageDialog, ScheduleConfig } from '@/components/group/ScheduleMessageDialog';
import { TemplateSelector } from './TemplateSelector';
import ParticipantSelector from './ParticipantSelector';
import MessagePreview from './MessagePreview';
import { CarouselEditor, CarouselData, createEmptyCard } from './CarouselEditor';
import { uploadCarouselImage, base64ToFile } from '@/lib/uploadCarouselImage';
import { saveToHelpdesk } from '@/lib/saveToHelpdesk';
import type { MessageTemplate } from '@/hooks/useMessageTemplates';
import type { Instance } from './InstanceSelector';
import type { Group } from './GroupSelector';

interface InitialData {
  messageType: string;
  content: string | null;
  mediaUrl: string | null;
  carouselData?: {
    message?: string;
    cards?: Array<{
      id?: string;
      text?: string;
      image?: string;
      buttons?: Array<{
        id?: string;
        type: 'URL' | 'REPLY' | 'CALL';
        label: string;
        value?: string;
      }>;
    }>;
  };
}

interface BroadcastMessageFormProps {
  instance: Instance;
  selectedGroups: Group[];
  onComplete?: () => void;
  initialData?: InitialData;
}

interface SendProgress {
  currentGroup: number;
  totalGroups: number;
  currentMember: number;
  totalMembers: number;
  groupName: string;
  status: 'idle' | 'sending' | 'paused' | 'success' | 'error' | 'cancelled';
  results: { groupName: string; success: boolean; error?: string }[];
  startedAt: number | null;
}

type MediaType = 'image' | 'video' | 'audio' | 'file';
type ActiveTab = 'text' | 'media' | 'carousel';

const MAX_MESSAGE_LENGTH = 4096;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SEND_DELAY_MS = 350;
const GROUP_DELAY_MS = 500;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/mp3', 'audio/wav'];

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Função para calcular delay aleatório baseado na configuração
  const getRandomDelay = (): number => {
    if (randomDelay === 'none') {
      return SEND_DELAY_MS; // 350ms padrão
    }
    
    const [min, max] = randomDelay === '5-10' 
      ? [5000, 10000]   // 5 a 10 segundos
      : [10000, 20000]; // 10 a 20 segundos
    
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const getGroupDelay = (): number => {
    if (randomDelay === 'none') {
      return GROUP_DELAY_MS; // 500ms padrão
    }
    
    const [min, max] = randomDelay === '5-10' 
      ? [5000, 10000]   // 5 a 10 segundos
      : [10000, 20000]; // 10 a 20 segundos
    
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // Compress and resize image to a smaller thumbnail for storage
  const compressImageToThumbnail = (file: File, maxWidth = 200, quality = 0.6): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      
      img.onerror = () => resolve('');
      img.src = URL.createObjectURL(file);
    });
  };

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

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

  const getAcceptedTypes = () => {
    switch (mediaType) {
      case 'image':
        return ALLOWED_IMAGE_TYPES.join(',');
      case 'video':
        return ALLOWED_VIDEO_TYPES.join(',');
      case 'audio':
        return ALLOWED_AUDIO_TYPES.join(',');
      case 'file':
        return '*/*';
      default:
        return '*/*';
    }
  };

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

  const sendToNumber = async (number: string, text: string, accessToken: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'send-message',
          token: instance.token,
          groupjid: number,
          message: text,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Erro ao enviar');
    }

    return response.json();
  };

  const sendMediaToNumber = async (
    number: string, 
    mediaData: string, 
    type: string, 
    captionText: string,
    docName: string,
    accessToken: string
  ) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'send-media',
          token: instance.token,
          groupjid: number,
          mediaUrl: mediaData,
          mediaType: type,
          caption: captionText,
          filename: docName,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Erro ao enviar mídia');
    }

    return response.json();
  };

  const sendCarouselToNumber = async (
    number: string, 
    carousel: CarouselData,
    accessToken: string
  ) => {
    // Convert local files to base64 for carousel images
    const processedCards = await Promise.all(
      carousel.cards.map(async (card) => {
        let imageUrl = card.image;
        if (card.imageFile) {
          imageUrl = await fileToBase64(card.imageFile);
          // Extract only base64 part without prefix
          const base64Data = imageUrl.split(',')[1] || imageUrl;
          imageUrl = base64Data;
        }
        return {
          text: card.text,
          image: imageUrl,
          buttons: card.buttons,
        };
      })
    );

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'send-carousel',
          token: instance.token,
          groupjid: number,
          message: carousel.message,
          carousel: processedCards,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Erro ao enviar carrossel');
    }

    return response.json();
  };

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
            await sendToNumber(membersToSend[j].jid, trimmedMessage, accessToken);
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
            await delay(getRandomDelay());
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

            await sendToNumber(group.id, trimmedMessage, accessToken);
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
            await sendMediaToNumber(membersToSend[j].jid, finalMediaUrl, sendType, caption.trim(), docName, accessToken);
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
            await delay(getRandomDelay());
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

            await sendMediaToNumber(group.id, finalMediaUrl, sendType, caption.trim(), docName, accessToken);
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

            await sendCarouselToNumber(member.jid, carouselData, accessToken);
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
            await delay(getRandomDelay());
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

            await sendCarouselToNumber(group.id, carouselData, accessToken);
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
    ? (message.trim() && !isOverLimit && selectedGroups.length > 0)
    : activeTab === 'media'
    ? (mediaUrl.trim() && selectedGroups.length > 0 && (mediaType !== 'file' || filename.trim()))
    : false; // Carousel scheduling not supported yet

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
      {/* Progress Modal */}
      {progress.status !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                {progress.status === 'sending' && (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {activeTab === 'media' ? 'Enviando mídia...' : 'Enviando mensagens...'}
                  </>
                )}
                {progress.status === 'paused' && (
                  <>
                    <Pause className="w-5 h-5 text-warning" />
                    Envio pausado
                  </>
                )}
                {progress.status === 'success' && (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    Envio concluído
                  </>
                )}
                {progress.status === 'error' && (
                  <>
                    <XCircle className="w-5 h-5 text-destructive" />
                    Erro no envio
                  </>
                )}
                {progress.status === 'cancelled' && (
                  <>
                    <StopCircle className="w-5 h-5 text-muted-foreground" />
                    Envio cancelado
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(progress.status === 'sending' || progress.status === 'paused') && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Grupo {progress.currentGroup} de {progress.totalGroups}</span>
                      <span className="text-muted-foreground truncate ml-2">{progress.groupName}</span>
                    </div>
                    <Progress value={(progress.currentGroup / progress.totalGroups) * 100} />
                  </div>

                  {excludeAdmins && progress.totalMembers > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Membros</span>
                        <span>{progress.currentMember} / {progress.totalMembers}</span>
                      </div>
                      <Progress 
                        value={(progress.currentMember / progress.totalMembers) * 100} 
                        className="h-1"
                      />
                    </div>
                  )}

                  {/* Time indicators */}
                  <div className="flex items-center justify-between text-sm border-t pt-3 mt-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Timer className="h-4 w-4" />
                      <span>Decorrido: {formatDuration(elapsedTime)}</span>
                    </div>
                    {remainingTime !== null && remainingTime > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Restante: ~{formatDuration(remainingTime)}</span>
                      </div>
                    )}
                  </div>

                  {/* Pause/Resume and Cancel Buttons */}
                  <div className="flex gap-2 pt-2">
                    {progress.status === 'sending' ? (
                      <Button 
                        onClick={handlePause} 
                        variant="outline" 
                        className="flex-1"
                      >
                        <Pause className="w-4 h-4 mr-2" />
                        Pausar
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleResume} 
                        className="flex-1"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Retomar
                      </Button>
                    )}
                    <Button 
                      onClick={handleCancel} 
                      variant="destructive" 
                      className="flex-1"
                    >
                      <StopCircle className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {!['sending', 'paused'].includes(progress.status) && progress.results.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {progress.results.map((result, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {result.success ? (
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <span className="truncate">{result.groupName}</span>
                    </div>
                  ))}
                </div>
              )}

              {!['sending', 'paused'].includes(progress.status) && (
                <Button onClick={handleCloseProgress} className="w-full">
                  Fechar
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
              {/* Media Type Selector */}
              <div className="grid grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant={mediaType === 'image' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setMediaType('image'); clearFile(); }}
                  disabled={isSending}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <Image className="w-4 h-4" />
                  <span className="text-xs">Imagem</span>
                </Button>
                <Button
                  type="button"
                  variant={mediaType === 'video' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setMediaType('video'); clearFile(); }}
                  disabled={isSending}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <Video className="w-4 h-4" />
                  <span className="text-xs">Vídeo</span>
                </Button>
                <Button
                  type="button"
                  variant={mediaType === 'audio' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setMediaType('audio'); clearFile(); }}
                  disabled={isSending}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <Mic className="w-4 h-4" />
                  <span className="text-xs">Áudio</span>
                </Button>
                <Button
                  type="button"
                  variant={mediaType === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setMediaType('file'); clearFile(); }}
                  disabled={isSending}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                >
                  <FileIcon className="w-4 h-4" />
                  <span className="text-xs">Arquivo</span>
                </Button>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <Label>URL da mídia</Label>
                <Input
                  placeholder="https://exemplo.com/arquivo.jpg"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  disabled={isSending || !!selectedFile}
                />
              </div>

              {/* Separator */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              {/* File Input */}
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={getAcceptedTypes()}
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isSending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || !!mediaUrl.trim()}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Escolher do dispositivo
                </Button>
              </div>

              {/* Preview */}
              {selectedFile && (
                <div className="relative border border-border rounded-lg p-3 bg-muted/30">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    className="absolute top-1 right-1 h-6 w-6"
                    disabled={isSending}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  
                  {mediaType === 'image' && previewUrl && (
                    <img src={previewUrl} alt="Preview" className="max-h-40 rounded mx-auto" />
                  )}
                  
                  {mediaType === 'video' && previewUrl && (
                    <video src={previewUrl} controls className="max-h-40 rounded mx-auto" />
                  )}
                  
                  {mediaType === 'audio' && previewUrl && (
                    <audio src={previewUrl} controls className="w-full" />
                  )}
                  
                  {mediaType === 'file' && (
                    <div className="flex items-center gap-2">
                      <FileIcon className="w-8 h-8 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Filename for documents */}
              {mediaType === 'file' && (
                <div className="space-y-2">
                  <Label>Nome do arquivo</Label>
                  <Input
                    placeholder="documento.pdf"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    disabled={isSending}
                  />
                </div>
              )}

              {/* PTT Toggle for audio */}
              {mediaType === 'audio' && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label htmlFor="ptt-toggle" className="text-sm font-medium cursor-pointer">
                        Enviar como mensagem de voz
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Aparecerá como áudio gravado no WhatsApp
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="ptt-toggle"
                    checked={isPtt}
                    onCheckedChange={setIsPtt}
                    disabled={isSending}
                  />
                </div>
              )}

              {/* Caption */}
              <div className="space-y-2">
                <Label>Legenda (opcional)</Label>
                <Textarea
                  placeholder="Adicione uma legenda..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={isSending}
                  className="min-h-[80px] resize-none"
                />
                <EmojiPicker onEmojiSelect={(emoji) => setCaption(prev => prev + emoji)} disabled={isSending} />
              </div>
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
                disabled={progress.status === 'sending' || progress.status === 'paused'}
              />
            )}

            {/* Common sections for all tabs - Toggle and ParticipantSelector */}
            <div className="space-y-4 mt-4">
              {/* Toggle para excluir admins */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label htmlFor="exclude-admins-broadcast" className="text-sm font-medium cursor-pointer">
                      Não enviar para Admins/Donos
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {excludeAdmins 
                        ? `${selectedParticipants.size} de ${uniqueRegularMembersCount} contato(s) selecionado(s)`
                        : `Enviará para ${selectedGroups.length} grupo${selectedGroups.length !== 1 ? 's' : ''}`
                      }
                    </p>
                  </div>
                </div>
                <Switch
                  id="exclude-admins-broadcast"
                  checked={excludeAdmins}
                  onCheckedChange={setExcludeAdmins}
                  disabled={isSending}
                />
              </div>

              {/* Participant Selector - shows when excludeAdmins is active */}
              {excludeAdmins && (
                <ParticipantSelector
                  selectedGroups={selectedGroups}
                  selectedParticipants={selectedParticipants}
                  onSelectionChange={handleParticipantSelectionChange}
                  disabled={isSending}
                />
              )}
            </div>

            {/* Common sections for all tabs */}
            <div className="space-y-4 mt-4">
              {/* Randomizador de delay anti-bloqueio */}
              <div className="p-3 bg-muted/50 rounded-lg border border-border/50 space-y-3">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Intervalo entre envios (anti-bloqueio)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Adiciona delay aleatório para evitar detecção de spam
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={randomDelay === 'none' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRandomDelay('none')}
                    disabled={isSending}
                  >
                    Desativado
                  </Button>
                  <Button
                    type="button"
                    variant={randomDelay === '5-10' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRandomDelay('5-10')}
                    disabled={isSending}
                  >
                    5-10 seg
                  </Button>
                  <Button
                    type="button"
                    variant={randomDelay === '10-20' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRandomDelay('10-20')}
                    disabled={isSending}
                  >
                    10-20 seg
                  </Button>
                </div>

                {/* Estimated time indicator */}
                {estimatedTime && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 rounded-md px-3 py-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Tempo estimado: <span className="font-medium text-foreground">{formatDuration(estimatedTime.min)} - {formatDuration(estimatedTime.max)}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Deduplication info when excludeAdmins is enabled */}
              {excludeAdmins && totalRegularMembers > uniqueRegularMembersCount && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm text-muted-foreground">
                  <span className="font-medium text-primary">Deduplicação ativa:</span> {totalRegularMembers - uniqueRegularMembersCount} contato(s) em múltiplos grupos receberão apenas 1 mensagem.
                </div>
              )}

              {/* Summary */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {selectedGroups.length} grupo{selectedGroups.length !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Users className="w-3 h-3" />
                  {excludeAdmins ? selectedParticipants.size : (activeTab === 'carousel' ? selectedGroups.length : totalMembers)} destinatário{(excludeAdmins ? selectedParticipants.size : (activeTab === 'carousel' ? selectedGroups.length : totalMembers)) !== 1 ? 's' : ''}
                </Badge>
                {activeTab === 'carousel' && (
                  <Badge variant="secondary" className="gap-1">
                    <LayoutGrid className="w-3 h-3" />
                    {carouselData.cards.length} card{carouselData.cards.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                {activeTab === 'media' && (
                  <Badge variant="secondary" className="gap-1">
                    {mediaType === 'image' && <Image className="w-3 h-3" />}
                    {mediaType === 'video' && <Video className="w-3 h-3" />}
                    {mediaType === 'audio' && <Mic className="w-3 h-3" />}
                    {mediaType === 'file' && <FileIcon className="w-3 h-3" />}
                    {mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? (isPtt ? 'Voz' : 'Áudio') : 'Arquivo'}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                {activeTab !== 'carousel' && (
                  <Button
                    variant="outline"
                    onClick={() => setShowScheduleDialog(true)}
                    disabled={isSending || !canSchedule}
                    size="sm"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Agendar
                  </Button>
                )}
                <Button
                  onClick={handleSend}
                  disabled={isSending || !canSend}
                  size="sm"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar para {excludeAdmins ? selectedParticipants.size : (activeTab === 'carousel' ? selectedGroups.length : targetCount)}
                </Button>
              </div>
            </div>
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
