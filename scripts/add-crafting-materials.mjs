import https from 'https';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = 'jfnospjxdkelxlhcwuia';

// Insere materiais de fabricação como itens no game_items
// Categoria: 'material' | stackable: true | is_consumable: false
// effect = id usado pelo DungeonArena para identificar e salvar no inventário
const sql = `
INSERT INTO public.game_items (name, description, icon, category, rarity, stackable, is_consumable, effect, shop_price, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, is_starter)
VALUES
  ('Pedra Bruta',          'Material de fabricação. Usada para forjar armaduras e ferramentas.',   '🪨', 'material', 'comum',    true, false, 'pedra_bruta',         NULL, 0,0,0,0,0,0,0, 1, false),
  ('Galho Seco',           'Material de fabricação. Serve como cabo de armas e componente mágico.','🌿', 'material', 'comum',    true, false, 'galho_seco',          NULL, 0,0,0,0,0,0,0, 1, false),
  ('Fibra Vegetal',        'Material de fabricação. Utilizada em tecidos e amarrações.',            '🌱', 'material', 'comum',    true, false, 'fibra_vegetal',       NULL, 0,0,0,0,0,0,0, 1, false),
  ('Couro Cru',            'Material de fabricação. Usado para criar armaduras leves e bolsas.',   '🐾', 'material', 'incomum',  true, false, 'couro_cru',           NULL, 0,0,0,0,0,0,0, 1, false),
  ('Osso Polido',          'Material de fabricação. Ingrediente em poções e armas ósseas.',        '🦴', 'material', 'incomum',  true, false, 'osso_polido',         NULL, 0,0,0,0,0,0,0, 1, false),
  ('Cristal Fragmentado',  'Material raro. Necessário para encantamentos e itens mágicos.',        '💎', 'material', 'raro',     true, false, 'cristal_fragmentado', NULL, 0,0,0,0,0,0,0, 1, false)
ON CONFLICT (effect) DO NOTHING;
`;

// Try with UNIQUE constraint on effect, otherwise just skip conflicts
const sqlSafe = `
DO $$
BEGIN
  -- Add UNIQUE constraint on effect if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_items_effect_unique'
  ) THEN
    ALTER TABLE public.game_items ADD CONSTRAINT game_items_effect_unique UNIQUE (effect);
  END IF;
END $$;

INSERT INTO public.game_items (name, description, icon, category, rarity, stackable, is_consumable, effect, shop_price, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, is_starter)
VALUES
  ('Pedra Bruta',          'Material de fabricação. Usada para forjar armaduras e ferramentas.',   '🪨', 'material', 'comum',    true, false, 'pedra_bruta',         NULL, 0,0,0,0,0,0,0, 1, false),
  ('Galho Seco',           'Material de fabricação. Serve como cabo de armas e componente mágico.','🌿', 'material', 'comum',    true, false, 'galho_seco',          NULL, 0,0,0,0,0,0,0, 1, false),
  ('Fibra Vegetal',        'Material de fabricação. Utilizada em tecidos e amarrações.',            '🌱', 'material', 'comum',    true, false, 'fibra_vegetal',       NULL, 0,0,0,0,0,0,0, 1, false),
  ('Couro Cru',            'Material de fabricação. Usado para criar armaduras leves e bolsas.',   '🐾', 'material', 'incomum',  true, false, 'couro_cru',           NULL, 0,0,0,0,0,0,0, 1, false),
  ('Osso Polido',          'Material de fabricação. Ingrediente em poções e armas ósseas.',        '🦴', 'material', 'incomum',  true, false, 'osso_polido',         NULL, 0,0,0,0,0,0,0, 1, false),
  ('Cristal Fragmentado',  'Material raro. Necessário para encantamentos e itens mágicos.',        '💎', 'material', 'raro',     true, false, 'cristal_fragmentado', NULL, 0,0,0,0,0,0,0, 1, false)
ON CONFLICT DO NOTHING;
`;

const body = JSON.stringify({ query: sqlSafe });
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
      if (json.error) console.error('❌', json.error);
      else console.log('✅ Materiais de fabricação inseridos em game_items');
    } catch { console.log(d); }
  });
});
req.write(body);
req.end();
