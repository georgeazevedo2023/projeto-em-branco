import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type InboxRole = Database['public']['Enums']['inbox_role'];

interface Instance {
  id: string;
  name: string;
}

interface InboxItem {
  id: string;
  name: string;
  instance_id: string;
}

interface CreateInboxUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const CreateInboxUserDialog = ({ open, onOpenChange, onCreated }: CreateInboxUserDialogProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<InboxRole>('agente');
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [selectedInboxIds, setSelectedInboxIds] = useState<string[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [inboxes, setInboxes] = useState<InboxItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    const [instRes, inboxRes] = await Promise.all([
      supabase.from('instances').select('id, name').order('name'),
      supabase.from('inboxes').select('id, name, instance_id').order('name'),
    ]);
    setInstances(instRes.data || []);
    setInboxes(inboxRes.data || []);
  };

  const filteredInboxes = useMemo(
    () =>
      selectedInstanceIds.length > 0
        ? inboxes.filter((ib) => selectedInstanceIds.includes(ib.instance_id))
        : [],
    [inboxes, selectedInstanceIds]
  );

  // Clear inbox selections when instances change
  useEffect(() => {
    setSelectedInboxIds((prev) =>
      prev.filter((id) => filteredInboxes.some((ib) => ib.id === id))
    );
  }, [filteredInboxes]);

  const toggleInstance = (id: string) => {
    setSelectedInstanceIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleInbox = (id: string) => {
    setSelectedInboxIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setSelectedRole('agente');
    setSelectedInstanceIds([]);
    setSelectedInboxIds([]);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('Email e senha são obrigatórios');
      return;
    }
    if (selectedInboxIds.length === 0) {
      toast.error('Selecione ao menos uma caixa de entrada');
      return;
    }

    setIsCreating(true);
    try {
      // 1. Create user via edge function
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email,
            password,
            full_name: name,
            is_super_admin: false,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao criar usuário');

      const newUserId = result.user?.id;
      if (!newUserId) throw new Error('ID do usuário não retornado');

      // 2. Assign instance access
      if (selectedInstanceIds.length > 0) {
        const { error: accessErr } = await supabase.from('user_instance_access').insert(
          selectedInstanceIds.map((instance_id) => ({
            user_id: newUserId,
            instance_id,
          }))
        );
        if (accessErr) console.error('Erro ao atribuir instâncias:', accessErr);
      }

      // 3. Add to inboxes with selected role
      const { error: inboxErr } = await supabase.from('inbox_users').insert(
        selectedInboxIds.map((inbox_id) => ({
          user_id: newUserId,
          inbox_id,
          role: selectedRole,
        }))
      );
      if (inboxErr) console.error('Erro ao atribuir caixas:', inboxErr);

      toast.success('Usuário de atendimento criado com sucesso!');
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      console.error('Error creating inbox user:', error);
      toast.error(error.message || 'Erro ao criar usuário');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Usuário de Atendimento</DialogTitle>
          <DialogDescription>
            Crie um usuário e atribua a caixas de entrada
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label>Nome de Exibição</Label>
            <Input
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label>Senha *</Label>
            <Input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as InboxRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="agente">Agente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Instances */}
          <div className="space-y-2">
            <Label>Instâncias</Label>
            <div className="border border-border/50 rounded-lg p-3 max-h-36 overflow-y-auto space-y-2">
              {instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma instância disponível</p>
              ) : (
                instances.map((inst) => (
                  <label key={inst.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedInstanceIds.includes(inst.id)}
                      onCheckedChange={() => toggleInstance(inst.id)}
                    />
                    <span>{inst.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Inboxes */}
          <div className="space-y-2">
            <Label>Caixas de Entrada *</Label>
            <div className="border border-border/50 rounded-lg p-3 max-h-36 overflow-y-auto space-y-2">
              {filteredInboxes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedInstanceIds.length > 0
                    ? 'Nenhuma caixa para as instâncias selecionadas'
                    : 'Selecione uma instância primeiro'}
                </p>
              ) : (
                filteredInboxes.map((inbox) => {
                  const inst = instances.find((i) => i.id === inbox.instance_id);
                  return (
                    <label key={inbox.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={selectedInboxIds.includes(inbox.id)}
                        onCheckedChange={() => toggleInbox(inbox.id)}
                      />
                      <span>
                        {inbox.name}
                        {inst && (
                          <span className="text-muted-foreground ml-1 text-xs">({inst.name})</span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              'Criar Usuário'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateInboxUserDialog;
