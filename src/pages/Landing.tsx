import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Swords,
  Sparkles,
  Crown,
  Users,
  Brain,
  Skull,
  Package,
  Calendar,
  Flame,
  ShieldCheck,
  Smartphone,
  Loader2,
  ArrowRight,
  ScrollText,
  Trophy,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const APK_DOWNLOAD_URL = '#'; // TODO: substituir pelo link real do APK

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

export default function Landing() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        toast({ title: 'Bem-vindo de volta, herói!' });
        navigate('/');
      } else {
        await signUp(email, password, displayName || undefined);
        toast({
          title: 'Conta criada!',
          description: 'Confirme seu e-mail para começar sua jornada.',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Não foi possível concluir.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-x-hidden">
      {/* ========= HERO ========= */}
      <section className="relative min-h-screen flex flex-col">
        {/* Animated background */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(43_96%_56%/0.15),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_hsl(270_60%_55%/0.18),_transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,hsl(var(--background)))]" />
          {/* Floating glyphs */}
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-primary/10"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 0.6, 0],
                y: [0, -40, 0],
              }}
              transition={{
                duration: 6 + (i % 5),
                repeat: Infinity,
                delay: i * 0.3,
              }}
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

        {/* Top nav */}
        <header className="w-full px-4 md:px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2 font-[var(--font-display)]">
            <Swords className="w-6 h-6 text-primary" />
            <span className="text-lg md:text-xl font-bold tracking-wider">
              LIFE<span className="text-primary">on</span>RPG
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#download"
              className="hidden sm:inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Smartphone className="w-4 h-4" /> APK
            </a>
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Entrar
            </Link>
          </div>
        </header>

        {/* Hero content */}
        <div className="flex-1 grid lg:grid-cols-2 gap-10 items-center px-4 md:px-10 pb-16 max-w-7xl mx-auto w-full">
          {/* Left: pitch */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="space-y-6"
          >
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" /> Sua vida virou um RPG
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.05] font-[var(--font-display)]"
            >
              Transforme cada hábito em <span className="text-primary">XP real</span>.
            </motion.h1>

            <motion.p variants={fadeUp} className="text-base md:text-lg text-muted-foreground max-w-xl">
              Beba água, treine, estude, durma cedo — e veja seu personagem subir de nível, dropar
              loot e enfrentar bosses. <strong className="text-foreground">Disciplina virou aventura.</strong>
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 pt-2">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)]"
                onClick={() => {
                  document.getElementById('login-form')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Começar agora
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary/30 hover:border-primary"
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Ver como funciona
              </Button>
            </motion.div>

            <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-success" /> 7 dias grátis</span>
              <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-accent" /> APK Android disponível</span>
              <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-primary" /> 60 bosses</span>
            </motion.div>
          </motion.div>

          {/* Right: glassmorphism login */}
          <motion.div
            id="login-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/40 via-accent/30 to-primary/40 rounded-2xl blur-xl opacity-60" />
            <div className="relative rounded-2xl border border-primary/20 bg-card/40 backdrop-blur-xl p-6 md:p-8 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <ScrollText className="w-5 h-5 text-primary" />
                <h2 className="font-[var(--font-display)] text-xl font-bold">
                  {mode === 'signin' ? 'Entrar na Aventura' : 'Forjar seu Herói'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="display_name">Nome do Herói</Label>
                    <Input
                      id="display_name"
                      placeholder="Aragorn..."
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="bg-background/50 border-primary/20"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="voce@reino.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50 border-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background/50 border-primary/20"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)]"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === 'signin' ? (
                    'Entrar'
                  ) : (
                    'Criar Conta'
                  )}
                </Button>
              </form>

              <div className="mt-4 text-center text-sm text-muted-foreground">
                {mode === 'signin' ? (
                  <>
                    Novo aventureiro?{' '}
                    <button
                      type="button"
                      className="text-primary hover:underline font-semibold"
                      onClick={() => setMode('signup')}
                    >
                      Criar conta
                    </button>
                  </>
                ) : (
                  <>
                    Já tem conta?{' '}
                    <button
                      type="button"
                      className="text-primary hover:underline font-semibold"
                      onClick={() => setMode('signin')}
                    >
                      Entrar
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-muted-foreground text-xs flex flex-col items-center gap-1"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <span>Role para ver mais</span>
          <ArrowRight className="w-3 h-3 rotate-90" />
        </motion.div>
      </section>

      {/* ========= FEATURES ATUAIS ========= */}
      <section id="features" className="py-24 px-4 md:px-10 max-w-7xl mx-auto">
        <SectionHeader
          eyebrow="O que já está no jogo"
          title="Você não está jogando — está vivendo."
          subtitle="Cada decisão real do seu dia gera consequências dentro do app."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          <FeatureCard
            icon={<Sparkles className="w-6 h-6" />}
            title="Sistema de XP & Atributos"
            text="11 atributos de RPG (Força, Mente, Carisma...) sobem com missões reais. Suba de nível, evolua sua classe."
            color="primary"
          />
          <FeatureCard
            icon={<Calendar className="w-6 h-6" />}
            title="Missões Diárias"
            text="Configure hábitos por dia da semana. Falhou? Marca como 'Ontem' e perde XP automaticamente."
            color="accent"
          />
          <FeatureCard
            icon={<Crown className="w-6 h-6" />}
            title="Boss Arena"
            text="60 chefes temáticos, do Nível 1 ao 60. Use Chaves de Boss conquistadas com disciplina."
            color="primary"
          />
          <FeatureCard
            icon={<Flame className="w-6 h-6" />}
            title="Don't Break the Chain"
            text="Calendário marca falhas com chamas. Streak de dias com 60% das missões cumpridas."
            color="destructive"
          />
          <FeatureCard
            icon={<Bell className="w-6 h-6" />}
            title="Notificações Contextuais"
            text="O herói avisa: sede, fome, sono, streak em risco — baseado no que está acontecendo de verdade."
            color="accent"
          />
          <FeatureCard
            icon={<Trophy className="w-6 h-6" />}
            title="Ranking Mundial & Regional"
            text="Compare seu Power Level com aventureiros do Brasil e do mundo."
            color="primary"
          />
        </div>
      </section>

      {/* ========= ROADMAP ========= */}
      <section className="py-24 px-4 md:px-10 max-w-7xl mx-auto bg-gradient-to-b from-transparent via-accent/5 to-transparent">
        <SectionHeader
          eyebrow="Em desenvolvimento"
          title="O reino está expandindo."
          subtitle="Recursos planejados para as próximas atualizações — você terá acesso a tudo."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          <RoadmapCard
            icon={<Brain className="w-7 h-7" />}
            title="IA Mentor"
            text="Um conselheiro inteligente analisa seus hábitos e sugere quests personalizadas."
            tag="EM BREVE"
          />
          <RoadmapCard
            icon={<Skull className="w-7 h-7" />}
            title="Bosses de Hábitos"
            text="Vícios viram chefões. Derrote o 'Lord Procrastinação' com missões consistentes."
            tag="EM BREVE"
          />
          <RoadmapCard
            icon={<Users className="w-7 h-7" />}
            title="Dungeons Compartilhadas"
            text="Forme um party com amigos e enfrente desafios coletivos — todos precisam cumprir."
            tag="EM BREVE"
          />
          <RoadmapCard
            icon={<Package className="w-7 h-7" />}
            title="Itens Lendários"
            text="Sistema expandido de loot, crafting e armas com bônus reais aos atributos."
            tag="EM BREVE"
          />
        </div>
      </section>

      {/* ========= DOWNLOAD APK ========= */}
      <section id="download" className="py-24 px-4 md:px-10">
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/30 rounded-3xl blur-2xl" />
          <div className="relative rounded-3xl border border-primary/30 bg-card/60 backdrop-blur-xl p-8 md:p-14 text-center">
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', duration: 0.6 }}
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
              <Button
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)] h-14 px-8 text-base"
              >
                <a href={APK_DOWNLOAD_URL}>
                  {/* Android logo (inline SVG) */}
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                    <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
                  </svg>
                  Baixar APK Android
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/30 hover:border-primary h-14 px-8 text-base"
              >
                <a href="#login-form">Usar no navegador</a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              Versão beta · Android 8.0+ · Atualizações automáticas
            </p>
          </div>
        </div>
      </section>

      {/* ========= FOOTER ========= */}
      <footer className="border-t border-border/40 py-8 px-4 md:px-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" />
            <span>LifeOnRPG · Sua vida, sua jornada.</span>
          </div>
          <div className="flex gap-4">
            <Link to="/auth" className="hover:text-primary">Login</Link>
            <a href="#download" className="hover:text-primary">APK</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ===================== Sub-components ===================== */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className="text-center max-w-2xl mx-auto"
    >
      <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">
        {eyebrow}
      </span>
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
  color: 'primary' | 'accent' | 'destructive';
}) {
  const colorMap = {
    primary: 'text-primary border-primary/20 bg-primary/5',
    accent: 'text-accent border-accent/20 bg-accent/5',
    destructive: 'text-destructive border-destructive/20 bg-destructive/5',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
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

function RoadmapCard({
  icon,
  title,
  text,
  tag,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  tag: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -6, rotate: -0.5 }}
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
