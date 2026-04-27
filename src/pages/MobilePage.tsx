import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Smartphone, Download, CheckCircle2, ShieldCheck, Wifi, Bell, Github, Apple, Play, ChevronRight, Package, Zap, Sparkles, RefreshCw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { APP_VERSION, APP_VERSION_LABEL, IS_BETA } from "@/lib/version";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { SubscriptionPaywall } from "@/components/SubscriptionPaywall";

export default function MobilePage() {
  const { t } = useTranslation();
  const { latest, hasUpdate } = useAppUpdate();
  const isNative = Capacitor.isNativePlatform();
  const apkUrl = latest?.apk_url && latest.apk_url !== "#" ? latest.apk_url : null;
  const latestVersion = latest?.version ?? APP_VERSION;

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

  const benefits = useMemo(() => [
    { icon: Bell, title: t("app.mobile.benefits.notifications_title"), desc: t("app.mobile.benefits.notifications_desc") },
    { icon: Wifi, title: t("app.mobile.benefits.offline_title"), desc: t("app.mobile.benefits.offline_desc") },
    { icon: Zap, title: t("app.mobile.benefits.performance_title"), desc: t("app.mobile.benefits.performance_desc") },
    { icon: ShieldCheck, title: t("app.mobile.benefits.security_title"), desc: t("app.mobile.benefits.security_desc") },
  ], [t]);

  const steps = useMemo(() => [
    { n: 1, title: t("app.mobile.steps.s1_title"), desc: t("app.mobile.steps.s1_desc") },
    { n: 2, title: t("app.mobile.steps.s2_title"), desc: t("app.mobile.steps.s2_desc") },
    { n: 3, title: t("app.mobile.steps.s3_title"), desc: t("app.mobile.steps.s3_desc") },
    { n: 4, title: t("app.mobile.steps.s4_title"), desc: t("app.mobile.steps.s4_desc") },
  ], [t]);

  const faq = useMemo(() => [
    { q: t("app.mobile.faq.q1_title"), a: t("app.mobile.faq.q1_desc") },
    { q: t("app.mobile.faq.q2_title"), a: t("app.mobile.faq.q2_desc") },
    { q: t("app.mobile.faq.q3_title"), a: t("app.mobile.faq.q3_desc") },
    { q: t("app.mobile.faq.q4_title"), a: t("app.mobile.faq.q4_desc") },
  ], [t]);

  return (
    <AppLayout>
      <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-10"
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="p-4 rounded-2xl bg-primary/20 border border-primary/40">
              <Smartphone className="w-10 h-10 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {t("app.mobile.android_version")}
                </Badge>
                <Badge variant="secondary" className="font-mono text-xs">
                  v{latestVersion}
                </Badge>
                {IS_BETA && (
                  <Badge className="bg-accent/20 text-accent border border-accent/40 hover:bg-accent/20 font-black tracking-wider">
                    BETA
                  </Badge>
                )}
                {isNative && hasUpdate && (
                  <Badge className="bg-primary/20 text-primary border-primary/40">
                    <Sparkles className="w-3 h-3 mr-1" /> {t("app.mobile.new_version")}
                  </Badge>
                )}
              </div>
              <h1 className="font-display text-2xl md:text-4xl font-bold text-primary mb-2">
                {t("app.mobile.hero_title")}
              </h1>
              <p className="text-muted-foreground max-w-2xl">
                {t("app.mobile.hero_subtitle")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t("app.mobile.current_version")}: <span className="font-mono">{APP_VERSION_LABEL}</span>
              </p>
            </div>
            <Button
              size="lg"
              onClick={apkUrl ? handleApkDownload : undefined}
              disabled={!apkUrl}
              className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {apkUrl ? (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  {t("app.mobile.download_apk")} v{latestVersion}
                </>
              ) : (
                <span>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  {t("app.mobile.apk_preparing")}
                </span>
              )}
            </Button>
          </div>
        </motion.div>

        {/* Subscription Paywall */}
        <SubscriptionPaywall />

        {/* Benefits */}
        <section>
          <h2 className="font-display text-xl text-primary mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" /> {t("app.mobile.why_use")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="h-full bg-card/60 border-border/60 hover:border-primary/40 transition-colors">
                  <CardContent className="p-4 space-y-2">
                    <div className="p-2 w-fit rounded-lg bg-primary/15">
                      <b.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm">{b.title}</h3>
                    <p className="text-xs text-muted-foreground">{b.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Tutorial */}
        <section>
          <h2 className="font-display text-xl text-primary mb-4 flex items-center gap-2">
            <Play className="w-5 h-5" /> {t("app.mobile.how_to_install")}
          </h2>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Card className="bg-card/60 border-border/60">
                  <CardContent className="p-4 flex gap-4 items-start">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-display font-bold text-primary">
                      {s.n}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm md:text-base mb-1">{s.title}</h3>
                      <p className="text-sm text-muted-foreground">{s.desc}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground hidden md:block" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Alert className="mt-4 border-primary/30 bg-primary/5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <AlertTitle>{t("app.mobile.security_tip_title")}</AlertTitle>
            <AlertDescription>
              {t("app.mobile.security_tip_desc")}
            </AlertDescription>
          </Alert>
        </section>

        {/* iOS / Outras opções */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card/60 border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Apple className="w-5 h-5" /> {t("app.mobile.iphone_title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>{t("app.mobile.iphone_desc")}</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>{t("app.mobile.iphone_step_1")}</li>
                <li>{t("app.mobile.iphone_step_2")}</li>
                <li>{t("app.mobile.iphone_step_3")}</li>
              </ol>
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Github className="w-5 h-5" /> {t("app.mobile.developer_title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                {t("app.mobile.developer_desc")} <code className="text-primary">npm install</code> {t("app.mobile.developer_and")} <code className="text-primary">npx cap run android</code>.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="font-display text-xl text-primary mb-4">{t("app.mobile.faq_title")}</h2>
          <div className="space-y-3">
            {faq.map((f) => (
              <Card key={f.q} className="bg-card/60 border-border/60">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    {f.q}
                  </h3>
                  <p className="text-sm text-muted-foreground pl-6">{f.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <div className="text-center py-6">
          <Button
            size="lg"
            onClick={apkUrl ? handleApkDownload : undefined}
            disabled={!apkUrl}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
          >
            {apkUrl ? (
              <>
                <Download className="w-5 h-5 mr-2" />
                {t("app.mobile.download_apk")} v{latestVersion}
              </>
            ) : (
              <span>
                <RefreshCw className="w-5 h-5 mr-2" />
                {t("app.mobile.apk_preparing")}
              </span>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            {t("app.mobile.footer_note")}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
