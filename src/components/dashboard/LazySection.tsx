import { memo, useRef, useState, useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface LazySectionProps {
  children: ReactNode;
  height?: string;
  className?: string;
}

const LazySection = ({ children, height = '280px', className }: LazySectionProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!visible) {
    return (
      <div ref={ref} className={className}>
        <Skeleton style={{ height }} className="w-full rounded-xl" />
      </div>
    );
  }

  return <div className={className}>{children}</div>;
};

export default memo(LazySection);
