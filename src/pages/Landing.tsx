import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Swords,
  Sparkles,
  Crown,
  Brain,
  Skull,
  Users,
  Package,
  Calendar,
  Flame,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  Trophy,
  Bell,
  Lock,
  Eye,
  Database,
  Heart,
  Target,
  Zap,
  Download,
  LogIn,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { APP_VERSION, APP_VERSION_LABEL, IS_BETA } from "@/lib/version";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function Landing() {
  const navigate = useNavigate();
  const { latest } = useAppUpdate();
  const apkUrl = latest?.apk_url && latest.apk_url !== "#" ? latest.apk_url : null;
  const latestVersion = latest?.version ?? APP_VERSION;
  const downloadLabel = IS_BETA ? `v${latestVersion} BETA` : `v${latestVersion}`;

  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-x-hidden">
      {/* ============== TOP NAV ============== */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Swords className="w-6 h-6 text-primary" />
            <span className="font-[var(--font-display)] text-base md:text-lg font-bold tracking-wider">
              LIFE<span className="text-primary">on</span>RPG
            </span>
            {IS_BETA && (
              <Badge className="ml-1 h-5 px-2 text-[10px] font-black tracking-wider bg-accent/20 text-accent border border-accent/40 hover:bg-accent/20">
                BETA
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/auth")}
              className="hover:text-primary"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Logar / Log In</span>
              <span className="sm:hidden">Login</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/auth?mode=signup")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)]"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Cadastrar / Sign Up</span>
              <span className="sm:hidden">Cadastrar</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ============== HERO ============== */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(43_96%_56%/0.15),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_hsl(270_60%_55%/0.18),_transparent_55%)]" />
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-primary/10 select-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0], y: [0, -40, 0] }}
              transition={{ duration: 6 + (i % 5), repeat: Infinity, delay: i * 0.3 }}
              style={{
                left: `${(i * 53) % 100}%`,
                top: `${(i * 37) % 100}%`,
                fontSize: `${12 + (i % 4) * 6}px`,
              }}
            >
              ✦
            </motion.div>
          ))}
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-5xl mx-auto px-4 md:px-8 pt-16 md:pt-24 pb-20 text-center"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold mb-6"
          >
            <Sparkles className="w-3.5 h-3.5" /> Sua vida virou um RPG · Acesso Beta aberto
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.05] font-[var(--font-display)]"
          >
            Transforme cada hábito em <span className="text-primary">XP real</span>.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Beba água, treine, estude, durma cedo, e veja seu personagem evoluir,
            dropar loot e enfrentar bosses. <strong className="text-foreground">Disciplina virou aventura.</strong>
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => navigate("/auth?mode=signup")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)] h-12 px-7"
            >
              <UserPlus className="w-4 h-4" />
              Cadastrar / Sign Up
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="border-primary/30 hover:border-primary h-12 px-7"
            >
              <LogIn className="w-4 h-4" />
              Logar / Log In
            </Button>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-success" /> 7 dias grátis</span>
            <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-accent" /> APK Android disponível</span>
            <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-primary" /> 60 bosses</span>
          </motion.div>
        </motion.div>
      </section>

      {/* ============== O QUE É O APP ============== */}
      <section className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="O que é o LifeOnRPG"
          title="O primeiro RPG cuja história é a sua vida."
          subtitle="Não é um app de tarefas com pontinhos. É um sistema completo de progressão pessoal, atributos, classes, missões, bosses, loot e ranking. Tudo movido pelo que você faz no mundo real."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          <FeatureCard
            icon={<Sparkles className="w-6 h-6" />}
            title="11 atributos vivos"
            text="Força, Mente, Carisma, Disciplina e mais. Cada missão alimenta os atributos certos, você vê onde está forte e onde precisa treinar."
            color="primary"
          />
          <FeatureCard
            icon={<Calendar className="w-6 h-6" />}
            title="Missões diárias reais"
            text="Configure hábitos por dia da semana. Falhou ontem? O sistema marca e cobra XP automaticamente. Nada escapa."
            color="accent"
          />
          <FeatureCard
            icon={<Crown className="w-6 h-6" />}
            title="60 bosses temáticos"
            text="Do Nível 1 ao 60. Cada chefe consome 'Chaves de Boss' que você ganha cumprindo missões. Disciplina vira poder de combate."
            color="primary"
          />
          <FeatureCard
            icon={<Flame className="w-6 h-6" />}
            title="Don't Break the Chain"
            text="Calendário de chamas: cada dia com 60%+ de missões cumpridas vira streak. Quebrar dói, manter vicia."
            color="destructive"
          />
          <FeatureCard
            icon={<Heart className="w-6 h-6" />}
            title="HP, MP, Fadiga e Fome"
            text="Seu personagem reflete sua saúde. Beba água, coma direito, durma. O herói desmaia se você se descuidar."
            color="accent"
          />
          <FeatureCard
            icon={<Trophy className="w-6 h-6" />}
            title="Ranking mundial"
            text="Compare seu Power Level com aventureiros do Brasil e do mundo. Suba de posição cumprindo o que prometeu."
            color="primary"
          />
        </div>
      </section>

      {/* ============== POR QUE É DIFERENTE ============== */}
      <section className="py-20 px-4 md:px-8 bg-gradient-to-b from-transparent via-accent/5 to-transparent">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            eyebrow="Por que somos diferentes"
            title="A maioria dos apps de hábito te recompensa por marcar caixinhas. O LifeOnRPG te cobra."
            subtitle="A diferença está nas consequências. Aqui, ignorar a missão dói no personagem, e isso muda tudo."
          />

          <div className="grid md:grid-cols-2 gap-6 mt-12">
            <DiffRow
              icon={<Target className="w-5 h-5" />}
              title="Punição retroativa"
              text="Esqueceu de marcar 'beber água' ontem? O sistema desconta XP automaticamente. Sem desculpa, sem editar a história."
            />
            <DiffRow
              icon={<Zap className="w-5 h-5" />}
              title="Economia de Ouro real"
              text="Boss derrotado dá Ouro. Ouro compra buffs temporários na Loja do Tempo. Recompensa não é cosmética, afeta seu próximo dia."
            />
            <DiffRow
              icon={<Brain className="w-5 h-5" />}
              title="Atributos que importam"
              text="Cada missão vincula a 1 atributo principal e até 2 secundários. Você cresce de forma equilibrada, ou aprende onde está negligente."
            />
            <DiffRow
              icon={<Bell className="w-5 h-5" />}
              title="O herói fala com você"
              text="Notificações contextuais: 'Você não bebeu água há 4h', 'Streak em risco esta noite', 'Boss desbloqueado'. Não é spam, é o personagem te chamando."
            />
            <DiffRow
              icon={<Crown className="w-5 h-5" />}
              title="Classes que evoluem"
              text="55 classes em 6 tiers. Sua próxima classe depende do que você priorizou. Guerreiro vira Paladino só se você cuidou da Mente também."
            />
            <DiffRow
              icon={<Users className="w-5 h-5" />}
              title="Sem conteúdo infinito"
              text="Não tem feed pra rolar, não tem notificação social. O app abre, você cumpre suas missões, e fecha. Foco no que importa."
            />
          </div>
        </div>
      </section>

      {/* ============== SEGURANÇA ============== */}
      <section className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Segurança & Privacidade"
          title="Seus dados são seus. Ponto."
          subtitle="O LifeOnRPG é construído sobre a mesma infraestrutura usada por bancos e fintechs, e nada do que você registra fica acessível a terceiros."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          <SecurityCard
            icon={<Lock className="w-6 h-6" />}
            title="Criptografia ponta-a-ponta no transporte"
            text="Toda comunicação entre o app e o servidor usa HTTPS/TLS 1.3."
          />
          <SecurityCard
            icon={<ShieldCheck className="w-6 h-6" />}
            title="Row Level Security"
            text="Cada usuário só vê seus próprios dados. Garantido por políticas no banco, não dá pra burlar pelo cliente."
          />
          <SecurityCard
            icon={<Eye className="w-6 h-6" />}
            title="Zero rastreamento de comportamento"
            text="Sem pixels de Facebook, sem analytics invasivo. Só métricas anônimas de erro pra manter o app estável."
          />
          <SecurityCard
            icon={<Database className="w-6 h-6" />}
            title="Backups diários"
            text="Seu progresso é replicado e versionado. Nada se perde, nem por bug nosso, nem por troca de celular."
          />
        </div>
      </section>

      {/* ============== ROADMAP ============== */}
      <section className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Em desenvolvimento"
          title="O reino está expandindo."
          subtitle="Você está no acesso Beta, tudo que vier depois entra automaticamente na sua conta."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          <RoadmapCard icon={<Brain className="w-7 h-7" />} title="IA Mentor" text="Conselheiro inteligente analisa seus hábitos e sugere quests personalizadas." tag="EM BREVE" />
          <RoadmapCard icon={<Skull className="w-7 h-7" />} title="Bosses de Hábitos" text="Vícios viram chefões. Derrote o 'Lord Procrastinação' com missões consistentes." tag="EM BREVE" />
          <RoadmapCard icon={<Users className="w-7 h-7" />} title="Dungeons em Party" text="Forme grupo com amigos. Todos precisam cumprir pra avançar." tag="EM BREVE" />
          <RoadmapCard icon={<Package className="w-7 h-7" />} title="Itens Lendários" text="Sistema expandido de loot, crafting e armas com bônus reais aos atributos." tag="EM BREVE" />
        </div>
      </section>

      {/* ============== DOWNLOAD APK ============== */}
      <section id="download" className="py-24 px-4 md:px-8">
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/30 rounded-3xl blur-2xl" />
          <div className="relative rounded-3xl border border-primary/30 bg-card/60 backdrop-blur-xl p-8 md:p-14 text-center">
            <div className="flex justify-center mb-4 gap-2">
              <Badge variant="outline" className="border-primary/40 text-primary font-mono">
                {APP_VERSION_LABEL}
              </Badge>
              {IS_BETA && (
                <Badge className="bg-accent/20 text-accent border border-accent/40 hover:bg-accent/20 font-black tracking-wider">
                  ACESSO BETA
                </Badge>
              )}
            </div>

            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", duration: 0.6 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 border border-primary/40 mb-6"
            >
              <Smartphone className="w-8 h-8 text-primary" />
            </motion.div>

            <h2 className="text-3xl md:text-5xl font-black font-[var(--font-display)] mb-4">
              Leve a aventura no <span className="text-primary">bolso</span>.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Instale o APK Android e receba notificações em tempo real do seu herói. Funciona offline,
              sincroniza ao reconectar.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              {apkUrl ? (
                <Button
                  asChild
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)] h-14 px-8 text-base"
                >
                  <a href={apkUrl} download target="_blank" rel="noopener noreferrer">
                    <Download className="w-5 h-5" />
                    Baixar APK · {downloadLabel}
                  </a>
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled
                  className="bg-primary/40 text-primary-foreground font-bold h-14 px-8 text-base"
                >
                  <Download className="w-5 h-5" />
                  APK em preparação · {downloadLabel}
                </Button>
              )}

              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/30 hover:border-primary h-14 px-8 text-base"
              >
                <Link to="/auth?mode=signup">Usar no navegador</Link>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              {IS_BETA ? "Build Beta · " : ""}Android 8.0+ · Atualizações automáticas dentro do app
            </p>
          </div>
        </div>
      </section>

      {/* ============== FOOTER ============== */}
      <footer className="border-t border-border/40 py-8 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" />
            <span>LifeOnRPG · Sua vida, sua jornada.</span>
            {IS_BETA && (
              <Badge className="ml-1 h-4 px-1.5 text-[9px] bg-accent/20 text-accent border border-accent/40 hover:bg-accent/20">
                BETA
              </Badge>
            )}
          </div>
          <div className="flex gap-4">
            <Link to="/auth" className="hover:text-primary">Logar / Log In</Link>
            <Link to="/auth?mode=signup" className="hover:text-primary">Cadastrar / Sign Up</Link>
            <a href="#download" className="hover:text-primary">APK</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ===================== Sub-components ===================== */

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="text-center max-w-3xl mx-auto"
    >
      <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">{eyebrow}</span>
      <h2 className="mt-3 text-3xl md:text-5xl font-black font-[var(--font-display)] leading-tight">
        {title}
      </h2>
      <p className="mt-4 text-muted-foreground">{subtitle}</p>
    </motion.div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  color: "primary" | "accent" | "destructive";
}) {
  const colorMap = {
    primary: "text-primary border-primary/20 bg-primary/5",
    accent: "text-accent border-accent/20 bg-accent/5",
    destructive: "text-destructive border-destructive/20 bg-destructive/5",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -4 }}
      className="group rounded-xl border border-border bg-card/50 backdrop-blur-sm p-6 hover:border-primary/40 transition-all"
    >
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg border ${colorMap[color]} mb-4`}>
        {icon}
      </div>
      <h3 className="font-[var(--font-display)] text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </motion.div>
  );
}

function DiffRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className="flex gap-4 rounded-xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
    >
      <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 text-primary border border-primary/30">
        {icon}
      </div>
      <div>
        <h3 className="font-[var(--font-display)] text-base font-bold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}

function SecurityCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-success/20 bg-success/5 p-5"
    >
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-success/15 text-success border border-success/30 mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </motion.div>
  );
}

function RoadmapCard({ icon, title, text, tag }: { icon: React.ReactNode; title: string; text: string; tag: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -6 }}
      className="relative rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-card/60 p-6 overflow-hidden"
    >
      <div className="absolute top-3 right-3 text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/40">
        {tag}
      </div>
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/15 text-accent border border-accent/30 mb-4">
        {icon}
      </div>
      <h3 className="font-[var(--font-display)] text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </motion.div>
  );
}
