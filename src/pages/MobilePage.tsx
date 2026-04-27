import { motion } from "framer-motion";
import { Smartphone, Download, CheckCircle2, ShieldCheck, Wifi, Bell, Github, Apple, Play, ChevronRight, Package, Zap, Sparkles, RefreshCw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { APP_VERSION, APP_VERSION_LABEL, IS_BETA } from "@/lib/version";
import { SubscriptionPaywall } from "@/components/SubscriptionPaywall";

const benefits = [
  { icon: Bell, title: "Notificações nativas", desc: "Alertas do herói direto na tela de bloqueio." },
  { icon: Wifi, title: "Funciona offline", desc: "Acesse seu progresso mesmo sem internet estável." },
  { icon: Zap, title: "Performance superior", desc: "Animações fluidas e abertura instantânea." },
  { icon: ShieldCheck, title: "Seguro e privado", desc: "Mesma criptografia da versão web." },
];

const steps = [
  {
    n: 1,
    title: "Baixe o arquivo APK",
    desc: "Clique no botão de download abaixo. O arquivo .apk será salvo na pasta Downloads do seu celular.",
  },
  {
    n: 2,
    title: "Permita instalações de fontes desconhecidas",
    desc: "Vá em Configurações → Segurança → ative 'Fontes desconhecidas' ou 'Instalar apps desconhecidos' para o seu navegador.",
  },
  {
    n: 3,
    title: "Abra o arquivo baixado",
    desc: "Use o gerenciador de arquivos do seu celular, vá em Downloads e toque no arquivo lifeonrpg.apk.",
  },
  {
    n: 4,
    title: "Instale e abra o Hero's Journey",
    desc: "Confirme a instalação. O ícone do app aparecerá na sua tela inicial. Faça login com a mesma conta da versão web.",
  },
];

const faq = [
  {
    q: "É seguro instalar o APK?",
    a: "Sim. O APK é compilado a partir do mesmo código-fonte da versão web e não solicita permissões além do necessário (notificações e armazenamento local).",
  },
  {
    q: "Vou perder meu progresso?",
    a: "Não. Seu progresso fica salvo na nuvem. Basta fazer login com a mesma conta no app.",
  },
  {
    q: "Quando vai ter na Play Store?",
    a: "Estamos preparando a publicação oficial. Por enquanto, o APK direto é a forma mais rápida de ter o app no celular.",
  },
  {
    q: "E iPhone?",
    a: "A versão iOS está no roadmap. Por enquanto, iPhones podem usar a versão web instalável (Adicionar à Tela de Início pelo Safari).",
  },
];

export default function MobilePage() {
  const { latest, hasUpdate } = useAppUpdate();
  const apkUrl = latest?.apk_url && latest.apk_url !== "#" ? latest.apk_url : null;
  const latestVersion = latest?.version ?? APP_VERSION;

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
                  Versão Android
                </Badge>
                <Badge variant="secondary" className="font-mono text-xs">
                  v{latestVersion}
                </Badge>
                {IS_BETA && (
                  <Badge className="bg-accent/20 text-accent border border-accent/40 hover:bg-accent/20 font-black tracking-wider">
                    BETA
                  </Badge>
                )}
                {hasUpdate && (
                  <Badge className="bg-primary/20 text-primary border-primary/40">
                    <Sparkles className="w-3 h-3 mr-1" /> Nova versão!
                  </Badge>
                )}
              </div>
              <h1 className="font-display text-2xl md:text-4xl font-bold text-primary mb-2">
                Hero's Journey no seu bolso
              </h1>
              <p className="text-muted-foreground max-w-2xl">
                Instale o app oficial no seu Android e tenha seu painel de herói sempre à mão — com notificações nativas e modo offline.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Sua versão atual: <span className="font-mono">{APP_VERSION_LABEL}</span>
              </p>
            </div>
            <Button
              size="lg"
              asChild={!!apkUrl}
              disabled={!apkUrl}
              className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {apkUrl ? (
                <a href={apkUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="w-5 h-5 mr-2" />
                  Baixar APK v{latestVersion}
                </a>
              ) : (
                <span>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  APK em preparação
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
            <Package className="w-5 h-5" /> Por que usar o app?
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
            <Play className="w-5 h-5" /> Como instalar (passo a passo)
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
            <AlertTitle>Dica de segurança</AlertTitle>
            <AlertDescription>
              Após a instalação, você pode desativar novamente "Fontes desconhecidas" nas configurações do Android.
            </AlertDescription>
          </Alert>
        </section>

        {/* iOS / Outras opções */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card/60 border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Apple className="w-5 h-5" /> Tem iPhone?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Por enquanto, iPhone usa a versão web instalável:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Abra o site no Safari</li>
                <li>Toque no botão Compartilhar</li>
                <li>Escolha "Adicionar à Tela de Início"</li>
              </ol>
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Github className="w-5 h-5" /> Versão de desenvolvedor
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                O projeto usa Capacitor. Para compilar localmente: exporte para o GitHub, rode <code className="text-primary">npm install</code> e <code className="text-primary">npx cap run android</code>.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="font-display text-xl text-primary mb-4">Perguntas frequentes</h2>
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
            asChild={!!apkUrl}
            disabled={!apkUrl}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
          >
            {apkUrl ? (
              <a href={apkUrl} download target="_blank" rel="noopener noreferrer">
                <Download className="w-5 h-5 mr-2" />
                Baixar APK v{latestVersion}
              </a>
            ) : (
              <span>
                <RefreshCw className="w-5 h-5 mr-2" />
                APK em preparação
              </span>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Versão Android • Atualizações verificadas automaticamente
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
