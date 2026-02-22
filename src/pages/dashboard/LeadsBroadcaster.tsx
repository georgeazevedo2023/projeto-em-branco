import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Server, Users, MessageSquare, ChevronRight, Check, ArrowLeft, ShieldCheck, Loader2, Database, Save, Plus, MessageCircle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import InstanceSelector, { Instance } from '@/components/broadcast/InstanceSelector';
import BroadcasterHeader from '@/components/broadcast/BroadcasterHeader';
import LeadImporter from '@/components/broadcast/LeadImporter';
import LeadList from '@/components/broadcast/LeadList';
import LeadMessageForm from '@/components/broadcast/LeadMessageForm';
import EditDatabaseDialog from '@/components/broadcast/EditDatabaseDialog';
import ManageLeadDatabaseDialog from '@/components/broadcast/ManageLeadDatabaseDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Lead {
  id: string;
  phone: string;
  name?: string;
  jid: string;
  source: 'manual' | 'paste' | 'group';
  groupName?: string;
  isVerified?: boolean;
  verifiedName?: string;
  verificationStatus?: 'pending' | 'valid' | 'invalid' | 'error';
}

interface LeadDatabase {
  id: string;
  name: string;
  description: string | null;
  leads_count: number;
  created_at: string;
  updated_at: string;
  instance_id?: string | null;
}

interface ResendData {
  messageType: string;
  content: string | null;
  mediaUrl: string | null;
  instanceId: string;
  instanceName: string | null;
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

// Leads Broadcaster Component
const LeadsBroadcaster = () => {
  const { user } = useAuth();
  // Optimized: 3 steps instead of 4
  const [step, setStep] = useState<'instance' | 'contacts' | 'message'>('instance');
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [selectedDatabases, setSelectedDatabases] = useState<LeadDatabase[]>([]);
  const [databases, setDatabases] = useState<LeadDatabase[]>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isCreatingNewDatabase, setIsCreatingNewDatabase] = useState(false);
  const [newDatabaseName, setNewDatabaseName] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [isSavingDatabase, setIsSavingDatabase] = useState(false);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [editTarget, setEditTarget] = useState<LeadDatabase | null>(null);
  const [manageTarget, setManageTarget] = useState<LeadDatabase | null>(null);
  const [resendData, setResendData] = useState<ResendData | null>(null);

