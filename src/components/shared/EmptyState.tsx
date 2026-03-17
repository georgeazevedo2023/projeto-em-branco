import React from 'react';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  desc: string;
}

export const EmptyState = ({ icon: Icon, title, desc }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-muted-foreground" />
    </div>
    <h3 className="font-semibold mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground">{desc}</p>
  </div>
);

export default EmptyState;
