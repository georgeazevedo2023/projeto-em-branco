import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  History, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  MessageSquare, 
  Image, 
  Video, 
  Mic, 
  FileIcon,
  ChevronDown,
  ChevronUp,
  Shield,
  StopCircle,
  Timer,
  RefreshCw,
  Filter,
  X,
  Calendar,
  Eye,
  Play,
  LayoutGrid,
  Trash2,
  User,
  Search,
  AlertTriangle
} from 'lucide-react';
import { isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { formatBR } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

import { HistoryCarouselPreview, HistoryCarouselData } from './HistoryCarouselPreview';
import type { Json } from '@/integrations/supabase/types';

interface BroadcastLog {
  id: string;
  instance_id: string;
  instance_name: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  groups_targeted: number;
  recipients_targeted: number;
  recipients_success: number;
  recipients_failed: number;
  exclude_admins: boolean;
  random_delay: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  created_at: string;
  group_names: string[] | null;
  carousel_data: Json | null;
}

interface BroadcastHistoryProps {
  onResend?: (log: BroadcastLog) => void;
}

type StatusFilter = 'all' | 'completed' | 'cancelled' | 'error';
type MessageTypeFilter = 'all' | 'text' | 'image' | 'video' | 'audio' | 'document' | 'carousel';
type TargetFilter = 'all' | 'groups' | 'leads';

// WhatsApp formatting parser (same logic as MessagePreview)
const formatWhatsAppText = (text: string): React.ReactNode => {
  const wrapWithStyle = (
    content: React.ReactNode[],
    style: 'bold' | 'italic' | 'strike',
    key: string
  ): React.ReactNode => {
    const className =
      style === 'bold'
        ? 'font-bold'
        : style === 'italic'
        ? 'italic'
        : 'line-through';
    return (
      <span key={key} className={className}>
        {content}
      </span>
    );
  };

  const applyFormatting = (
    content: string,
    keyPrefix: string = 'fmt'
  ): React.ReactNode[] => {
    const patterns: { regex: RegExp; style: 'bold' | 'italic' | 'strike' }[] = [
      { regex: /\*([^*]+)\*/, style: 'bold' },
      { regex: /_([^_]+)_/, style: 'italic' },
      { regex: /~([^~]+)~/, style: 'strike' },
    ];

    let firstMatch: RegExpExecArray | null = null;
    let matchedPattern: (typeof patterns)[0] | null = null;

    for (const pattern of patterns) {
      const match = pattern.regex.exec(content);
      if (match && (!firstMatch || match.index < firstMatch.index)) {
        firstMatch = match;
        matchedPattern = pattern;
      }
    }

    if (!firstMatch || !matchedPattern) {
      return content ? [<span key={keyPrefix}>{content}</span>] : [];
    }

    const parts: React.ReactNode[] = [];

    if (firstMatch.index > 0) {
      parts.push(
        ...applyFormatting(content.slice(0, firstMatch.index), `${keyPrefix}-pre`)
      );
    }

    const innerContent = applyFormatting(firstMatch[1], `${keyPrefix}-inner`);
    const wrappedContent = wrapWithStyle(
      innerContent,
      matchedPattern.style,
      `${keyPrefix}-wrap`
    );
    parts.push(wrappedContent);

    const afterIndex = firstMatch.index + firstMatch[0].length;
    if (afterIndex < content.length) {
      parts.push(
        ...applyFormatting(content.slice(afterIndex), `${keyPrefix}-post`)
      );
    }

    return parts;
  };

  return <>{applyFormatting(text)}</>;
};

// Read-only message preview component
const HistoryMessagePreview = ({ 
  type, 
  content, 
  mediaUrl,
  carouselData
}: { 
  type: string; 
  content: string | null; 
  mediaUrl: string | null;
  carouselData?: HistoryCarouselData | null;
}) => {
  const isImage = type === 'image';
  const isVideo = type === 'video';
  const isAudio = type === 'audio' || type === 'ptt';
  const isDocument = type === 'document' || type === 'file';
  const isCarousel = type === 'carousel';

  // Render carousel preview
  if (isCarousel && carouselData) {
    return <HistoryCarouselPreview data={carouselData} />;
  }

  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex items-start gap-2 mb-2">
        <Eye className="w-4 h-4 text-muted-foreground mt-0.5" />
        <span className="text-xs text-muted-foreground">Preview da mensagem</span>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-primary/10 rounded-lg rounded-tr-none p-3 border border-border/30">
          {/* Media rendering */}
          {isImage && mediaUrl && (
            <div className="mb-2 rounded-md overflow-hidden">
              <img 
                src={mediaUrl} 
                alt="Preview" 
                className="max-h-32 w-auto object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
          
          {isVideo && mediaUrl && (
            <div className="mb-2 rounded-md overflow-hidden bg-muted relative">
              <div className="w-full h-24 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                  <Play className="w-5 h-5 text-primary ml-0.5" fill="currentColor" />
                </div>
              </div>
            </div>
          )}
          
          {isAudio && (
            <div className="mb-2 flex items-center gap-2 bg-muted/50 rounded-full px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 h-1 bg-muted rounded-full">
                <div className="w-1/3 h-full bg-primary/50 rounded-full" />
              </div>
              <span className="text-xs text-muted-foreground">0:00</span>
            </div>
          )}
          
          {isDocument && (
            <div className="mb-2 flex items-center gap-2 bg-muted/50 rounded-md p-2">
              <FileIcon className="w-8 h-8 text-primary" />
              <span className="text-xs text-muted-foreground truncate">Documento</span>
            </div>
          )}
          
          {/* Text content */}
          {content && (
            <p className="text-sm whitespace-pre-wrap break-words">
              {formatWhatsAppText(content)}
            </p>
          )}
          
          {/* Timestamp */}
          <div className="flex justify-end items-center gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const BroadcastHistory = ({ onResend }: BroadcastHistoryProps) => {
  const isMobile = useIsMobile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<MessageTypeFilter>('all');
  const [instanceFilter, setInstanceFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<BroadcastLog | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const queryClient = useQueryClient();

  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['broadcast-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcast_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as BroadcastLog[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from('broadcast_logs')
        .delete()
        .eq('id', logId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcast-logs'] });
      toast.success('Registro excluído com sucesso');
      setDeleteDialogOpen(false);
      setLogToDelete(null);
    },
    onError: (error) => {
      toast.error('Erro ao excluir registro: ' + (error as Error).message);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      const { error } = await supabase
        .from('broadcast_logs')
        .delete()
        .in('id', logIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcast-logs'] });
      toast.success(`${selectedIds.size} registros excluídos com sucesso`);
      setBatchDeleteDialogOpen(false);
      setSelectedIds(new Set());
    },
    onError: (error) => {
      toast.error('Erro ao excluir registros: ' + (error as Error).message);
    },
  });

  const handleDeleteClick = (log: BroadcastLog, e: React.MouseEvent) => {
    e.stopPropagation();
    setLogToDelete(log);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (logToDelete) {
      deleteMutation.mutate(logToDelete.id);
    }
  };

  const confirmBatchDelete = () => {
    if (selectedIds.size > 0) {
      batchDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const toggleSelection = (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLogs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLogs.map(log => log.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Get unique instances for the filter dropdown
  const uniqueInstances = useMemo(() => {
    if (!logs) return [];
    const instanceMap = new Map<string, string>();
    logs.forEach(log => {
      if (log.instance_id && !instanceMap.has(log.instance_id)) {
        instanceMap.set(log.instance_id, log.instance_name || log.instance_id);
      }
    });
    return Array.from(instanceMap.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    return logs.filter((log) => {
      // Status filter
      if (statusFilter !== 'all' && log.status !== statusFilter) {
        return false;
      }

      // Message type filter
      if (typeFilter !== 'all' && log.message_type !== typeFilter) {
        return false;
      }

      // Target filter (groups vs leads)
      if (targetFilter !== 'all') {
        const isLeadBroadcast = log.groups_targeted === 0;
        if (targetFilter === 'leads' && !isLeadBroadcast) return false;
        if (targetFilter === 'groups' && isLeadBroadcast) return false;
      }

      // Instance filter
      if (instanceFilter !== 'all' && log.instance_id !== instanceFilter) {
        return false;
      }

      // Date from filter
      if (dateFrom) {
        const logDate = parseISO(log.created_at);
        const filterDate = startOfDay(parseISO(dateFrom));
        if (isBefore(logDate, filterDate)) {
          return false;
        }
      }

      // Date to filter
      if (dateTo) {
        const logDate = parseISO(log.created_at);
        const filterDate = endOfDay(parseISO(dateTo));
        if (isAfter(logDate, filterDate)) {
          return false;
        }
      }

      // Search query (content, instance name, or group names)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesContent = log.content?.toLowerCase().includes(query);
        const matchesInstance = log.instance_name?.toLowerCase().includes(query);
        const matchesGroups = log.group_names?.some(name => 
          name.toLowerCase().includes(query)
        );
        if (!matchesContent && !matchesInstance && !matchesGroups) {
          return false;
        }
      }

      return true;
    });
  }, [logs, statusFilter, typeFilter, targetFilter, instanceFilter, dateFrom, dateTo, searchQuery]);

  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || targetFilter !== 'all' || instanceFilter !== 'all' || dateFrom || dateTo || searchQuery;

  // Count active filters for mobile badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (typeFilter !== 'all') count++;
    if (targetFilter !== 'all') count++;
    if (instanceFilter !== 'all') count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    if (searchQuery) count++;
    return count;
  }, [statusFilter, typeFilter, targetFilter, instanceFilter, dateFrom, dateTo, searchQuery]);

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setTargetFilter('all');
    setInstanceFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
    }
    return secs > 0 ? `${minutes}min ${secs}s` : `${minutes}min`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Concluído
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            <StopCircle className="w-3 h-3 mr-1" />
            Cancelado
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Erro
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'audio':
      case 'ptt':
        return <Mic className="w-4 h-4" />;
      case 'document':
        return <FileIcon className="w-4 h-4" />;
      case 'carousel':
        return <LayoutGrid className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'image':
        return 'Imagem';
      case 'video':
        return 'Vídeo';
      case 'audio':
      case 'ptt':
        return 'Áudio';
      case 'document':
        return 'Documento';
      case 'carousel':
        return 'Carrossel';
      default:
        return 'Texto';
    }
  };

  const getDeliveryRate = (success: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((success / total) * 100);
  };

  // Mobile Filters Component
  const MobileFilters = () => (
    <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-10"
        >
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span>Filtros</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </span>
          <ChevronDown className={cn(
            "w-4 h-4 transition-transform",
            filtersExpanded && "rotate-180"
          )} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        {/* 2-column grid for select filters */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MessageTypeFilter)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
              <SelectItem value="audio">Áudio</SelectItem>
              <SelectItem value="document">Documento</SelectItem>
              <SelectItem value="carousel">Carrossel</SelectItem>
            </SelectContent>
          </Select>

          <Select value={targetFilter} onValueChange={(v) => setTargetFilter(v as TargetFilter)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos destinos</SelectItem>
              <SelectItem value="groups">Grupos</SelectItem>
              <SelectItem value="leads">Leads</SelectItem>
            </SelectContent>
          </Select>

          <Select value={instanceFilter} onValueChange={(v) => setInstanceFilter(v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas instâncias</SelectItem>
              {uniqueInstances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date inputs in row */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 h-9 text-xs"
          />
          <span className="text-muted-foreground text-xs shrink-0">até</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 h-9 text-xs"
          />
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full h-9 text-xs pl-8"
          />
        </div>

        {/* Clear button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="w-full h-8 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Limpar filtros
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );

  // Desktop Filters Component
  const DesktopFilters = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>Filtros:</span>
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MessageTypeFilter)}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="image">Imagem</SelectItem>
            <SelectItem value="video">Vídeo</SelectItem>
            <SelectItem value="audio">Áudio</SelectItem>
            <SelectItem value="document">Documento</SelectItem>
            <SelectItem value="carousel">Carrossel</SelectItem>
          </SelectContent>
        </Select>

        <Select value={targetFilter} onValueChange={(v) => setTargetFilter(v as TargetFilter)}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue placeholder="Destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos destinos</SelectItem>
            <SelectItem value="groups">Grupos</SelectItem>
            <SelectItem value="leads">Leads</SelectItem>
          </SelectContent>
        </Select>

        <Select value={instanceFilter} onValueChange={(v) => setInstanceFilter(v)}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue placeholder="Instância" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas instâncias</SelectItem>
            {uniqueInstances.map((instance) => (
              <SelectItem key={instance.id} value={instance.id}>
                {instance.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px] h-8 text-sm"
            placeholder="Data início"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px] h-8 text-sm"
            placeholder="Data fim"
          />
        </div>

        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por conteúdo, instância ou grupo..."
          className="flex-1 min-w-[200px] h-8 text-sm"
        />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            Histórico de Envios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            <span className="hidden sm:inline">Histórico de Envios</span>
            <span className="sm:hidden">Histórico</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Filters Section - Responsive */}
        <div className="mt-4 space-y-3">
          {isMobile ? <MobileFilters /> : <DesktopFilters />}

          {hasActiveFilters && (
            <div className="text-xs text-muted-foreground">
              Mostrando {filteredLogs.length} de {logs?.length || 0} registros
            </div>
          )}

          {/* Batch Selection Controls */}
          {filteredLogs.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-muted-foreground text-xs sm:text-sm">
                    {selectedIds.size === filteredLogs.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </span>
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {selectedIds.size} selecionado(s)
                  </span>
                )}
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="flex-1 sm:flex-none h-8 text-xs sm:text-sm"
                  >
                    Limpar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBatchDeleteDialogOpen(true)}
                    className="flex-1 sm:flex-none h-8 text-xs sm:text-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Excluir {selectedIds.size}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!logs || logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum envio realizado ainda</p>
            <p className="text-sm">Os envios aparecerão aqui</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Filter className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum registro encontrado</p>
            <p className="text-sm">Tente ajustar os filtros</p>
            <Button
              variant="link"
              size="sm"
              onClick={clearFilters}
              className="mt-2"
            >
              Limpar filtros
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                const deliveryRate = getDeliveryRate(log.recipients_success, log.recipients_targeted);
                
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "border rounded-lg p-2.5 sm:p-3 bg-background/50 hover:bg-background/80 transition-colors",
                      selectedIds.has(log.id) && "ring-2 ring-primary/50 border-primary/50"
                    )}
                  >
                    <div 
                      className="flex items-start sm:items-center justify-between cursor-pointer gap-2"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        {/* Checkbox for selection */}
                        <input
                          type="checkbox"
                          checked={selectedIds.has(log.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelection(log.id, e as unknown as React.MouseEvent);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-border shrink-0 mt-1 sm:mt-0"
                        />
                        <div className="p-1.5 sm:p-2 rounded-full bg-primary/10 shrink-0">
                          {getMessageTypeIcon(log.message_type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getStatusBadge(log.status)}
                            <Badge variant="outline" className="text-xs">
                              {getMessageTypeLabel(log.message_type)}
                            </Badge>
                            {log.groups_targeted === 0 ? (
                              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">
                                <User className="w-3 h-3 mr-0.5" />
                                <span className="hidden sm:inline">Leads</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <Users className="w-3 h-3 mr-0.5" />
                                <span>{log.groups_targeted}</span>
                                <span className="hidden sm:inline ml-0.5">grupo{log.groups_targeted !== 1 ? 's' : ''}</span>
                              </Badge>
                            )}
                            {log.random_delay && log.random_delay !== 'none' && (
                              <Badge variant="outline" className="text-xs hidden sm:flex">
                                <Shield className="w-3 h-3 mr-1" />
                                {log.random_delay === '5-10' ? '5-10s' : '10-20s'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 truncate">
                            {log.instance_name || log.instance_id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs sm:text-sm font-medium">
                            {log.recipients_success}/{log.recipients_targeted}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                            {deliveryRate}%
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t space-y-3 sm:space-y-4">
                        {/* Group/Lead Names */}
                        {log.group_names && log.group_names.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              {log.groups_targeted === 0 ? (
                                <>
                                  <User className="w-3 h-3" />
                                  Leads ({log.group_names.length}):
                                </>
                              ) : (
                                <>
                                  <Users className="w-3 h-3" />
                                  Grupos ({log.group_names.length}):
                                </>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {log.group_names.map((name, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Message Preview */}
                        {(log.content || log.media_url || log.carousel_data) && (
                          <HistoryMessagePreview 
                            type={log.message_type}
                            content={log.content}
                            mediaUrl={log.media_url}
                            carouselData={log.carousel_data as unknown as HistoryCarouselData | null}
                          />
                        )}

                        {/* Stats Grid - Dates */}
                        <div className="grid grid-cols-1 gap-2 text-xs sm:text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Play className="w-3.5 h-3.5 text-green-500" />
                            <span className="truncate">
                              Início: {formatBR(log.started_at, "dd/MM/yy 'às' HH:mm")}
                            </span>
                          </div>
                          {log.completed_at && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                              <span className="truncate">
                                Fim: {formatBR(log.completed_at, "dd/MM/yy 'às' HH:mm")}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Timer className="w-3.5 h-3.5" />
                            <span>Duração: {formatDuration(log.duration_seconds)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            <span>
                              {log.exclude_admins ? 'Excluindo admins' : 'Todos os membros'}
                            </span>
                          </div>
                        </div>

                        {/* Recipients Stats */}
                        <div className="flex items-center gap-3 text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-green-600">{log.recipients_success} sucesso</span>
                          </div>
                          {log.recipients_failed > 0 && (
                            <div className="flex items-center gap-1.5">
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                              <span className="text-red-600">{log.recipients_failed} falha</span>
                            </div>
                          )}
                        </div>

                        {log.error_message && (
                          <div className="p-2 bg-destructive/10 rounded text-xs sm:text-sm text-destructive">
                            <p className="text-xs mb-1">Erro:</p>
                            <p>{log.error_message}</p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {onResend && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 text-xs sm:text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onResend(log);
                              }}
                            >
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                              Reenviar
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
                            onClick={(e) => handleDeleteClick(log, e)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Excluir registro
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro do histórico? Esta ação não pode ser desfeita.
              {logToDelete && (
                <span className="block mt-2 text-sm">
                  <strong>Tipo:</strong> {getMessageTypeLabel(logToDelete.message_type)} • 
                  <strong> Grupos:</strong> {logToDelete.groups_targeted} • 
                  <strong> Data:</strong> {formatBR(logToDelete.created_at, "dd/MM/yyyy")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="sm:w-auto w-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto w-full"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Excluir {selectedIds.size} registros
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{selectedIds.size} registros</strong> do histórico? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="sm:w-auto w-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBatchDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto w-full"
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? 'Excluindo...' : `Excluir ${selectedIds.size} registros`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default BroadcastHistory;
