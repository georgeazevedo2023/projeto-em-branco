import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, CheckSquare, Square, User, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Lead } from '@/pages/dashboard/LeadsBroadcaster';

interface LeadListProps {
  leads: Lead[];
  selectedLeads: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

const ITEMS_PER_PAGE = 50;

// Formata o número para exibição: +55 81 99999-9999
const formatPhoneForDisplay = (phone: string, jid?: string): string => {
  // Usa o phone ou extrai do JID
  let number = phone || jid?.split('@')[0] || '';
  
  // Remove caracteres não-numéricos e máscara
  number = number.replace(/[^\d]/g, '');
  
  if (!number || number.length < 10) return phone;
  
  // Se não começa com 55, adiciona
  if (!number.startsWith('55') && number.length <= 11) {
    number = '55' + number;
  }
  
  // Formata: +55 81 99999-9999
  if (number.length >= 12) {
    const ddi = number.slice(0, 2);
    const ddd = number.slice(2, 4);
    const parte1 = number.slice(4, 9);
    const parte2 = number.slice(9);
    return `+${ddi} ${ddd} ${parte1}-${parte2}`;
  }
  
  return phone;
};

const LeadList = ({ leads, selectedLeads, onSelectionChange }: LeadListProps) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'invalid' | 'pending'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLeads = useMemo(() => {
    let result = leads;
    
    // Text search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(lead =>
        lead.phone.includes(search) ||
        lead.name?.toLowerCase().includes(searchLower) ||
        lead.groupName?.toLowerCase().includes(searchLower) ||
        lead.verifiedName?.toLowerCase().includes(searchLower)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        result = result.filter(l => !l.verificationStatus);
      } else {
        result = result.filter(l => l.verificationStatus === statusFilter);
      }
    }
    
    return result;
  }, [leads, search, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLeads.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLeads, currentPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const handleToggle = (leadId: string) => {
    const newSelection = new Set(selectedLeads);
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId);
    } else {
      newSelection.add(leadId);
    }
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    const allIds = new Set(filteredLeads.map(l => l.id));
    onSelectionChange(allIds);
  };

  const handleClearSelection = () => {
    onSelectionChange(new Set());
  };

  const allSelected = filteredLeads.length > 0 && filteredLeads.every(l => selectedLeads.has(l.id));
  const hasVerifiedLeads = leads.some(l => l.verificationStatus);
  const showPagination = filteredLeads.length > ITEMS_PER_PAGE;

  const getVerificationBadge = (lead: Lead) => {
    switch (lead.verificationStatus) {
      case 'valid':
        return (
          <Badge variant="default" className="text-xs bg-green-500/20 text-green-600 border-green-500/30 hover:bg-green-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            WhatsApp
          </Badge>
        );
      case 'invalid':
        return (
          <Badge variant="destructive" className="text-xs bg-red-500/20 text-red-600 border-red-500/30 hover:bg-red-500/20">
            <XCircle className="w-3 h-3 mr-1" />
            Inválido
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500/30">
            <AlertCircle className="w-3 h-3 mr-1" />
            Erro
          </Badge>
        );
      default:
        return null;
    }
  };

  const getSourceBadge = (source: Lead['source'], groupName?: string) => {
    switch (source) {
      case 'paste':
        return <Badge variant="outline" className="text-xs">Colado</Badge>;
      case 'manual':
        return <Badge variant="outline" className="text-xs">Manual</Badge>;
      case 'group':
        return (
          <Badge variant="secondary" className="text-xs truncate max-w-[120px]" title={groupName}>
            {groupName || 'Grupo'}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, número ou grupo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {hasVerifiedLeads && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="valid">Válidos</SelectItem>
                <SelectItem value="invalid">Inválidos</SelectItem>
                <SelectItem value="pending">Não verificados</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={allSelected ? handleClearSelection : handleSelectAll}
            className="gap-1.5"
          >
            {allSelected ? (
              <>
                <Square className="w-4 h-4" />
                Limpar
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4" />
                Selecionar todos
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Selection counter */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {selectedLeads.size} de {leads.length} selecionado{selectedLeads.size !== 1 ? 's' : ''}
        </span>
        {(search || statusFilter !== 'all') && filteredLeads.length !== leads.length && (
          <Badge variant="secondary" className="text-xs">
            {filteredLeads.length} resultado{filteredLeads.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Lead list */}
      <ScrollArea className="h-64 border rounded-lg">
        <div className="p-2 space-y-1">
          {paginatedLeads.map(lead => (
            <div
              key={lead.id}
              className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                selectedLeads.has(lead.id) 
                  ? 'bg-primary/10 border border-primary/20' 
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => handleToggle(lead.id)}
            >
              <Checkbox
                checked={selectedLeads.has(lead.id)}
                onCheckedChange={() => handleToggle(lead.id)}
              />
              
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {lead.verifiedName || lead.name || formatPhoneForDisplay(lead.phone, lead.jid)}
                </p>
                {(lead.verifiedName || lead.name) && (
                  <p className="text-xs text-muted-foreground">
                    {formatPhoneForDisplay(lead.phone, lead.jid)}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                {getVerificationBadge(lead)}
                {getSourceBadge(lead.source, lead.groupName)}
              </div>
            </div>
          ))}

          {filteredLeads.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {search || statusFilter !== 'all' ? 'Nenhum contato encontrado' : 'Nenhum contato importado'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredLeads.length)} de {filteredLeads.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "ghost"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadList;
