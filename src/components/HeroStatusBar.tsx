import { useMemo } from "react";
import { Swords } from "lucide-react";
import { useProfile, useAttributes, useHealthStats } from "@/hooks/useProfile";
import { useInventory, getEquipmentBonuses, type InventoryItem } from "@/hooks/useInventory";
import { getAttributeLevels, getPlayerCombatStats } from "@/lib/combat";

/**
 * Barra de status do herói unificada — mostra os stats base + bônus de equipamento.
 * Auto-suficiente: busca profile, atributos e inventário internamente.
 */
export default function HeroStatusBar({ className = "" }: { className?: string }) {
  const { data: profile } = useProfile();
  const { data: attributes } = useAttributes();
  const { data: rawInventory = [] } = useInventory();
  const { data: healthStats } = useHealthStats();

  const inventory = rawInventory as InventoryItem[];

  const attributeLevels = useMemo(
    () => getAttributeLevels(attributes as any[]),
    [attributes],
  );

  const base = useMemo(
    () => getPlayerCombatStats(profile?.level || 1, attributeLevels),
    [profile?.level, attributeLevels],
  );

  const equip = useMemo(() => getEquipmentBonuses(inventory), [inventory]);

  const STATS = [
    { label: "ATK",  base: base.atk,  bonus: equip.atk },
    { label: "MATK", base: base.matk, bonus: equip.matk },
    { label: "DEF",  base: base.def,  bonus: equip.def },
    { label: "AGI",  base: base.agi,  bonus: equip.agi },
    { label: "CRIT", base: base.crit, bonus: equip.crit, suffix: "%" },
    { label: "HP",   base: base.hp,   bonus: equip.hp },
    { label: "MP",   base: base.mp,   bonus: equip.mp },
  ];

  const fatigue = Math.max(0, Math.min(100, Number(healthStats?.fatigue ?? 0)));
  const fatigueColor =
    fatigue >= 100 ? "bg-red-500"
    : fatigue >= 75 ? "bg-orange-500"
    : fatigue >= 50 ? "bg-amber-500"
    : "bg-emerald-500";
  const fatigueLocked = fatigue >= 100;
  const fatigueWarning = fatigue >= 50 && fatigue < 100;

  return (
    <div className={`bg-card border border-border rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Swords className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">⚔️ STATUS DO HERÓI</h3>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-xs">
        {STATS.map((s) => (
          <div key={s.label} className="bg-muted/40 rounded-md p-2 border border-border/50">
            <p className="text-muted-foreground">{s.label}</p>
            <p className="text-base font-bold text-foreground">
              {s.base + s.bonus}{s.suffix ?? ""}
            </p>
            {s.bonus > 0 && (
              <p className="text-[10px] text-emerald-400 font-semibold">+{s.bonus} equip</p>
            )}
          </div>
        ))}
      </div>

      {/* Fadiga — chave para combate de boss */}
      <div className={`rounded-lg border p-2.5 ${
        fatigueLocked
          ? "bg-red-500/10 border-red-500/40"
          : fatigueWarning
          ? "bg-amber-500/10 border-amber-500/40"
          : "bg-muted/40 border-border/50"
      }`}>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-foreground">FADIGA</span>
          <span className={`font-mono font-bold ${
            fatigueLocked ? "text-red-400" : fatigueWarning ? "text-amber-400" : "text-foreground"
          }`}>{fatigue}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${fatigueColor}`}
            style={{ width: `${fatigue}%` }}
          />
        </div>
        {fatigueLocked && (
          <p className="text-[11px] text-red-400 mt-1.5">
            🔒 Bosses bloqueados. Reduza para ≤50% via Short Rest 🔥 (topo da tela).
          </p>
        )}
        {fatigueWarning && !fatigueLocked && (
          <p className="text-[11px] text-amber-400/90 mt-1.5">
            ⚠️ Fadiga alta. Em 100% bosses ficam bloqueados até cair a ≤50%.
          </p>
        )}
      </div>

      {base.focus && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 text-xs text-primary">
          Foco: <span className="font-bold">{base.focus}</span>
          <span className="text-primary/70"> — atributo mais treinado nas suas missões</span>
        </div>
      )}
    </div>
  );
}
