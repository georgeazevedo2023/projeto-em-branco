import { Button } from '@/components/ui/button';
import { MessageSquareMore, Menu } from 'lucide-react';

interface MobileHeaderProps {
  onOpenMenu: () => void;
}

const MobileHeader = ({ onOpenMenu }: MobileHeaderProps) => {
  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-primary/10 sidebar-glass shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <MessageSquareMore className="w-4 h-4 text-primary" />
        </div>
        <span className="font-display font-bold text-lg">WhatsPRO</span>
      </div>
      <Button variant="ghost" size="icon" onClick={onOpenMenu}>
        <Menu className="w-5 h-5" />
      </Button>
    </header>
  );
};

export default MobileHeader;
