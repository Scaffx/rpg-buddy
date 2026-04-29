import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
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
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { useLocalizedPricing } from "@/hooks/useLocalizedPricing";
import { APP_VERSION, APP_VERSION_LABEL, IS_BETA } from "@/lib/version";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function Landing() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { latest } = useAppUpdate();
  const { monthlyFormatted, annualFormatted, monthlyUsd, loading: pricingLoading } = useLocalizedPricing();
  const apkUrl = latest?.apk_url && latest.apk_url !== "#" ? latest.apk_url : null;
  const latestVersion = latest?.version ?? APP_VERSION;
  const downloadLabel = IS_BETA ? `v${latestVersion} BETA` : `v${latestVersion}`;
  const isNative = Capacitor.isNativePlatform();

  const handleApkDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!apkUrl) return;
    if (isNative) {
      // No APK nativo, use Browser.open()
      await Browser.open({ url: apkUrl });
    } else {
      // Na web, permite download normal
      window.open(apkUrl, "_blank", "noopener,noreferrer");
    }
  };

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

          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/auth")}
              className="hover:text-primary"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">{t("nav.login")}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/auth?mode=signup")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)]"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">{t("nav.signup")}</span>
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
            <Sparkles className="w-3.5 h-3.5" /> {t("hero.badge")}
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.05] font-[var(--font-display)]"
          >
            {t("hero.title_part1")} <span className="text-primary">{t("hero.title_highlight")}</span>.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            {t("hero.subtitle_main")} <strong className="text-foreground">{t("hero.subtitle_strong")}</strong>
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => navigate("/auth?mode=signup")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)] h-12 px-7"
            >
              <UserPlus className="w-4 h-4" />
              {t("hero.cta_signup")}
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="border-primary/30 hover:border-primary h-12 px-7"
            >
              <LogIn className="w-4 h-4" />
              {t("hero.cta_login")}
            </Button>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-success" /> {t("hero.perk_trial")}</span>
            <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-accent" /> {t("hero.perk_apk")}</span>
            <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-primary" /> {t("hero.perk_bosses")}</span>
          </motion.div>
        </motion.div>
      </section>

      {/* ============== O QUE É O APP ============== */}
      <section className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow={t("what.eyebrow")}
          title={t("what.title")}
          subtitle={t("what.subtitle")}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          <FeatureCard icon={<Sparkles className="w-6 h-6" />} title={t("what.cards.attrs_title")} text={t("what.cards.attrs_text")} color="primary" />
          <FeatureCard icon={<Calendar className="w-6 h-6" />} title={t("what.cards.missions_title")} text={t("what.cards.missions_text")} color="accent" />
          <FeatureCard icon={<Crown className="w-6 h-6" />} title={t("what.cards.bosses_title")} text={t("what.cards.bosses_text")} color="primary" />
          <FeatureCard icon={<Flame className="w-6 h-6" />} title={t("what.cards.streak_title")} text={t("what.cards.streak_text")} color="destructive" />
          <FeatureCard icon={<Heart className="w-6 h-6" />} title={t("what.cards.hp_title")} text={t("what.cards.hp_text")} color="accent" />
          <FeatureCard icon={<Trophy className="w-6 h-6" />} title={t("what.cards.rank_title")} text={t("what.cards.rank_text")} color="primary" />
        </div>
      </section>

      {/* ============== POR QUE É DIFERENTE ============== */}
      <section className="py-20 px-4 md:px-8 bg-gradient-to-b from-transparent via-accent/5 to-transparent">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            eyebrow={t("diff.eyebrow")}
            title={t("diff.title")}
            subtitle={t("diff.subtitle")}
          />

          <div className="grid md:grid-cols-2 gap-6 mt-12">
            <DiffRow icon={<Target className="w-5 h-5" />} title={t("diff.rows.punish_title")} text={t("diff.rows.punish_text")} />
            <DiffRow icon={<Zap className="w-5 h-5" />} title={t("diff.rows.gold_title")} text={t("diff.rows.gold_text")} />
            <DiffRow icon={<Brain className="w-5 h-5" />} title={t("diff.rows.attrs_title")} text={t("diff.rows.attrs_text")} />
            <DiffRow icon={<Bell className="w-5 h-5" />} title={t("diff.rows.talk_title")} text={t("diff.rows.talk_text")} />
            <DiffRow icon={<Crown className="w-5 h-5" />} title={t("diff.rows.class_title")} text={t("diff.rows.class_text")} />
            <DiffRow icon={<Users className="w-5 h-5" />} title={t("diff.rows.focus_title")} text={t("diff.rows.focus_text")} />
          </div>
        </div>
      </section>

      {/* ============== SEGURANÇA ============== */}
      <section className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow={t("security.eyebrow")}
          title={t("security.title")}
          subtitle={t("security.subtitle")}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          <SecurityCard icon={<Lock className="w-6 h-6" />} title={t("security.cards.tls_title")} text={t("security.cards.tls_text")} />
          <SecurityCard icon={<ShieldCheck className="w-6 h-6" />} title={t("security.cards.rls_title")} text={t("security.cards.rls_text")} />
          <SecurityCard icon={<Eye className="w-6 h-6" />} title={t("security.cards.track_title")} text={t("security.cards.track_text")} />
          <SecurityCard icon={<Database className="w-6 h-6" />} title={t("security.cards.backup_title")} text={t("security.cards.backup_text")} />
        </div>
      </section>

      {/* ============== ROADMAP ============== */}
      <section className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow={t("roadmap.eyebrow")}
          title={t("roadmap.title")}
          subtitle={t("roadmap.subtitle")}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          <RoadmapCard icon={<Brain className="w-7 h-7" />} title={t("roadmap.cards.ai_title")} text={t("roadmap.cards.ai_text")} tag={t("roadmap.tag")} />
          <RoadmapCard icon={<Skull className="w-7 h-7" />} title={t("roadmap.cards.habit_title")} text={t("roadmap.cards.habit_text")} tag={t("roadmap.tag")} />
          <RoadmapCard icon={<Users className="w-7 h-7" />} title={t("roadmap.cards.party_title")} text={t("roadmap.cards.party_text")} tag={t("roadmap.tag")} />
          <RoadmapCard icon={<Package className="w-7 h-7" />} title={t("roadmap.cards.loot_title")} text={t("roadmap.cards.loot_text")} tag={t("roadmap.tag")} />
        </div>
      </section>

      {/* ============== PRICING (público) ============== */}
      <section id="pricing" className="py-20 px-4 md:px-8 max-w-6xl mx-auto">
        <SectionHeader
          eyebrow={t("pricing.eyebrow")}
          title={t("pricing.title")}
          subtitle={t("pricing.subtitle")}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mt-12 max-w-2xl mx-auto"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="relative rounded-2xl border-2 border-primary/40 bg-card/70 backdrop-blur-sm p-5 shadow-[var(--glow-gold)] flex flex-col">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-black tracking-wider px-3 py-0.5 whitespace-nowrap">
                {t("pricing.monthly.badge").toUpperCase()}
              </Badge>

              <h3 className="font-[var(--font-display)] text-xl font-bold text-center mt-1 mb-1">
                {t("pricing.monthly.name")}
              </h3>

              <div className="flex items-baseline justify-center gap-1 mt-2 mb-1">
                <span className="text-4xl font-black text-primary font-[var(--font-display)]">
                  {pricingLoading ? "..." : monthlyFormatted}
                </span>
                <span className="text-sm text-muted-foreground">{t("pricing.monthly.price_period")}</span>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-3">
                {t("pricing.monthly.desc")} • Base: USD {monthlyUsd.toFixed(2)}
              </p>

              <ul className="space-y-2 mb-4 flex-1">
                {(["f1", "f2", "f3", "f4", "f5"] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2 text-xs">
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span>{t(`pricing.features.${key}`)}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="sm"
                onClick={() => navigate("/auth?mode=signup")}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                <UserPlus className="w-3 h-3" />
                {t("pricing.monthly.cta")}
              </Button>
            </div>

            <div className="relative rounded-2xl border-2 border-accent/40 bg-card/70 backdrop-blur-sm p-5 shadow-[0_0_40px_rgba(255,184,108,0.18)] flex flex-col">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground font-black tracking-wider px-3 py-0.5 whitespace-nowrap">
                {t("pricing.annual.badge").toUpperCase()}
              </Badge>

              <h3 className="font-[var(--font-display)] text-xl font-bold text-center mt-1 mb-1">
                {t("pricing.annual.name")}
              </h3>

              <div className="flex items-baseline justify-center gap-1 mt-2 mb-1">
                <span className="text-4xl font-black text-primary font-[var(--font-display)]">
                  {pricingLoading ? "..." : annualFormatted}
                </span>
                <span className="text-sm text-muted-foreground">{t("pricing.annual.price_period")}</span>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-1">{t("pricing.annual.desc")}</p>
              <p className="text-xs text-accent text-center font-semibold mb-3">{t("pricing.annual.bonus")}</p>

              <ul className="space-y-2 mb-4 flex-1">
                {(["f1", "f2", "f3", "f4", "f5"] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2 text-xs">
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span>{t(`pricing.features.${key}`)}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2 text-xs">
                  <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <span>{t("pricing.features.f6")}</span>
                </li>
              </ul>

              <Button
                size="sm"
                onClick={() => navigate("/auth?mode=signup")}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
              >
                <UserPlus className="w-3 h-3" />
                {t("pricing.annual.cta")}
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-4 leading-relaxed">
            {t("pricing.mor_note")}
          </p>
        </motion.div>
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
                  {t("download.beta_badge")}
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
              {t("download.title_part1")} <span className="text-primary">{t("download.title_highlight")}</span>.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              {t("download.subtitle")}
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              {apkUrl ? (
                <Button
                  size="lg"
                  onClick={handleApkDownload}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[var(--glow-gold)] h-14 px-8 text-base"
                >
                  <Download className="w-5 h-5" />
                  {t("download.cta_download")} · {downloadLabel}
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled
                  className="bg-primary/40 text-primary-foreground font-bold h-14 px-8 text-base"
                >
                  <Download className="w-5 h-5" />
                  {t("download.cta_preparing")} · {downloadLabel}
                </Button>
              )}

              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/30 hover:border-primary h-14 px-8 text-base"
              >
                <Link to="/auth?mode=signup">{t("download.cta_browser")}</Link>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              {IS_BETA ? t("download.footnote_beta") : ""}{t("download.footnote")}
            </p>
          </div>
        </div>
      </section>

      {/* ============== FOOTER ============== */}
      <footer className="border-t border-border/40 py-10 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-primary" />
              <span>LifeOnRPG · {t("footer.tagline")}</span>
              {IS_BETA && (
                <Badge className="ml-1 h-4 px-1.5 text-[9px] bg-accent/20 text-accent border border-accent/40 hover:bg-accent/20">
                  BETA
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/auth" className="hover:text-primary">{t("nav.login")}</Link>
              <Link to="/auth?mode=signup" className="hover:text-primary">{t("nav.signup")}</Link>
              <a href="#pricing" className="hover:text-primary">{t("pricing.eyebrow")}</a>
              <a href="#download" className="hover:text-primary">APK</a>
            </div>
          </div>

          <div className="border-t border-border/30 pt-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-muted-foreground/80">
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/terms" className="hover:text-primary underline-offset-4 hover:underline">
                {t("footer.legal_terms")}
              </Link>
              <Link to="/privacy" className="hover:text-primary underline-offset-4 hover:underline">
                {t("footer.legal_privacy")}
              </Link>
              <Link to="/refund" className="hover:text-primary underline-offset-4 hover:underline">
                {t("footer.legal_refund")}
              </Link>
            </div>
            <div className="text-center md:text-right">
              © {new Date().getFullYear()} Murillo Gabrie Scaff · Powered by Paddle
            </div>
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
