// Perfil "moderno" de cada classe-base (column_index === 2 da árvore).
// Usado na confirmação de seleção de classe para garantir que o usuário
// realmente se identifica com aquele arquétipo da vida real.

export type ClassProfile = {
  starterId: string; // id do starter_class (também usado em STARTER_TO_CLASS_NAME)
  treeName: string; // nome na árvore de classes (column_index === 2)
  emoji: string;
  modernTitle: string;
  modernDescription: string;
  examples: string[]; // profissões/perfis típicos
  missions: string[]; // missões pré-definidas que serão sugeridas
};

export const CLASS_PROFILES: ClassProfile[] = [
  {
    starterId: 'guerreiro',
    treeName: 'Espadachim',
    emoji: '⚔️',
    modernTitle: 'Atleta / Trabalhador Físico',
    modernDescription:
      'Você vive pela força do corpo. Treina, levanta peso, trabalha duro com as mãos.',
    examples: ['Academia / Musculação', 'Trabalho manual / Construção', 'Militares / Bombeiros', 'Atletas profissionais'],
    missions: [
      'Treinar musculação (Seg/Qua/Sex)',
      'Proteína pós-treino',
      'Caminhada 30 min (Ter/Qui)',
      'Dormir 8 horas',
      'Hidratação 2L/dia',
    ],
  },
  {
    starterId: 'mago',
    treeName: 'Mago',
    emoji: '📚',
    modernTitle: 'Estudioso / Concurseiro / Desenvolvedor',
    modernDescription:
      'Você conquista pelo intelecto. Estuda, programa, pesquisa — o conhecimento é sua arma.',
    examples: ['Concurseiros', 'Programadores / Desenvolvedores', 'Pesquisadores / Pós-graduação', 'Estudantes universitários'],
    missions: [
      'Estudar 1 hora focado (Seg–Sex)',
      'Revisar anotações (Ter/Qui/Sáb)',
      'Resolver questões/exercícios',
      'Ler 20 páginas',
      'Praticar idioma estrangeiro',
    ],
  },
  {
    starterId: 'gatuno',
    treeName: 'Gatuno',
    emoji: '🌙',
    modernTitle: 'Trabalhador Noturno / Freelancer',
    modernDescription:
      'Você domina o caos com esperteza. Rotina irregular, trabalho criativo, autonomia total.',
    examples: ['Trabalho noturno', 'Freelancers / Autônomos', 'Designers / Criativos', 'Motoristas de app'],
    missions: [
      'Organizar agenda da semana (Dom)',
      'Cumprir meta diária (Seg–Sex)',
      'Higiene do sono',
      'Revisar pendências',
      'Descanso intencional 20 min',
    ],
  },
  {
    starterId: 'ferreiro',
    treeName: 'Mercador',
    emoji: '🔨',
    modernTitle: 'Profissional Técnico / Artesão',
    modernDescription:
      'Você acorda cedo e constrói com as próprias mãos. Trabalho técnico exige precisão e disciplina.',
    examples: ['Eletricistas / Encanadores', 'Mecânicos / Marceneiros', 'Soldadores / Pintores', 'Pequenos comerciantes'],
    missions: [
      'Acordar até às 5h30 (Seg–Sex)',
      'Treino funcional 30 min (Seg/Qua/Sex)',
      'Manutenção de ferramentas (Sex)',
      'Hidratação no trabalho 2L',
      'Alongamento pós-trabalho',
    ],
  },
  {
    starterId: 'clerico',
    treeName: 'Noviço',
    emoji: '✨',
    modernTitle: 'Religioso / Voluntário / Cuidador',
    modernDescription:
      'Você serve e cuida dos outros com propósito. Fé, empatia e dedicação ao próximo são sua jornada.',
    examples: ['Padres / Pastores / Religiosos', 'Enfermeiros / Médicos / Cuidadores', 'Terapeutas / Psicólogos', 'Voluntários / ONGs'],
    missions: [
      'Oração ou meditação matinal (todos os dias)',
      'Leitura de texto sagrado/filosofia',
      'Ato de voluntariado (Sáb)',
      'Gratidão diária',
      'Contato com pessoa querida (Qua/Dom)',
    ],
  },
  {
    starterId: 'arqueiro',
    treeName: 'Arqueiro',
    emoji: '🎯',
    modernTitle: 'Profissional de Escritório / Vendas',
    modernDescription:
      'Você mira no alvo certo com foco e organização. Metas, planilhas, networking — é o seu jogo.',
    examples: ['Vendedores / Comerciais', 'Analistas / Escritório', 'Recursos Humanos', 'Consultores / Gerentes'],
    missions: [
      'Organizar lista de tarefas (Seg–Sex)',
      'Bloco de foco 45 min (Pomodoro)',
      'Meta de contatos/networking',
      'Exercício rápido 20 min',
      'Revisão semanal de metas (Sex)',
    ],
  },
];

export function getClassProfileByTreeName(name: string): ClassProfile | null {
  return CLASS_PROFILES.find((p) => p.treeName === name) || null;
}
