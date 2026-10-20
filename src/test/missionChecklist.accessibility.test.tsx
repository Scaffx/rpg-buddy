import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const mocks = vi.hoisted(() => ({
  add: vi.fn(), toggle: vi.fn(), remove: vi.fn(), toast: vi.fn(), pending: false,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useProfile')>()),
  useAddChecklistItem: () => ({ mutateAsync: mocks.add, isPending: mocks.pending }),
  useToggleChecklistItem: () => ({ mutate: mocks.toggle, isPending: false }),
}));
vi.mock('@/hooks/useMissionActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useMissionActions')>()),
  useDeleteChecklistItem: () => ({ mutate: mocks.remove, isPending: false }),
}));
vi.mock('@/hooks/use-toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-toast')>()),
  useToast: () => ({ toast: mocks.toast }),
}));

import { MissionChecklistControls, MissionFormDialogHeader } from '@/pages/Missions';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

const item = {
  id: 'item-1', mission_id: 'mission-1', created_at: '2026-10-19T00:00:00Z',
  description: 'Ler um capítulo', completed: false, xp_bonus: 2,
};
let root: Root | undefined;
let container: HTMLDivElement | undefined;

function Harness() {
  const [text, setText] = useState('');
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <MissionChecklistControls
        missionId="mission-1"
        missionTitle="Estudar"
        items={[item]}
        text={text}
        onTextChange={setText}
      />
    </form>
  );
}

async function renderHarness() {
  if (!container) throw new Error('Test container missing');
  root ??= createRoot(container);
  await act(async () => root?.render(<Harness />));
}

function namedButton(name: string): HTMLButtonElement {
  const button = [...container!.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.getAttribute('aria-label') === name);
  if (!button) throw new Error(`Button missing: ${name}`);
  return button;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.pending = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  await i18n.changeLanguage('pt');
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

describe('checklist de missão acessível', () => {
  it('nomeia controles com item e missão; Enter grava uma vez e não envia o formulário externo', async () => {
    let finishAdd: () => void = () => {};
    mocks.add.mockImplementation(() => new Promise<void>((resolve) => { finishAdd = resolve; }));
    await renderHarness();

    const checkbox = container!.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
    const input = container!.querySelector<HTMLInputElement>('input[aria-label]')!;
    const add = namedButton('Adicionar item à missão Estudar');
    const remove = namedButton('Remover Ler um capítulo da missão Estudar');
    expect(checkbox.getAttribute('aria-label')).toBe('Item Ler um capítulo da missão Estudar');
    expect(input.getAttribute('aria-label')).toBe('Novo item da missão Estudar');
    expect(add.disabled).toBe(true);
    await act(async () => checkbox.click());
    expect(mocks.toggle).toHaveBeenCalledExactlyOnceWith({ itemId: 'item-1', completed: true, xpBonus: 2 });
    await act(async () => remove.click());
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('item-1');

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('Native input setter missing');
    await act(async () => {
      setValue.call(input, '  Revisar notas  ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(add.disabled).toBe(false);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await act(async () => add.click());
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith({ missionId: 'mission-1', description: 'Revisar notas' });

    mocks.pending = true;
    await renderHarness();
    expect(input.disabled).toBe(true);
    expect(add.disabled).toBe(true);
    await act(async () => { finishAdd(); });
    expect(input.value).toBe('');
    expect(add.disabled).toBe(true);
  });

  it.each(['pt', 'en', 'es', 'ru', 'zh'])('tem nomes traduzidos em %s', async (locale) => {
    await i18n.changeLanguage(locale);
    for (const key of [
      'checklist_item_named', 'checklist_new_item_named',
      'checklist_add_named', 'checklist_remove_named',
      'form_create_description', 'form_edit_description',
    ]) {
      expect(i18n.getResource(locale, 'translation', `app.missions.${key}`)).toBeTruthy();
    }
    await renderHarness();
    const checkbox = container!.querySelector<HTMLElement>('[role="checkbox"]')!;
    expect(checkbox.getAttribute('aria-label')).toBe(i18n.t('app.missions.checklist_item_named', {
      item: item.description, title: 'Estudar',
    }));
    namedButton(i18n.t('app.missions.checklist_add_named', { title: 'Estudar' }));
  });

  it.each([
    { isEditing: false, title: 'Nova Missão', description: 'Defina a tarefa, a prioridade e quando ela acontece.' },
    { isEditing: true, title: 'Editar Missão', description: 'Atualize os dados da missão e salve as mudanças.' },
  ])('descreve o diálogo $title sem aviso Radix', async ({ isEditing, title, description }) => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    root = createRoot(container!);
    await act(async () => root?.render(
      <Dialog open>
        <DialogContent><MissionFormDialogHeader isEditing={isEditing} /></DialogContent>
      </Dialog>,
    ));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.getElementById(dialog!.getAttribute('aria-labelledby')!)?.textContent).toContain(title);
    expect(document.getElementById(dialog!.getAttribute('aria-describedby')!)?.textContent).toBe(description);
    expect([...warnings.mock.calls, ...errors.mock.calls].flat().join(' ')).not.toMatch(/Missing `Description`|DialogTitle/);
  });
});
