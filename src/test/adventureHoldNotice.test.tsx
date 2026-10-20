import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AdventureHoldNotice } from '@/components/adventure/AdventureHoldNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
function renderNotice(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(element));
  return container;
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('aviso de permanência', () => {
  it('explica recuo 10→9 e deixa a pessoa avançar para 10', () => {
    const onAdvance = vi.fn();
    const notice = renderNotice(<AdventureHoldNotice stage={9} advanceToStage={10} retreatedFromStage={10} pending={false} error={false} onAdvance={onAdvance} />);
    expect(notice.textContent).toContain('Permanecendo na etapa 9');
    expect(notice.textContent).toContain('recuou após a derrota na etapa 10');
    const button = notice.querySelector('button')!;
    expect(button.textContent).toBe('Avançar para etapa 10');
    act(() => button.click());
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it('mantém etapa 1 sem alegar recuo inexistente e bloqueia cliques enquanto envia', () => {
    const onAdvance = vi.fn();
    const notice = renderNotice(<AdventureHoldNotice stage={1} advanceToStage={2} retreatedFromStage={1} pending error onAdvance={onAdvance} />);
    expect(notice.textContent).toContain('Permanecendo na etapa 1');
    expect(notice.textContent).not.toContain('recuou após a derrota');
    expect(notice.querySelector('button')?.disabled).toBe(true);
    expect(notice.querySelector('[role=alert]')?.textContent).toContain('permanece nesta etapa');
    act(() => notice.querySelector('button')!.click());
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('substitui a CTA por confirmação após o servidor aceitar o avanço', () => {
    const notice = renderNotice(<AdventureHoldNotice stage={9} advanceToStage={10} pending={false} accepted error={false} onAdvance={vi.fn()} />);
    expect(notice.textContent).toContain('Avanço confirmado');
    expect(notice.querySelector('button')).toBeNull();
  });
});
