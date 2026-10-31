export type JourneyChoice = 'restore' | 'explore';

export const JOURNEY_REALMS = [
  {
    name: 'Reino normal', symbol: '✦', accent: 'text-emerald-300', border: 'border-emerald-400/30',
    opening: 'As estradas entre os reinos perderam a luz. Seu herói segue o primeiro fio na mata viva.',
    middle: 'Uma clareira guarda um marco antigo. Sua decisão dará a este caminho uma lembrança própria.',
    approach: 'A trilha termina diante do guardião da passagem.',
    prompt: 'O que fazer com o marco coberto de raízes?',
    restore: { label: 'Restaurar o marco', detail: 'Deixar uma luz para quem vier depois.', consequence: 'O marco voltou a brilhar. Viajantes encontram o caminho pela luz que você deixou.' },
    explore: { label: 'Seguir as pegadas', detail: 'Descobrir a trilha escondida na mata.', consequence: 'Você encontrou uma rota discreta. O mapa da jornada agora guarda esse atalho.' },
  },
  {
    name: 'Reino do deserto', symbol: '☼', accent: 'text-amber-300', border: 'border-amber-400/30',
    opening: 'O fio alcança dunas onde as antigas rotas desapareceram sob a areia.',
    middle: 'Uma caravana parada protege a última memória do oásis.',
    approach: 'Além das dunas, o guardião mantém a passagem fechada.',
    prompt: 'Como ajudar a caravana a seguir?',
    restore: { label: 'Reerguer os sinais', detail: 'Marcar de novo a estrada do oásis.', consequence: 'Os sinais reapareceram nas dunas. A caravana tem uma rota clara para voltar.' },
    explore: { label: 'Buscar outra passagem', detail: 'Seguir as estrelas por um caminho novo.', consequence: 'Você traçou uma passagem pelas estrelas. A caravana conhece uma segunda rota.' },
  },
  {
    name: 'Reino da água', symbol: '≈', accent: 'text-cyan-300', border: 'border-cyan-400/30',
    opening: 'No litoral, o fio mergulha sob pontes partidas e canais silenciosos.',
    middle: 'Uma vila espera que a água volte a ligar suas duas margens.',
    approach: 'A corrente leva ao guardião que vigia a travessia.',
    prompt: 'Por onde abrir a travessia da vila?',
    restore: { label: 'Reparar a ponte', detail: 'Unir as margens pelo antigo caminho.', consequence: 'A ponte voltou a unir as margens. A vila pode atravessar pelo caminho conhecido.' },
    explore: { label: 'Guiar pelos canais', detail: 'Mapear uma rota sobre a água.', consequence: 'Você mapeou os canais seguros. A vila ganhou uma nova travessia.' },
  },
  {
    name: 'Reino de gelo', symbol: '❄', accent: 'text-sky-200', border: 'border-sky-300/30',
    opening: 'O fio some sob a neve, mas ainda pulsa entre torres de vigia abandonadas.',
    middle: 'Uma torre soterrada pode orientar quem enfrenta a nevasca.',
    approach: 'No alto da serra, o guardião observa o passo congelado.',
    prompt: 'Como deixar a serra mais segura?',
    restore: { label: 'Acender a torre', detail: 'Trazer de volta seu farol de inverno.', consequence: 'A torre acesa corta a nevasca. Quem passa pela serra encontra o farol.' },
    explore: { label: 'Marcar um abrigo', detail: 'Encontrar refúgio entre as rochas.', consequence: 'Você marcou um abrigo entre as rochas. A serra guarda um lugar de descanso.' },
  },
  {
    name: 'Reino do fogo', symbol: '✺', accent: 'text-orange-300', border: 'border-orange-400/30',
    opening: 'O último fio atravessa a pedra quente. O elo dos cinco reinos está perto de se fechar.',
    middle: 'Uma forja antiga ainda guarda brasas suficientes para iluminar a rota.',
    approach: 'Adiante, o guardião do fogo protege a última passagem deste ciclo.',
    prompt: 'O que fazer com as brasas da forja?',
    restore: { label: 'Reacender a forja', detail: 'Devolver sua luz à estrada.', consequence: 'A forja voltou a iluminar a estrada. Seu gesto permanece nas brasas.' },
    explore: { label: 'Levar uma centelha', detail: 'Abrir uma rota para o próximo ciclo.', consequence: 'Você levou uma centelha adiante. Ela marca o início de uma nova rota.' },
  },
] as const;

export function journeyPosition(stage: number) {
  const safe = Number.isSafeInteger(stage) ? Math.min(100000, Math.max(1, stage)) : 1;
  const cycle = Math.floor((safe - 1) / 50) + 1;
  const chapter = Math.floor(((safe - 1) % 50) / 10) + 1;
  const step = ((safe - 1) % 10) + 1;
  return { cycle, chapter, step, milestone: (cycle - 1) * 50 + (chapter - 1) * 10 + 5 };
}

export function journeyNarrative(step: number, chapter: number) {
  const realm = JOURNEY_REALMS[chapter - 1];
  if (step < 5) return realm.opening;
  if (step < 10) return realm.middle;
  return realm.approach;
}
