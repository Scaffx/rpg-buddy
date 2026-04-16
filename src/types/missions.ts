export type MissionPriority = 'baixa' | 'media' | 'alta';

export type MissionStatus = 'pendente' | 'em_andamento' | 'concluida' | 'arquivada';

export type Weekday = 'Dom' | 'Seg' | 'Ter' | 'Qua' | 'Qui' | 'Sex' | 'Sab' | 'Sáb';

export type MissionDailyState = 'pending' | 'completed' | 'failed' | 'skipped';

export type MissionDailyStatus = Record<string, MissionDailyState>;

export type MissionCategory = 'fisico' | 'casa' | 'criativo' | 'social' | 'ar_livre' | 'estudo' | 'geral';

export type MissionLifestyleArchetype =
  | 'guerreiro'
  | 'mago'
  | 'gatuno'
  | 'ferreiro'
  | 'clerico'
  | 'arqueiro'
  | 'novato'
  | 'estudante'
  | 'criativo'
  | 'atleta'
  | 'social';

export type MissionPreset = {
  title: string;
  description: string;
  attribute: string;
  days: Weekday[];
  priority: MissionPriority;
  lifestyle?: MissionLifestyleArchetype;
};
