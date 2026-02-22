import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

const DashboardLayout = () => {
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavigate = () => {
    setMobileMenuOpen(false);
  };

  if (isMobile) {
    return (
      <div className="flex flex-col h-[100dvh] bg-aurora">
        <MobileHeader onOpenMenu={() => setMobileMenuOpen(true)} />
        
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="p-0 w-72 border-r border-primary/10">
            <Sidebar isMobile onNavigate={handleNavigate} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full p-4">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-aurora">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
