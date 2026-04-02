// Configuração centralizada de atributos do RPG
export const ATTRIBUTE_COLORS: Record<string, string> = {
  Agilidade: "bg-yellow-400/20 text-yellow-400 border-yellow-400/30",
  Carisma: "bg-purple-400/20 text-purple-400 border-purple-400/30",
  Criatividade: "bg-pink-400/20 text-pink-400 border-pink-400/30",
  Disciplina: "bg-pink-400/20 text-pink-400 border-pink-400/30",
  Força: "bg-yellow-400/20 text-yellow-400 border-yellow-400/30",
  Inteligência: "bg-pink-400/20 text-pink-400 border-pink-400/30",
  Resiliência: "bg-blue-400/20 text-blue-400 border-blue-400/30",
  Sabedoria: "bg-teal-400/20 text-teal-400 border-teal-400/30",
  Vitalidade: "bg-pink-400/20 text-pink-400 border-pink-400/30",
  Autoaperfeiçoamento: "bg-yellow-400/20 text-yellow-400 border-yellow-400/30",
  Relacionamento: "bg-purple-400/20 text-purple-400 border-purple-400/30",
};

export function getAttributeColorClass(name: string): string {
  return ATTRIBUTE_COLORS[name] || "bg-secondary text-secondary-foreground border-border";
}
