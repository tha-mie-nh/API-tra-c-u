import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorizedImage } from '../use-authorized-image';

interface LazyAuthorizedImageProps {
  path: string;
  alt: string;
  className?: string;
}

/**
 * Fetches an authenticated backend image only once the element scrolls into
 * view (`IntersectionObserver`), so opening a photo timeline with many
 * photos does not fire dozens of authenticated requests up front (phase-07
 * Implementation Step 9 "lazy-load"). Below ~30 photos/person, no
 * virtualization is needed (research §B) — this lazy fetch is enough.
 */
export function LazyAuthorizedImage({ path, alt, className }: LazyAuthorizedImageProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const { url, isLoading, error } = useAuthorizedImage(visible ? path : null);

  return (
    <div ref={containerRef} className={cn('bg-muted relative overflow-hidden rounded-md', className)} aria-busy={isLoading}>
      {url && <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />}
      {!url && !error && <Skeleton className="absolute inset-0" />}
      {error && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center">
          <ImageOff className="size-5" />
        </div>
      )}
    </div>
  );
}
