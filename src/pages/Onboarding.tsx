import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAttributes, useProfile } from '@/hooks/useProfile';
import { useClaimStarterKit } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Sword,
  BookOpen,
  Moon,
  Hammer,
  Cross,
  Target,
  ChevronRight,
  ChevronLeft,
  Scroll,
  Star,
  Shield,
  Zap,
  Check,
  Loader2,
} from 'lucide-react';
import type { MissionPreset } from '@/types/missions';

// ─── Classes e missões pré-definidas ───────────────────────────────────────────

type ClassDef = {
  id: string;
  name: string;
  starterItem: string;
  modernTitle: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
  description: string;
  modernDescription: string;
  missions: MissionPreset[];
};

const CLASSES: ClassDef[] = [
  {
    id: 'guerreiro',
    name: 'Guerreiro',
    starterItem: 'Espada Curta',
    modernTitle: 'Atleta / Trabalhador Físico',
    icon: <Sword className="w-8 h-8" />,
    color: 'border-red-500/60 bg-red-950/30',
    glow: 'shadow-red-500/20',
    description: 'Força e resistência em combate.',
    modernDescription:
      'Academia, musculação, trabalho manual, construção, militares — você vive pela força do corpo.',
    missions: [
      { title: 'Treinar musculação', description: 'Sessão de treino na academia ou em casa', attribute: 'Força', days: ['Seg', 'Qua', 'Sex'], priority: 'alta' },
      { title: 'Proteína pós-treino', description: 'Tomar proteína ou refeição rica após o treino', attribute: 'Vitalidade', days: ['Seg', 'Qua', 'Sex'], priority: 'media' },
      { title: 'Caminhada 30 minutos', description: 'Cardio leve para recuperação ativa', attribute: 'Agilidade', days: ['Ter', 'Qui'], priority: 'baixa' },
      { title: 'Dormir 8 horas', description: 'Recuperação muscular e mental', attribute: 'Vitalidade', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], priority: 'alta' },
      { title: 'Hidratação diária (2L)', description: 'Beber pelo menos 2 litros de água', attribute: 'Vitalidade', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'media' },
    ],
  },
  {
    id: 'mago',
    name: 'Mago',
    starterItem: 'Grimorio Basico',
    modernTitle: 'Estudioso / Concurseiro / Desenvolvedor',
    icon: <BookOpen className="w-8 h-8" />,
    color: 'border-blue-500/60 bg-blue-950/30',
    glow: 'shadow-blue-500/20',
    description: 'Domina o conhecimento e os segredos arcanos.',
    modernDescription:
      'Concurseiros, programadores, pesquisadores, estudantes de pós-graduação — você conquista pelo intelecto.',
    missions: [
      { title: 'Estudar 1 hora', description: 'Sessão focada de estudo sem distrações', attribute: 'Inteligência', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'alta' },
      { title: 'Revisar anotações', description: 'Revisar o que estudou para fixar o conteúdo', attribute: 'Sabedoria', days: ['Ter', 'Qui', 'Sáb'], priority: 'media' },
      { title: 'Resolver questões/exercícios', description: '30 minutos de prática com questões ou código', attribute: 'Inteligência', days: ['Seg', 'Qua', 'Sex'], priority: 'alta' },
      { title: 'Ler 20 páginas', description: 'Leitura técnica ou literária', attribute: 'Sabedoria', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'media' },
      { title: 'Praticar idioma estrangeiro', description: '15 minutos de prática no Duolingo ou similar', attribute: 'Inteligência', days: ['Seg', 'Qua', 'Sex'], priority: 'baixa' },
    ],
  },
  {
    id: 'gatuno',
    name: 'Gatuno',
    starterItem: 'Adaga de Sombra',
    modernTitle: 'Trabalhador Noturno / Freelancer',
    icon: <Moon className="w-8 h-8" />,
    color: 'border-purple-500/60 bg-purple-950/30',
    glow: 'shadow-purple-500/20',
    description: 'Astucia, furtividade e adaptação à sombra.',
    modernDescription:
      'Quem trabalha à noite, tem rotina irregular, freelancers e criativos — você domina o caos com esperteza.',
    missions: [
      { title: 'Organizar agenda da semana', description: 'Planejar compromissos e metas da semana', attribute: 'Disciplina', days: ['Dom'], priority: 'alta' },
      { title: 'Cumprir meta diária', description: 'Entregar uma tarefa ou meta do dia', attribute: 'Disciplina', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'alta' },
      { title: 'Higiene do sono', description: 'Dormir e acordar em horários consistentes', attribute: 'Vitalidade', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], priority: 'media' },
      { title: 'Revisar pendências', description: 'Checar tarefas em aberto e priorizar', attribute: 'Agilidade', days: ['Seg', 'Qua', 'Sex'], priority: 'media' },
      { title: 'Descanso intencional', description: '20 minutos de descompressão sem telas', attribute: 'Resiliência', days: ['Ter', 'Qui', 'Sáb'], priority: 'baixa' },
    ],
  },
  {
    id: 'ferreiro',
    name: 'Ferreiro',
    starterItem: 'Martelo de Aco',
    modernTitle: 'Profissional Técnico / Artesão',
    icon: <Hammer className="w-8 h-8" />,
    color: 'border-amber-500/60 bg-amber-950/30',
    glow: 'shadow-amber-500/20',
    description: 'Forja armas e armaduras com trabalho pesado.',
    modernDescription:
      'Eletricistas, encanadores, mecânicos, marceneiros — você acorda cedo e constrói com as próprias mãos.',
    missions: [
      { title: 'Acordar até às 5h30', description: 'Levantar cedo para começar o dia com vantagem', attribute: 'Disciplina', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'alta' },
      { title: 'Treino funcional 30min', description: 'Exercícios para manter o corpo em forma para o trabalho', attribute: 'Força', days: ['Seg', 'Qua', 'Sex'], priority: 'media' },
      { title: 'Manutenção/organização de ferramentas', description: 'Checar e organizar ferramentas e materiais', attribute: 'Disciplina', days: ['Sex'], priority: 'media' },
      { title: 'Hidratação no trabalho (2L)', description: 'Beber água regularmente durante trabalho físico', attribute: 'Vitalidade', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'alta' },
      { title: 'Alongamento pós-trabalho', description: 'Ao fim do dia, alongar para evitar lesões', attribute: 'Agilidade', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'media' },
    ],
  },
  {
    id: 'clerico',
    name: 'Clérigo',
    starterItem: 'Cajado de Luz',
    modernTitle: 'Religioso / Voluntário / Cuidador',
    icon: <Cross className="w-8 h-8" />,
    color: 'border-yellow-400/60 bg-yellow-950/30',
    glow: 'shadow-yellow-400/20',
    description: 'Cura aliados e guia com fé e sabedoria.',
    modernDescription:
      'Religiosos, voluntários, terapeutas, cuidadores — você serve e cuida dos outros com propósito.',
    missions: [
      { title: 'Oração ou meditação matinal', description: '10 minutos de silêncio, oração ou meditação ao acordar', attribute: 'Sabedoria', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], priority: 'alta' },
      { title: 'Leitura de texto sagrado/filosofia', description: 'Ler um trecho de livro espiritual ou filosófico', attribute: 'Sabedoria', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'media' },
      { title: 'Ato de voluntariado ou doação', description: 'Ajudar alguém ou contribuir com uma causa', attribute: 'Carisma', days: ['Sáb'], priority: 'media' },
      { title: 'Gratidão diária', description: 'Escrever 3 coisas pelas quais é grato', attribute: 'Resiliência', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], priority: 'baixa' },
      { title: 'Contato com pessoa querida', description: 'Ligar, visitar ou mandar mensagem a alguém especial', attribute: 'Carisma', days: ['Qua', 'Dom'], priority: 'media' },
    ],
  },
  {
    id: 'arqueiro',
    name: 'Arqueiro',
    starterItem: 'Arco Curto',
    modernTitle: 'Profissional de Escritório / Vendas',
    icon: <Target className="w-8 h-8" />,
    color: 'border-green-500/60 bg-green-950/30',
    glow: 'shadow-green-500/20',
    description: 'Precisão, foco e velocidade a longa distância.',
    modernDescription:
      'Vendedores, profissionais de escritório, analistas, RH — você mira no alvo certo com foco e organização.',
    missions: [
      { title: 'Organizar lista de tarefas', description: 'Listar e priorizar as tarefas do dia', attribute: 'Disciplina', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'alta' },
      { title: 'Bloco de foco de 45min', description: 'Trabalhar sem interrupções por 45 minutos (Pomodoro)', attribute: 'Inteligência', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'alta' },
      { title: 'Meta de contatos/networking', description: 'Fazer um contato profissional ou seguir com um lead', attribute: 'Carisma', days: ['Seg', 'Qua', 'Sex'], priority: 'media' },
      { title: 'Exercício rápido 20min', description: 'Caminhada, bicicleta ou exercício leve para quebrar sedentarismo', attribute: 'Agilidade', days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'], priority: 'baixa' },
      { title: 'Revisão semanal de metas', description: 'Checar progresso nas metas da semana', attribute: 'Disciplina', days: ['Sex'], priority: 'media' },
    ],
  },
];

