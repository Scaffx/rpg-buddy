import { supabase } from '@/integrations/supabase/client';

/**
 * Cliente do turno de combate.
 *
 * Todo dano é resolvido na edge `processar_turno` — o cliente só declara a
 * intenção. Esta é a única porta para essa chamada, usada pela arena, pela
 * janela flutuante e pelo automático, para que os três joguem exatamente o
 * mesmo combate.
 */

export type CombatTurnRequest = {
  combateId: string;
  acaoEscolhida: string;
  currentPlayerMp?: number;
  skillId?: string;
  skillName?: string;
  skillPower?: number;
  skillEffectType?: string;
  skillMpCost?: number;
  skillElement?: string;
  activePetType?: string | null;
};

export type CombatTurnResult = {
  dado_player: number;
  dano_player: number;
  dado_boss: number;
  dano_boss: number;
  hp_boss_restante: number;
  hp_player_restante: number;
  status: string;
  habilidade_player?: string;
  habilidade_boss?: string;
  efeitos_player?: unknown[];
  efeitos_boss?: unknown[];
  mp_restante?: number;
};

/**
 * supabase-js devolve FunctionsHttpError com mensagem genérica; a mensagem real
 * vem no corpo JSON dentro de error.context. Sem desembrulhar, o jogador vê
 * "Edge Function returned a non-2xx status code" no lugar de "MP insuficiente".
 */
async function unwrapEdgeError(error: unknown): Promise<string> {
  const fallback = (error as { message?: string })?.message || 'Erro desconhecido';
  try {
    const ctx = (error as { context?: unknown }).context as
      | { json?: () => Promise<Record<string, unknown>>; text?: () => Promise<string> }
      | undefined;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    } else if (ctx && typeof ctx.text === 'function') {
      const txt = await ctx.text();
      if (txt) return txt;
    }
  } catch {
    /* corpo ilegível — fica a mensagem genérica */
  }
  return fallback;
}

export async function submitCombatTurn(req: CombatTurnRequest): Promise<CombatTurnResult> {
  const { data, error } = await supabase.functions.invoke('processar_turno', {
    body: {
      combate_id: req.combateId,
      acao_escolhida: req.acaoEscolhida,
      skill_id: req.skillId,
      skill_name: req.skillName,
      skill_power: req.skillPower,
      current_mp: req.currentPlayerMp,
      ...(req.skillEffectType ? { skill_effect_type: req.skillEffectType } : {}),
      ...(req.skillMpCost !== undefined ? { skill_mp_cost: req.skillMpCost } : {}),
      ...(req.skillElement ? { skill_element: req.skillElement } : {}),
      ...(req.activePetType ? { active_pet_type: req.activePetType } : {}),
    },
  });

  if (error) throw new Error(await unwrapEdgeError(error));

  // A edge pode responder 2xx com payload de erro (ex.: insufficient_mp).
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    const d = data as Record<string, unknown>;
    throw new Error(String(d.message || d.error));
  }

  return data as CombatTurnResult;
}
