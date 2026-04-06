// Configuração centralizada de atributos do RPG
export const ATTRIBUTE_COLORS: Record<string, string> = {
  Força: "bg-red-400/20 text-red-400 border-red-400/30",
  Agilidade: "bg-amber-400/20 text-amber-400 border-amber-400/30",
  Vitalidade: "bg-green-400/20 text-green-400 border-green-400/30",
  Inteligência: "bg-blue-400/20 text-blue-400 border-blue-400/30",
  Sabedoria: "bg-cyan-400/20 text-cyan-400 border-cyan-400/30",
  Disciplina: "bg-indigo-400/20 text-indigo-400 border-indigo-400/30",
  Carisma: "bg-pink-400/20 text-pink-400 border-pink-400/30",
  Criatividade: "bg-purple-400/20 text-purple-400 border-purple-400/30",
  Relacionamento: "bg-rose-400/20 text-rose-400 border-rose-400/30",
  Resiliência: "bg-orange-400/20 text-orange-400 border-orange-400/30",
  Autoaperfeiçoamento: "bg-amber-300/20 text-amber-300 border-amber-300/30",
};

export function getAttributeColorClass(name: string): string {
  return ATTRIBUTE_COLORS[name] || "bg-secondary text-secondary-foreground border-border";
}