// ─── Componente principal ───────────────────────────────────────────────────────

const REGIONS = [
  { id: 'south_america', name: 'América do Sul', icon: '🌎' },
  { id: 'north_america', name: 'América do Norte', icon: '🌎' },
  { id: 'europe', name: 'Europa', icon: '🌍' },
  { id: 'africa', name: 'África', icon: '🌍' },
  { id: 'asia', name: 'Ásia', icon: '🌏' },
];

const TOTAL_STEPS = 5; // tutorial, região, classe, missões, conclusão

export default function Onboarding() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: attributes } = useAttributes();
  const { data: profile } = useProfile();

  const [step, setStep] = useState(0);
  const [selectedClass, setSelectedClass] = useState<ClassDef | null>(null);
  const [selectedMissions, setSelectedMissions] = useState<Set<number>>(new Set([0, 1, 2]));
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const claimStarterKit = useClaimStarterKit();

  // Redireciona usuários não autenticados
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  // Se o onboarding já foi concluído (flag no banco ou localStorage), redireciona direto
  useEffect(() => {
    if (!user || !profile) return;
    const doneInDb = (profile as any).onboarding_completed === true;
    const doneInLocal = localStorage.getItem(`onboarding_v1_${user.id}`) === 'done';
    if (doneInDb || doneInLocal) {
      navigate('/', { replace: true });
    }
  }, [user, profile, navigate]);

  const attrByName = (name: string) =>
    attributes?.find((a: any) => a.name === name);

  const toggleMission = (idx: number) => {
    setSelectedMissions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectClass = (cls: ClassDef) => {
    setSelectedClass(cls);
    setSelectedMissions(new Set([0, 1, 2]));
    setStep(3);
  };

  const handleFinish = async () => {
    if (!user || !selectedClass || !attributes) return;
    setSaving(true);
    try {
      const missionsToCreate = selectedClass.missions.filter((_, i) => selectedMissions.has(i));

      for (const m of missionsToCreate) {
        const attr = attrByName(m.attribute);
        if (!attr) continue;

        await supabase.from('missions').insert({
          user_id: user.id,
          title: m.title,
          attribute_id: attr.id,
          due_date: null,
          days_of_week: m.days,
          horario_provavel: 'flex',
          priority: m.priority,
          description: m.description,
          notes: null,
          secondary_attribute_ids: [],
        } as any);
      }

      // Marca onboarding como concluído no banco de dados (ignora erro se coluna não existir)
      await supabase.from('profiles').update({
        onboarding_completed: true,
        region: selectedRegion,
        starter_class: selectedClass.id,
        starter_item: selectedClass.starterItem,
      } as any).eq('user_id', user.id).then(() => {});

      // Concede kit de novato (equipamentos simples de lv1-4)
      try {
        await claimStarterKit.mutateAsync('novato');
      } catch {
        // Kit pode já ter sido concedido — ignora erro
      }

      // Salva no localStorage (sempre funciona)
      localStorage.setItem(`starter_class_v1_${user.id}`, selectedClass.id);
      localStorage.setItem(`starter_item_v1_${user.id}`, selectedClass.starterItem);
      localStorage.setItem(`onboarding_v1_${user.id}`, 'done');

      toast({ title: t('app.onboarding.success_title'), description: t('app.onboarding.success_desc') });
      navigate('/');
    } catch (err: any) {
      toast({ title: t('app.onboarding.error_title'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'var(--gradient-dark)' }}>
      {/* Barra de progresso */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── STEP 0: Tutorial / Introdução ── */}
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl"
          >
            <div className="rpg-card-glow p-8 text-center">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/40 mb-6 mx-auto"
              >
                <Scroll className="w-10 h-10 text-primary" />
              </motion.div>

              <h1 className="text-4xl font-display font-bold text-primary text-glow mb-2">
                {t('app.onboarding.step0_title')}
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                {t('app.onboarding.step0_subtitle')}
              </p>

              <div className="grid gap-4 text-left mb-8">
                <div className="flex gap-4 items-start p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                    <Sword className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t('app.onboarding.feature1_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('app.onboarding.feature1_desc')}</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="w-10 h-10 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center shrink-0">
                    <Star className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t('app.onboarding.feature2_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('app.onboarding.feature2_desc')}</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t('app.onboarding.feature3_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('app.onboarding.feature3_desc')}</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t('app.onboarding.feature4_title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('app.onboarding.feature4_desc')}</p>
                  </div>
                </div>
              </div>

              <Button className="w-full gap-2" onClick={() => setStep(1)}>
                {t('app.onboarding.start_button')} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 1: Seleção de Região ── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl"
          >
            <div className="rpg-card-glow p-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-display font-bold text-primary text-glow">
                  {t('app.onboarding.step1_title')}
                </h2>
                <p className="text-muted-foreground mt-2">
                  {t('app.onboarding.step1_subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {REGIONS.map((region) => (
                  <motion.button
                    key={region.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedRegion(region.id);
                      setStep(2);
                    }}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                      selectedRegion === region.id
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border bg-muted/20 hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{region.icon}</span>
                      <span className="font-bold text-foreground text-lg">{region.name}</span>
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="mt-4">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> {t('app.onboarding.back_button')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: Seleção de Classe ── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl"
          >
            <div className="rpg-card-glow p-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-display font-bold text-primary text-glow">
                  {t('app.onboarding.step2_title')}
                </h2>
                <p className="text-muted-foreground mt-2">
                  {t('app.onboarding.step2_subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CLASSES.map((cls) => (
                  <motion.button
                    key={cls.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectClass(cls)}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${cls.color} shadow-lg ${cls.glow} hover:brightness-110`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-foreground">{cls.icon}</div>
                      <div>
                        <div className="font-bold text-foreground text-lg leading-none">{cls.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{cls.modernTitle}</div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{cls.modernDescription}</p>
                    <p className="text-xs text-primary mt-2">{t('app.onboarding.starter_item')}: {cls.starterItem}</p>
                  </motion.button>
                ))}
              </div>

              <div className="mt-4">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> {t('app.onboarding.back_button')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP 3: Selecionar Missões ── */}
        {step === 3 && selectedClass && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl"
          >
            <div className="rpg-card-glow p-6">
              <div className="text-center mb-6">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 mb-4 ${selectedClass.color}`}>
                  {selectedClass.icon}
                  <span className="font-bold text-lg">{selectedClass.name}</span>
                </div>
                <h2 className="text-2xl font-display font-bold text-primary text-glow">
                  {t('app.onboarding.step3_title')}
                </h2>
                <p className="text-muted-foreground mt-2">
                  {t('app.onboarding.step3_subtitle')}
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {selectedClass.missions.map((m, i) => {
                  const attr = attrByName(m.attribute);
                  const checked = selectedMissions.has(i);
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      onClick={() => toggleMission(i)}
                      className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                        checked
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border bg-muted/20 opacity-60 hover:opacity-80'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleMission(i)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">{m.title}</div>
                        <div className="text-sm text-muted-foreground">{m.description}</div>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/20">
                            {m.attribute}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {m.days.join(', ')}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            m.priority === 'alta'
                              ? 'text-red-400 border-red-400/30 bg-red-400/10'
                              : m.priority === 'media'
                              ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
                              : 'text-green-400 border-green-400/30 bg-green-400/10'
                          }`}>
                            {m.priority === 'alta' ? '🔥 Alta' : m.priority === 'media' ? '🛡️ Média' : '🍺 Baixa'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-center mb-4">
                {selectedMissions.size} {t('app.onboarding.missions_selected')}.
              </p>

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> {t('app.onboarding.back_button')}
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => setStep(4)}
                >
                  {t('app.onboarding.continue_button')} <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP 4: Confirmação / Conclusão ── */}
        {step === 4 && selectedClass && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl"
          >
            <div className="rpg-card-glow p-8 text-center">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                className="text-6xl mb-6 inline-block"
              >
                🎉
              </motion.div>

              <h2 className="text-3xl font-display font-bold text-primary text-glow mb-2">
                {t('app.onboarding.step4_title')}
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                {t('app.onboarding.step4_subtitle', { class: selectedClass.name })}
              </p>

              <div className="text-sm text-primary mb-4">
                {t('app.onboarding.starter_equipment')}: <span className="font-bold">{selectedClass.starterItem}</span>
              </div>

              <div className="text-left bg-muted/20 rounded-xl border border-border p-4 mb-6">
                <p className="text-sm font-semibold text-foreground mb-3">
                  {selectedMissions.size} {t('app.onboarding.missions_will_be_created')}:
                </p>
                <ul className="space-y-2">
                  {selectedClass.missions
                    .filter((_, i) => selectedMissions.has(i))
                    .map((m, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                        {m.title}
                      </li>
                    ))}
                </ul>
              </div>

              <div className="text-xs text-muted-foreground mb-6 bg-primary/5 border border-primary/20 rounded-lg p-3">
                💡 <strong>{t('app.onboarding.tip_label')}:</strong> {t('app.onboarding.tip_text')}
              </div>

              <Button
                className="w-full gap-2 h-12 text-base"
                onClick={handleFinish}
                disabled={saving}
              >
                {saving ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {t('app.onboarding.saving_button')}</>
                ) : (
                  <>{t('app.onboarding.finish_button')} <Zap className="w-5 h-5" /></>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
