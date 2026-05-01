-- Link missions to the NPC that created them via chat
ALTER TABLE missions ADD COLUMN IF NOT EXISTS npc_id text;
CREATE INDEX IF NOT EXISTS idx_missions_npc_id ON missions(npc_id);
