import { Link } from 'react-router-dom';
import { ChevronRight, ScrollText, Smartphone, Settings } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import DeleteAccountSection from '@/components/DeleteAccountSection';

/**
 * Ajustes — o canto das coisas que se procura, não que se navega.
 *
 * Saiu do grupo "Sistema" da barra lateral, que gastava espaço permanente com
 * telas de uso raro. A exclusão de conta veio junto, tirada do meio do Perfil.
 *
 * Fica alcançável pelo Perfil de propósito: a Google Play exige que o caminho
 * de exclusão exista DENTRO do app e seja encontrável. Esconder demais é tão
 * problemático quanto não ter.
 */

const ATALHOS = [
  {
    to: '/mobile',
    icon: Smartphone,
    titulo: 'O app no celular',
    descricao: 'Baixe o LifeOnRPG na Google Play e leve sua jornada no bolso.',
  },
  {
    to: '/system-info',
    icon: ScrollText,
    titulo: 'Informações do sistema',
    descricao: 'Versão, novidades de cada atualização e como as regras funcionam.',
  },
];

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 pb-10">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold text-primary text-glow">Ajustes</h1>
            <p className="text-xs text-muted-foreground">
              Informações do app e da sua conta.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {ATALHOS.map(({ to, icon: Icon, titulo, descricao }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/50 transition-colors"
            >
              <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{titulo}</p>
                <p className="text-xs text-muted-foreground">{descricao}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            Zona de risco
          </p>
          <DeleteAccountSection />
        </div>
      </div>
    </AppLayout>
  );
}
