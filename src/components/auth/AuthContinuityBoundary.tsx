import { ReactNode, Suspense, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import i18n from '@/i18n';

type Position = { element: Element; top: number; left: number };
type Snapshot = { focused: HTMLElement | null; positions: Position[]; windowX: number; windowY: number };

function Suspender({ promise, children }: { promise: Promise<void> | null; children: ReactNode }) {
  if (promise) throw promise;
  return <>{children}</>;
}

/** Mounted route state is retained only while Auth confirms the same session. */
export function AuthContinuityBoundary({ children }: { children: ReactNode }) {
  const { continuity } = useAuth();
  const { t } = useTranslation(undefined, { i18n });
  const root = useRef<HTMLDivElement>(null);
  const snapshot = useRef<Snapshot | null>(null);
  if (continuity.promise && !snapshot.current && root.current) {
    const element = root.current;
    const active = document.activeElement;
    snapshot.current = {
      focused: active instanceof HTMLElement && element.contains(active) ? active : null,
      positions: [element, ...Array.from(element.querySelectorAll('*'))]
        .filter(node => node.scrollTop || node.scrollLeft)
        .map(node => ({ element: node, top: node.scrollTop, left: node.scrollLeft })),
      windowX: window.scrollX,
      windowY: window.scrollY,
    };
  }
  useLayoutEffect(() => {
    const retained = root.current?.querySelector<HTMLElement>('[data-auth-retained]');
    if (continuity.promise) {
      retained?.setAttribute('inert', '');
      retained?.setAttribute('aria-hidden', 'true');
      return;
    }
    retained?.removeAttribute('inert');
    retained?.removeAttribute('aria-hidden');
    const saved = snapshot.current;
    snapshot.current = null;
    if (!saved || !continuity.resumed) return;
    for (const { element, top, left } of saved.positions) {
      if (element.isConnected && root.current?.contains(element)) {
        element.scrollTop = top;
        element.scrollLeft = left;
      }
    }
    if (window.scrollX !== saved.windowX || window.scrollY !== saved.windowY) {
      window.scrollTo(saved.windowX, saved.windowY);
    }
    if (saved.focused?.isConnected && root.current?.contains(saved.focused)) {
      saved.focused.focus({ preventScroll: true });
    }
  }, [continuity.promise, continuity.sequence, continuity.resumed]);

  return <div ref={root} data-auth-continuity>
    <Suspense fallback={<main role="status" aria-live="polite" className="flex min-h-screen items-center justify-center p-6">{t('app.confirming_session')}</main>}>
      <Suspender key={continuity.epoch} promise={continuity.promise}>
        <div data-auth-retained>{children}</div>
      </Suspender>
    </Suspense>
  </div>;
}
