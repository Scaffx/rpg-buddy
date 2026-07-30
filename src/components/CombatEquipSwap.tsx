import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';

/**
 * Troca de arma no meio da luta.
 *
 * Enfrentou um bicho de água e tem uma arma elétrica na mochila? Dá para trocar
 * — mas TEM PREÇO: na rodada da troca você abre mão da habilidade e só desfere
 * o golpe básico. Sem esse custo o matchup elemental morre, porque bastaria
 * contra-equipar sempre na hora e a preparação (e as lupas) perderia o sentido.
 */
export default function CombatEquipSwap({
  disabled,
  onSwapped,
}: {
  disabled: boolean;
  /** Chamado após a troca — a arena usa para consumir o turno do jogador. */
  onSwapped: (weaponName: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: inventory } = useInventory();
  const [open, setOpen] = useState(false);

  const weapons = useMemo(() => {
    return ((inventory || []) as InventoryItem[]).filter(
      (inv) => (inv.game_items as { category?: string } | undefined)?.category === 'weapon',
    );
  }, [inventory]);

  const equipped = weapons.find((w) => w.equipped);

  const swap = useMutation({
    mutationFn: async (inv: InventoryItem) => {
      if (!user) throw new Error('Não autenticado');
      // Desequipa a arma atual e equipa a escolhida. Só armas são afetadas —
      // armadura e acessório seguem no lugar.
      const ids = weapons.map((w) => w.id);
      if (ids.length > 0) {
        await supabase.from('user_inventory').update({ equipped: false }).in('id', ids).eq('user_id', user.id);
      }
      const { error } = await supabase
        .from('user_inventory')
        .update({ equipped: true })
        .eq('id', inv.id)
        .eq('user_id', user.id);
      if (error) throw error;
      return inv;
    },
    onSuccess: (inv) => {
      const name = (inv.game_items as { name?: string } | undefined)?.name || 'arma';
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setOpen(false);
      toast(`🔁 ${name} equipada — nesta rodada você só desfere o golpe básico.`, { duration: 3000 });
      onSwapped(name);
    },
    onError: (e: unknown) => toast.error((e as { message?: string })?.message || 'Não foi possível trocar agora.'),
  });

  if (weapons.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || swap.isPending}
        title="Trocar de arma custa a habilidade desta rodada"
        className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-40"
      >
        <Repeat className="w-3 h-3" /> Trocar arma
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-56 rounded-lg border border-violet-500/40 bg-zinc-900 p-1.5 shadow-xl">
          <p className="px-1.5 py-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Custa a habilidade da rodada
          </p>
          {weapons.map((w) => {
            const gi = w.game_items as { name?: string; weapon_element?: string } | undefined;
            const isEquipped = w.id === equipped?.id;
            return (
              <button
                key={w.id}
                onClick={() => !isEquipped && swap.mutate(w)}
                disabled={isEquipped || swap.isPending}
                className="w-full flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs text-zinc-200 hover:bg-violet-500/15 disabled:opacity-40"
              >
                <span className="truncate">{gi?.name || 'Arma'}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">
                  {isEquipped ? 'equipada' : gi?.weapon_element || ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
