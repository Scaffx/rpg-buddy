import { Link } from "react-router-dom";
import { Swords, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <Link to="/landing" className="flex items-center gap-2">
            <Swords className="w-6 h-6 text-primary" />
            <span className="font-[var(--font-display)] text-base md:text-lg font-bold tracking-wider">
              LIFE<span className="text-primary">on</span>RPG
            </span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/landing">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar / Back</span>
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-black font-[var(--font-display)] mb-2">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Última atualização / Last updated: {lastUpdated}
        </p>

        <article className="prose prose-invert max-w-none space-y-6 text-sm md:text-base text-foreground/90 leading-relaxed [&_h2]:text-xl [&_h2]:md:text-2xl [&_h2]:font-bold [&_h2]:font-[var(--font-display)] [&_h2]:text-primary [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-primary [&_a]:underline">
          {children}
        </article>

        <footer className="mt-16 pt-8 border-t border-border/40 text-xs text-muted-foreground flex flex-wrap gap-4">
          <Link to="/terms" className="hover:text-primary">Terms / Termos</Link>
          <Link to="/privacy" className="hover:text-primary">Privacy / Privacidade</Link>
          <Link to="/refund" className="hover:text-primary">Refund / Reembolso</Link>
          <Link to="/landing" className="hover:text-primary">Home</Link>
        </footer>
      </main>
    </div>
  );
}
