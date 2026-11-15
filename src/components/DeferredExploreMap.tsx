import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

export const LazyExploreMap = lazy(() => import('./ExploreMap').then(module => ({ default: module.ExploreMap })));

export function DeferredExploreMap(props: React.ComponentProps<typeof LazyExploreMap>) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const placeholder = <div className="p-12 text-center">Explore plant locations on the interactive map.</div>;
  return <div ref={container} id={visible ? undefined : 'explore-map'} style={{ minHeight: 480 }}>
    {visible ? <Suspense fallback={placeholder}><LazyExploreMap {...props} /></Suspense> : placeholder}
  </div>;
}
