import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ShieldCheck, Plus, Inbox, Users, Headphones, Shield, ChevronDown, UserPlus, Briefcase, FileText,
} from 'lucide-react';
import BackupModule from '@/components/dashboard/BackupModule';
import DepartmentsTab from '@/components/dashboard/DepartmentsTab';
import DocumentationTab from '@/components/admin/DocumentationTab';
import InboxesTab from '@/components/admin/InboxesTab';
import UsersTab from '@/components/admin/UsersTab';
import TeamTab from '@/components/admin/TeamTab';

const AdminPanel = () => {
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('inboxes');

  // Refs for opening create dialogs from the header dropdown
  const [openCreateInbox, setOpenCreateInbox] = useState(false);
  const [openCreateUser, setOpenCreateUser] = useState(false);
  const [openCreateTeam, setOpenCreateTeam] = useState(false);

  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Administração</h1>
            <p className="text-sm text-muted-foreground">Caixas, usuários e equipe de atendimento</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Criar Novo
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => { setActiveTab('inboxes'); setOpenCreateInbox(true); }}>
              <Inbox className="w-4 h-4 mr-2" />
              Nova Caixa de Entrada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setActiveTab('users'); setOpenCreateUser(true); }}>
              <Shield className="w-4 h-4 mr-2" />
              Novo Usuário
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setActiveTab('team'); setOpenCreateTeam(true); }}>
              <UserPlus className="w-4 h-4 mr-2" />
              Novo Membro de Atendimento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto no-scrollbar">
          <TabsTrigger value="inboxes" className="gap-2">
            <Inbox className="w-4 h-4" />
            <span>Caixas</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Shield className="w-4 h-4" />
            <span>Usuários</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Headphones className="w-4 h-4" />
            <span>Equipe</span>
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-2">
            <Users className="w-4 h-4" />
            <span>Departamentos</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2">
            <Briefcase className="w-4 h-4" />
            <span>Backup</span>
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-2">
            <FileText className="w-4 h-4" />
            <span>Docs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inboxes" className="mt-6">
          <InboxesTab />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UsersTab />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamTab />
        </TabsContent>

        <TabsContent value="departments" className="mt-6">
          <DepartmentsTab />
        </TabsContent>

        <TabsContent value="backup" className="mt-6">
          <BackupModule />
        </TabsContent>

        <TabsContent value="docs" className="mt-6">
          <DocumentationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;
