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
    <div className={`rounded-xl border border-border/60 bg-card overflow-hidden ${className}`}>
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
        <Swords className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/80">Status do Herói</h3>
      </div>

      {/* Grid de atributos */}
      <div className="p-3 grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/25 border border-border/40 px-1.5 py-2 text-center transition-colors hover:bg-muted/40"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">{s.label}</span>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {s.base + s.bonus}{s.suffix ?? ""}
            </span>
            {s.bonus > 0 && (
              <span className="text-[9px] text-emerald-400 font-semibold leading-none">+{s.bonus}</span>
            )}
          </div>
        ))}
      </div>

      {/* Fadiga */}
      <div className={`mx-3 mb-3 rounded-lg border p-2.5 ${
        fatigueLocked
          ? "bg-red-500/8 border-red-500/30"
          : fatigueWarning
          ? "bg-amber-500/8 border-amber-500/30"
          : "bg-muted/20 border-border/30"
      }`}>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold uppercase tracking-wider text-foreground/70 text-[10px]">Fadiga</span>
          <span className={`font-mono font-bold text-[11px] ${
            fatigueLocked ? "text-red-400" : fatigueWarning ? "text-amber-400" : "text-muted-foreground"
          }`}>{fatigue}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${fatigueColor}`}
            style={{ width: `${fatigue}%` }}
          />
        </div>
        {fatigueLocked && (
          <p className="text-[10px] text-red-400 mt-1.5 leading-snug">
            Bosses bloqueados — reduza para ≤50% via Descanso Curto.
          </p>
        )}
        {fatigueWarning && !fatigueLocked && (
          <p className="text-[10px] text-amber-400/80 mt-1.5 leading-snug">
            Fadiga alta. Ao atingir 100%, bosses ficam bloqueados.
          </p>
        )}
      </div>

      {base.focus && (
        <div className="mx-3 mb-3 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary/80">
          Foco: <span className="font-bold text-primary">{base.focus}</span>
          <span className="text-primary/50"> — atributo mais treinado</span>
        </div>
      )}
    </div>
  );
}

