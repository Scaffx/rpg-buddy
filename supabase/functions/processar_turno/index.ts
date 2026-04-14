// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProcessarTurnoBody = {
  combate_id?: string;
  acao_escolhida?: 'atacar' | string;
};

type CombatRow = {
  id: string;
  personagem_id: string;
  hp_atual_boss: number;
  hp_atual_personagem: number;
  turno_atual: 'player' | 'boss';
  status: 'em_andamento' | 'vitoria' | 'derrota';
  personagens: {
    id: string;
    ataque_base: number;
    defesa_base: number;
  } | null;
  bosses: {
    id: string;
    ataque_base: number;
    defesa_base: number;
  } | null;
};

const rollD20 = () => Math.floor(Math.random() * 20) + 1;

const calculateDamage = (baseAttack: number, d20: number, defenderDefense: number, multiplier: number) => {
  const raw = baseAttack + Math.floor(d20 * multiplier) - Math.floor(defenderDefense * 0.5);
  return Math.max(1, raw);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ProcessarTurnoBody;
    const combateId = body.combate_id;
    const acaoEscolhida = body.acao_escolhida;

    if (!combateId || acaoEscolhida !== 'atacar') {
      return new Response(JSON.stringify({ error: 'Invalid payload: combate_id and acao_escolhida="atacar" are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: combat, error: combatError } = await supabase
      .from('combates_ativos')
      .select(
        `
          id,
          personagem_id,
          hp_atual_boss,
          hp_atual_personagem,
          turno_atual,
          status,
          personagens!combates_ativos_personagem_id_fkey(id, ataque_base, defesa_base),
          bosses!combates_ativos_boss_id_fkey(id, ataque_base, defesa_base)
        `,
      )
      .eq('id', combateId)
      .single<CombatRow>();

    if (combatError || !combat) {
      return new Response(JSON.stringify({ error: 'Combat not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (combat.personagem_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: combat does not belong to authenticated user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (combat.status !== 'em_andamento' || combat.turno_atual !== 'player') {
      return new Response(JSON.stringify({ error: 'Combat is not ready for player action' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!combat.personagens || !combat.bosses) {
      return new Response(JSON.stringify({ error: 'Combat relationships are invalid' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dadoPlayer = rollD20();
    const danoPlayer = calculateDamage(
      combat.personagens.ataque_base,
      dadoPlayer,
      combat.bosses.defesa_base,
      2,
    );

    let hpBossRestante = Math.max(combat.hp_atual_boss - danoPlayer, 0);
    let dadoBoss = 0;
    let danoBoss = 0;
    let hpPlayerRestante = combat.hp_atual_personagem;
    let status: 'em_andamento' | 'vitoria' | 'derrota' = 'em_andamento';
    let turnoAtual: 'player' | 'boss' = 'boss';

    if (hpBossRestante <= 0) {
      status = 'vitoria';
      turnoAtual = 'player';
    } else {
      dadoBoss = rollD20();
      danoBoss = calculateDamage(
        combat.bosses.ataque_base,
        dadoBoss,
        combat.personagens.defesa_base,
        1.5,
      );
      hpPlayerRestante = Math.max(combat.hp_atual_personagem - danoBoss, 0);

      if (hpPlayerRestante <= 0) {
        status = 'derrota';
      } else {
        status = 'em_andamento';
      }

      turnoAtual = 'player';
    }

    const { error: updateError } = await supabase
      .from('combates_ativos')
      .update({
        hp_atual_boss: hpBossRestante,
        hp_atual_personagem: hpPlayerRestante,
        turno_atual: turnoAtual,
        status,
      })
      .eq('id', combat.id)
      .eq('personagem_id', user.id);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        dado_player: dadoPlayer,
        dano_player: danoPlayer,
        dado_boss: dadoBoss,
        dano_boss: danoBoss,
        hp_boss_restante: hpBossRestante,
        hp_player_restante: hpPlayerRestante,
        status,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