  // Check for resend data from history
  useEffect(() => {
    const storedData = sessionStorage.getItem('resendData');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        setResendData(parsed);
        sessionStorage.removeItem('resendData');
        toast.info('Selecione a instância, base e contatos para reenviar a mensagem', {
          duration: 4000,
        });
      } catch (e) {
        console.error('Failed to parse resend data:', e);
        sessionStorage.removeItem('resendData');
      }
    }
  }, []);

  // Fetch databases when instance is selected
  useEffect(() => {
    if (selectedInstance && step === 'contacts') {
      fetchDatabases();
    }
  }, [selectedInstance, step]);

  const fetchDatabases = async () => {
    setIsLoadingDatabases(true);
    try {
      const { data, error } = await supabase
        .from('lead_databases')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDatabases(data || []);
    } catch (error) {
      console.error('Error fetching databases:', error);
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  const handleInstanceSelect = (instance: Instance) => {
    setSelectedInstance(instance);
    setStep('contacts');
  };

  const loadLeadsFromDatabases = async (dbs: LeadDatabase[]) => {
    if (dbs.length === 0) {
      setLeads([]);
      setSelectedLeads(new Set());
      return;
    }

    setIsLoadingLeads(true);
    try {
      const ids = dbs.map(d => d.id);
      const { data, error } = await supabase
        .from('lead_database_entries')
        .select('*')
        .in('database_id', ids);

      if (error) throw error;

      const seen = new Set<string>();
      const uniqueEntries = (data || []).filter(entry => {
        if (seen.has(entry.phone)) return false;
        seen.add(entry.phone);
        return true;
      });

      const loadedLeads: Lead[] = uniqueEntries.map((entry) => ({
        id: entry.id,
        phone: entry.phone,
        name: entry.name || undefined,
        jid: entry.jid,
        source: (entry.source as 'manual' | 'paste' | 'group') || 'paste',
        groupName: entry.group_name || undefined,
        isVerified: entry.is_verified || false,
        verifiedName: entry.verified_name || undefined,
        verificationStatus: entry.verification_status as Lead['verificationStatus'] || undefined,
      }));

      setLeads(loadedLeads);
      setSelectedLeads(new Set(loadedLeads.map(l => l.id)));
    } catch (error) {
      console.error('Error loading leads:', error);
      toast.error('Erro ao carregar contatos da base');
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const handleToggleDatabase = async (db: LeadDatabase) => {
    const isSelected = selectedDatabases.some(d => d.id === db.id);
    const newSelection = isSelected
      ? selectedDatabases.filter(d => d.id !== db.id)
      : [...selectedDatabases, db];
    setSelectedDatabases(newSelection);
    setIsCreatingNewDatabase(false);
    await loadLeadsFromDatabases(newSelection);
  };

  const handleSaveDatabase = async () => {
    if (!newDatabaseName.trim()) {
      toast.error('Digite um nome para a base');
      return;
    }

    if (leads.length === 0) {
      toast.error('Importe pelo menos um contato');
      return;
    }

    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }

    setIsSavingDatabase(true);

    try {
      const { data: db, error: dbError } = await supabase
        .from('lead_databases')
        .insert({
          name: newDatabaseName.trim(),
          user_id: user.id,
          leads_count: leads.length,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      const entries = leads.map((l) => ({
        database_id: db.id,
        phone: l.phone,
        name: l.name || null,
        jid: l.jid,
        source: l.source,
        group_name: l.groupName || null,
        is_verified: l.isVerified || false,
        verified_name: l.verifiedName || null,
        verification_status: l.verificationStatus || null,
      }));

      const { error: entriesError } = await supabase
        .from('lead_database_entries')
        .insert(entries);

      if (entriesError) throw entriesError;

      const newDb: LeadDatabase = {
        id: db.id,
        name: db.name,
        description: db.description,
        leads_count: db.leads_count ?? 0,
        created_at: db.created_at ?? '',
        updated_at: db.updated_at ?? '',
      };

      setSelectedDatabases([newDb]);
      setDatabases(prev => [newDb, ...prev]);
      setIsCreatingNewDatabase(false);
      toast.success(`Base "${db.name}" salva com ${leads.length} contatos`);
    } catch (error) {
      console.error('Error saving database:', error);
      toast.error('Erro ao salvar base de leads');
    } finally {
      setIsSavingDatabase(false);
    }
  };

  const handleUpdateDatabase = async () => {
    if (selectedDatabases.length !== 1 || !user) return;
    const targetDb = selectedDatabases[0];

    setIsSavingDatabase(true);

    try {
      await supabase
        .from('lead_database_entries')
        .delete()
        .eq('database_id', targetDb.id);

      const entries = leads.map((l) => ({
        database_id: targetDb.id,
        phone: l.phone,
        name: l.name || null,
        jid: l.jid,
        source: l.source,
        group_name: l.groupName || null,
        is_verified: l.isVerified || false,
        verified_name: l.verifiedName || null,
        verification_status: l.verificationStatus || null,
      }));

      if (entries.length > 0) {
        const { error: entriesError } = await supabase
          .from('lead_database_entries')
          .insert(entries);

        if (entriesError) throw entriesError;
      }

      const { error: updateError } = await supabase
        .from('lead_databases')
        .update({ leads_count: leads.length })
        .eq('id', targetDb.id);

      if (updateError) throw updateError;

      setSelectedDatabases(prev => prev.map(d => d.id === targetDb.id ? { ...d, leads_count: leads.length } : d));
      setDatabases(prev => prev.map(d => 
        d.id === targetDb.id ? { ...d, leads_count: leads.length } : d
      ));
      toast.success('Base atualizada');
    } catch (error) {
      console.error('Error updating database:', error);
      toast.error('Erro ao atualizar base');
    } finally {
      setIsSavingDatabase(false);
    }
  };

  const handleLeadsImported = (importedLeads: Lead[]) => {
    const existingPhones = new Set(leads.map(l => l.phone));
    const newLeads = importedLeads.filter(l => !existingPhones.has(l.phone));
    
    const allLeads = [...leads, ...newLeads];
    setLeads(allLeads);
    
    const allIds = new Set([...selectedLeads, ...newLeads.map(l => l.id)]);
    setSelectedLeads(allIds);
  };

  const handleVerifyNumbers = async () => {
    if (!selectedInstance || leads.length === 0) return;
    
    setIsVerifying(true);
    setVerificationProgress(0);
    
    try {
      const phones = leads.map(l => l.jid.replace('@s.whatsapp.net', ''));
      const BATCH_SIZE = 50;
      const results = new Map<string, { isValid: boolean; verifiedName?: string }>();
      
      for (let i = 0; i < phones.length; i += BATCH_SIZE) {
        const batch = phones.slice(i, i + BATCH_SIZE);
        
        const response = await supabase.functions.invoke('uazapi-proxy', {
          body: {
            action: 'check-numbers',
            token: selectedInstance.token,
            phones: batch,
          },
        });
        
        if (response.error) {
          console.error('Verification error:', response.error);
          toast.error('Erro ao verificar números');
          break;
        }
        
        if (response.data?.users && Array.isArray(response.data.users)) {
          response.data.users.forEach((u: { Query?: string; query?: string; IsInWhatsapp?: boolean; isInWhatsapp?: boolean; VerifiedName?: string; verifiedName?: string }) => {
            const query = u.Query || u.query || '';
            results.set(query, {
              isValid: u.IsInWhatsapp || u.isInWhatsapp || false,
              verifiedName: u.VerifiedName || u.verifiedName || '',
            });
          });
        }
        
        setVerificationProgress(Math.min(100, ((i + batch.length) / phones.length) * 100));
      }
      
      setLeads(prevLeads => prevLeads.map(lead => {
        const phone = lead.jid.replace('@s.whatsapp.net', '');
        const result = results.get(phone);
        return {
          ...lead,
          verificationStatus: result ? (result.isValid ? 'valid' : 'invalid') : 'error',
          isVerified: result?.isValid ?? false,
          verifiedName: result?.verifiedName,
        };
      }));
      
      const validCount = Array.from(results.values()).filter(r => r.isValid).length;
      const invalidCount = Array.from(results.values()).filter(r => !r.isValid).length;
      
      toast.success(`Verificação concluída: ${validCount} válidos, ${invalidCount} inválidos`);
      
    } catch (error) {
      console.error('Verification error:', error);
      toast.error('Erro ao verificar números');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRemoveInvalid = () => {
    const validLeads = leads.filter(l => l.verificationStatus !== 'invalid');
    const removedCount = leads.length - validLeads.length;
    
    setLeads(validLeads);
    
    const validIds = new Set(validLeads.map(l => l.id));
    const newSelection = new Set([...selectedLeads].filter(id => validIds.has(id)));
    setSelectedLeads(newSelection);
    
    toast.success(`${removedCount} contato${removedCount !== 1 ? 's' : ''} inválido${removedCount !== 1 ? 's' : ''} removido${removedCount !== 1 ? 's' : ''}`);
  };

  const handleSelectOnlyValid = () => {
    const validIds = new Set(
      leads
        .filter(l => l.verificationStatus === 'valid')
        .map(l => l.id)
    );
    setSelectedLeads(validIds);
    toast.success(`${validIds.size} contatos válidos selecionados`);
  };

  const hasVerifiedLeads = leads.some(l => l.verificationStatus);
  const validLeadsCount = leads.filter(l => l.verificationStatus === 'valid').length;
  const invalidLeadsCount = leads.filter(l => l.verificationStatus === 'invalid').length;

  const handleContinueToMessage = () => {
    setStep('message');
  };

  const handleComplete = () => {
    setLeads([]);
    setSelectedLeads(new Set());
    setStep('instance');
    setSelectedInstance(null);
    setSelectedDatabases([]);
    setIsCreatingNewDatabase(false);
    setNewDatabaseName('');
    setResendData(null);
  };

  const handleBack = () => {
    if (step === 'message') {
      setStep('contacts');
    } else if (step === 'contacts') {
      setStep('instance');
      setSelectedInstance(null);
      setSelectedDatabases([]);
      setLeads([]);
      setSelectedLeads(new Set());
      setIsCreatingNewDatabase(false);
    }
  };

  const handleChangeInstance = () => {
    setStep('instance');
    setSelectedInstance(null);
    setSelectedDatabases([]);
    setLeads([]);
    setSelectedLeads(new Set());
    setIsCreatingNewDatabase(false);
  };

  const handleClearLeads = () => {
    setLeads([]);
    setSelectedLeads(new Set());
  };

  const handleDatabaseUpdated = (updated: LeadDatabase) => {
    setDatabases(prev => prev.map(d => d.id === updated.id ? updated : d));
    setSelectedDatabases(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  const selectedLeadsList = leads.filter(l => selectedLeads.has(l.id));
  const hasUnsavedChanges = isCreatingNewDatabase && leads.length > 0 && selectedDatabases.length === 0;
  const canSaveDatabase = isCreatingNewDatabase && leads.length > 0 && newDatabaseName.trim();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disparador de Leads</h1>
          <p className="text-muted-foreground">
            Envie mensagens para contatos individuais
          </p>
        </div>
        
        {step !== 'instance' && (
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}
      </div>

      {/* Resend Banner */}
      {resendData && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Reenviando mensagem</span>
              <Badge variant="secondary" className="text-xs">
                {resendData.messageType === 'text' ? 'Texto' : 
                 resendData.messageType === 'carousel' ? 'Carrossel' :
                 resendData.messageType === 'image' ? 'Imagem' :
                 resendData.messageType === 'video' ? 'Vídeo' :
                 resendData.messageType === 'audio' || resendData.messageType === 'ptt' ? 'Áudio' : 'Documento'}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResendData(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
          </div>
          {resendData.content && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              "{resendData.content}"
            </p>
          )}
        </div>
      )}

      {/* Progress Steps - Optimized: 3 steps */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`flex items-center gap-2 ${selectedInstance ? 'text-primary' : 'text-muted-foreground'}`}>
          {selectedInstance ? (
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-4 h-4 text-primary-foreground" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">1</div>
          )}
          <span className="font-medium">Instância</span>
        </div>
        
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        
        <div className={`flex items-center gap-2 ${step === 'message' ? 'text-primary' : step === 'contacts' ? 'text-foreground' : 'text-muted-foreground'}`}>
          {step === 'message' ? (
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-4 h-4 text-primary-foreground" />
            </div>
          ) : (
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'contacts' ? 'bg-primary/20 text-primary' : 'bg-muted'}`}>2</div>
          )}
          <span className="font-medium">Base + Contatos</span>
          {leads.length > 0 && (
            <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
          )}
        </div>
        
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        
        <div className={`flex items-center gap-2 ${step === 'message' ? 'text-foreground' : 'text-muted-foreground'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'message' ? 'bg-primary/20 text-primary' : 'bg-muted'}`}>3</div>
          <span className="font-medium">Mensagem</span>
        </div>
      </div>

      {/* Step 1: Instance Selection */}
      {step === 'instance' && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="w-5 h-5" />
              Selecionar Instância
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InstanceSelector
              selectedInstance={selectedInstance}
              onSelect={handleInstanceSelect}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Combined Base + Contacts */}
      {step === 'contacts' && selectedInstance && (
        <div className="space-y-4">
          {/* Compact Header with Instance */}
          <BroadcasterHeader
            instance={selectedInstance}
            database={selectedDatabases}
            onChangeInstance={handleChangeInstance}
            showDatabase={false}
          />

          {/* Database Selector - Multi-select Cards */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <Label className="text-sm font-medium mb-3 block">Bases de Leads</Label>
              
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full border-dashed justify-start gap-2"
                  onClick={() => {
                    setIsCreatingNewDatabase(true);
                    setSelectedDatabases([]);
                    setLeads([]);
                    setSelectedLeads(new Set());
                    setNewDatabaseName('');
                  }}
                  disabled={isLoadingDatabases}
                >
                  <Plus className="w-4 h-4" />
                  Criar Nova Base
                </Button>

                {isLoadingDatabases ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
                  </div>
                ) : (
                  databases.map(db => {
                    const isSelected = selectedDatabases.some(d => d.id === db.id);
                    return (
                      <div
                        key={db.id}
                        onClick={() => handleToggleDatabase(db)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/50"
                        )}
                      >
                        <Checkbox checked={isSelected} className="pointer-events-none" />
                        <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">{db.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{db.leads_count ?? 0} contatos</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* New Database Name Input */}
              {isCreatingNewDatabase && (
                <div className="mt-3 pt-3 border-t">
                  <Label className="text-sm font-medium mb-2 block">Nome da Nova Base</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Clientes VIP..."
                      value={newDatabaseName}
                      onChange={(e) => setNewDatabaseName(e.target.value)}
                    />
                    <Button
                      onClick={handleSaveDatabase}
                      disabled={!canSaveDatabase || isSavingDatabase}
                      size="sm"
                      className="shrink-0"
                    >
                      {isSavingDatabase ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  {hasUnsavedChanges && !newDatabaseName.trim() && (
                    <p className="text-xs text-destructive mt-2">
                      Digite um nome para salvar a base de leads
                    </p>
                  )}
                </div>
              )}

              {/* Database Actions - only when exactly 1 selected */}
              {selectedDatabases.length === 1 && !isCreatingNewDatabase && (
                <div className="mt-3 pt-3 border-t flex justify-between items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManageTarget(selectedDatabases[0])}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Gerenciar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateDatabase}
                    disabled={isSavingDatabase}
                  >
                    {isSavingDatabase ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Atualizar Base
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Import Section */}
          {!isLoadingLeads && (selectedDatabases.length > 0 || isCreatingNewDatabase) && (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Importar Contatos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LeadImporter
                  instance={selectedInstance}
                  onLeadsImported={handleLeadsImported}
                />
              </CardContent>
            </Card>
          )}

          {/* Leads List */}
          {leads.length > 0 && (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Contatos Importados
                    <Badge variant="secondary">{leads.length}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleVerifyNumbers}
                      disabled={isVerifying || leads.length === 0}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verificando... {Math.round(verificationProgress)}%
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 mr-2" />
                          Verificar Números
                        </>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClearLeads}>
                      Limpar
                    </Button>
                  </div>
                </div>
                
                {hasVerifiedLeads && (
                  <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
                    <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30 hover:bg-green-500/20">
                      {validLeadsCount} válidos
                    </Badge>
                    <Badge variant="destructive" className="bg-red-500/20 text-red-600 border-red-500/30 hover:bg-red-500/20">
                      {invalidLeadsCount} inválidos
                    </Badge>
                    <div className="flex gap-2 ml-auto">
                      {invalidLeadsCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={handleRemoveInvalid} className="text-xs h-7 text-destructive hover:text-destructive">
                          Remover inválidos
                        </Button>
                      )}
                      {validLeadsCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={handleSelectOnlyValid} className="text-xs h-7">
                          Selecionar válidos
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <LeadList
                  leads={leads}
                  selectedLeads={selectedLeads}
                  onSelectionChange={setSelectedLeads}
                />
                
                {selectedLeads.size > 0 && (
                  <div className="flex justify-end pt-2 border-t">
                    <Button onClick={handleContinueToMessage}>
                      Continuar com {selectedLeads.size} contato{selectedLeads.size !== 1 ? 's' : ''}
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Step 3: Message Composition */}
      {step === 'message' && selectedInstance && selectedLeadsList.length > 0 && (
        <div className="space-y-4">
          {/* Compact Header */}
          <BroadcasterHeader
            instance={selectedInstance}
            database={selectedDatabases}
            onChangeInstance={handleChangeInstance}
            onChangeDatabase={() => setStep('contacts')}
          />

          {/* Selected Leads Summary */}
          <Card className="border-border/50 bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {selectedLeadsList.length} contato{selectedLeadsList.length !== 1 ? 's' : ''} selecionado{selectedLeadsList.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Envio individual para cada número
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setStep('contacts')}>
                  Alterar seleção
                </Button>
              </div>
              
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedLeadsList.slice(0, 5).map((lead) => (
                  <Badge key={lead.id} variant="secondary" className="text-xs">
                    {lead.name || lead.phone}
                  </Badge>
                ))}
                {selectedLeadsList.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{selectedLeadsList.length - 5} mais
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Message Form */}
          <LeadMessageForm
            instance={selectedInstance}
            selectedLeads={selectedLeadsList}
            onComplete={handleComplete}
            initialData={resendData ? {
              messageType: resendData.messageType,
              content: resendData.content,
              mediaUrl: resendData.mediaUrl,
              carouselData: resendData.carouselData,
            } : undefined}
          />
        </div>
      )}

      {/* Edit Database Dialog */}
      <EditDatabaseDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        database={editTarget}
        onSave={handleDatabaseUpdated}
      />

      {/* Manage Database Dialog */}
      <ManageLeadDatabaseDialog
        open={!!manageTarget}
        onOpenChange={(open) => !open && setManageTarget(null)}
        database={manageTarget}
        onDatabaseUpdated={(updated) => {
          handleDatabaseUpdated(updated);
          setManageTarget(updated);
        }}
      />
    </div>
  );
};

export default LeadsBroadcaster;
