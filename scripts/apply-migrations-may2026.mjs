import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN não definido');
  process.exit(1);
}

function runQuery(label, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (json.error || json.message) {
            console.error(`❌ ${label}:`, json.error || json.message);
            reject(new Error(json.error || json.message));
          } else {
            console.log(`✅ ${label}`);
            resolve(json);
          }
        } catch {
          console.log(`✅ ${label} (raw:`, d.slice(0, 100), ')');
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ================================================================
// Migration 1: Traduz nomes de classes T6 (inglês → português)
// ================================================================
const sql1 = `
UPDATE public.classes SET name = 'Cavaleiro Dragão'   WHERE name = 'Dragon Knight';
UPDATE public.classes SET name = 'Guarda Imperial'    WHERE name = 'Imperial Guard';
UPDATE public.classes SET name = 'Arquimago Supremo'  WHERE name = 'Archmage Supreme';
UPDATE public.classes SET name = 'Soberano da Morte'  WHERE name = 'Death Lord';
UPDATE public.classes SET name = 'Andarilho do Vazio' WHERE name = 'Void Walker';
`;

// ================================================================
// Migration 2: Leaderboard RPCs com current_class_name
// ================================================================
const sql2 = `
DROP FUNCTION IF EXISTS get_global_leaderboard(int);
DROP FUNCTION IF EXISTS get_regional_leaderboard(text, int);
DROP FUNCTION IF EXISTS get_class_leaderboard(text, int);
DROP FUNCTION IF EXISTS get_regional_class_leaderboard(text, text, int);
DROP FUNCTION IF EXISTS get_weekly_leaderboard(int);
DROP FUNCTION IF EXISTS get_regional_weekly_leaderboard(text, int);

CREATE OR REPLACE FUNCTION get_global_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_regional_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.region = p_region
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_class_leaderboard(p_class text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.starter_class = p_class
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_regional_class_leaderboard(p_region text, p_class text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  WHERE p.region = p_region
    AND p.starter_class = p_class
  ORDER BY p.total_xp DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_weekly_leaderboard(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text,
  weekly_count       bigint
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url,
         COUNT(a.user_id) AS weekly_count
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  LEFT JOIN public.activity_log a
    ON a.user_id = p.user_id
    AND a.action = 'mission_completed'
    AND a.created_at >= (NOW() - INTERVAL '7 days')
  GROUP BY p.user_id, p.display_name, p.total_xp, p.level, p.starter_class, c.name, p.avatar_url
  HAVING COUNT(a.user_id) > 0
  ORDER BY weekly_count DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_regional_weekly_leaderboard(p_region text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  total_xp           int,
  level              int,
  starter_class      text,
  current_class_name text,
  avatar_url         text,
  weekly_count       bigint
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.user_id, p.display_name, p.total_xp, p.level, p.starter_class,
         c.name AS current_class_name, p.avatar_url,
         COUNT(a.user_id) AS weekly_count
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.current_class_id
  LEFT JOIN public.activity_log a
    ON a.user_id = p.user_id
    AND a.action = 'mission_completed'
    AND a.created_at >= (NOW() - INTERVAL '7 days')
  WHERE p.region = p_region
  GROUP BY p.user_id, p.display_name, p.total_xp, p.level, p.starter_class, c.name, p.avatar_url
  HAVING COUNT(a.user_id) > 0
  ORDER BY weekly_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_global_leaderboard(int)                        TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_leaderboard(text, int)                TO authenticated;
GRANT EXECUTE ON FUNCTION get_class_leaderboard(text, int)                   TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_class_leaderboard(text, text, int)    TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_leaderboard(int)                        TO authenticated;
GRANT EXECUTE ON FUNCTION get_regional_weekly_leaderboard(text, int)         TO authenticated;
`;

// ================================================================
// Migration 3a: tabela crafting_recipes
// ================================================================
const sql3a = `
CREATE TABLE IF NOT EXISTS public.crafting_recipes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  class_required   TEXT NOT NULL,
  item_output_id   UUID NOT NULL REFERENCES public.game_items(id) ON DELETE CASCADE,
  materials_cost   INTEGER NOT NULL DEFAULT 5,
  gold_cost        INTEGER NOT NULL DEFAULT 0,
  crafting_icon    TEXT DEFAULT '⚙️',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crafting_recipes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crafting_recipes' AND policyname = 'Anyone can view crafting recipes'
  ) THEN
    CREATE POLICY "Anyone can view crafting recipes"
      ON public.crafting_recipes FOR SELECT TO public USING (true);
  END IF;
END $$;
`;

// ================================================================
// Migration 3b: itens fabricáveis (Alquimista)
// ================================================================
const sql3b = `
INSERT INTO public.game_items (
  name, description, icon, category, rarity,
  stat_label, atk_bonus, def_bonus, matk_bonus, agi_bonus,
  hp_bonus, mp_bonus, crit_bonus, shop_price, level_required,
  stackable, is_consumable, effect, is_starter, boss_drop_level
)
SELECT * FROM (VALUES
  ('Poção de Cura Menor','Uma poção vermelha borbulhante feita pelo Alquimista. Restaura HP instantaneamente.','🧪','consumable','comum','+30 HP',0,0,0,0,30,0,0,0,5,true,true,'heal_hp_30',false,NULL::int),
  ('Elixir de Concentração','Elixir azulado que aguça a mente. Restaura energia mágica quando mais precisar.','💧','consumable','incomum','+20 MP',0,0,0,0,0,20,0,0,8,true,true,'restore_mp_20',false,NULL::int),
  ('Elixir de Batalha','Poção explosiva de cor dourada. Aumenta temporariamente a força de ataque em combate.','⚗️','consumable','rara','+8 ATK',8,0,0,0,0,0,0,0,12,true,true,'buff_atk_8',false,NULL::int)
) AS v(name,description,icon,category,rarity,stat_label,atk_bonus,def_bonus,matk_bonus,agi_bonus,hp_bonus,mp_bonus,crit_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level)
WHERE NOT EXISTS (SELECT 1 FROM public.game_items gi WHERE gi.name = v.name);
`;

// ================================================================
// Migration 3c: itens fabricáveis (Mecânico)
// ================================================================
const sql3c = `
INSERT INTO public.game_items (
  name, description, icon, category, rarity,
  stat_label, atk_bonus, def_bonus, matk_bonus, agi_bonus,
  hp_bonus, mp_bonus, crit_bonus, shop_price, level_required,
  stackable, is_consumable, effect, is_starter, boss_drop_level
)
SELECT * FROM (VALUES
  ('Adaga Artesanal','Lâmina forjada à mão pelo Mecânico com materiais coletados em batalha. Leve e afiada.','🔪','weapon','incomum','+8 ATK +3% CRIT',8,0,0,0,0,0,3,0,8,false,false,NULL::text,false,NULL::int),
  ('Broquel Improvisado','Escudo rústico construído com sucata e metal fundido. Surpreendentemente resistente.','🛡️','armor','incomum','+7 DEF +10 HP',0,7,0,0,10,0,0,0,8,false,false,NULL::text,false,NULL::int),
  ('Manopla de Engenheiro','Luvas reforçadas com engrenagens e placas de metal. Combinam força e agilidade.','🥊','accessory','rara','+4 ATK +2 AGI',4,0,0,2,0,0,0,0,15,false,false,NULL::text,false,NULL::int)
) AS v(name,description,icon,category,rarity,stat_label,atk_bonus,def_bonus,matk_bonus,agi_bonus,hp_bonus,mp_bonus,crit_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level)
WHERE NOT EXISTS (SELECT 1 FROM public.game_items gi WHERE gi.name = v.name);
`;

// ================================================================
// Migration 3d: receitas de crafting
// ================================================================
const sql3d = `
INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT r.name, r.description, r.class_required, gi.id, r.materials_cost, r.gold_cost, r.crafting_icon
FROM (VALUES
  ('Preparar Poção de Cura','Misture ervas coletadas em batalha com água purificada. Restaura 30 HP.','Alquimista','Poção de Cura Menor',3,0,'🧪'),
  ('Destilar Elixir de Concentração','Um processo lento e preciso. Destile materiais arcanos para restaurar 20 MP.','Alquimista','Elixir de Concentração',5,10,'💧'),
  ('Forjar Elixir de Batalha','Receita avançada. Combina catalisadores raros para criar buff temporário de +8 ATK.','Alquimista','Elixir de Batalha',8,20,'⚗️'),
  ('Forjar Adaga Artesanal','Afile os materiais coletados em uma bigorna improvisada. Rápida e letal.','Mecânico','Adaga Artesanal',5,0,'🔪'),
  ('Montar Broquel Improvisado','Junte placas de metal e prenda-as com rebites. Não é bonito, mas funciona.','Mecânico','Broquel Improvisado',7,15,'🛡️'),
  ('Construir Manopla de Engenheiro','Engenharia aplicada ao combate. Engrenagens e metal reforçado.','Mecânico','Manopla de Engenheiro',10,30,'🥊')
) AS r(name, description, class_required, item_name, materials_cost, gold_cost, crafting_icon)
JOIN public.game_items gi ON gi.name = r.item_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.crafting_recipes cr WHERE cr.name = r.name
);
`;

async function main() {
  console.log('🚀 Aplicando migrations...\n');
  try {
    await runQuery('Migration 1: Tradução nomes T6', sql1);
    await runQuery('Migration 2: Leaderboard RPCs com current_class_name', sql2);
    await runQuery('Migration 3a: Tabela crafting_recipes', sql3a);
    await runQuery('Migration 3b: Itens Alquimista', sql3b);
    await runQuery('Migration 3c: Itens Mecânico', sql3c);
    await runQuery('Migration 3d: Receitas de crafting', sql3d);
    console.log('\n✅ Todas as migrations aplicadas com sucesso!');
  } catch (err) {
    console.error('\n❌ Falha:', err.message);
    process.exit(1);
  }
}

main();
