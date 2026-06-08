import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, Swords, Sparkles } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import SkillTreePage from '@/pages/SkillTreePage';
import FeatsTree from '@/pages/FeatsTree';
import CombatLoadout from '@/components/CombatLoadout';

type Tab = 'arvore' | 'loadout' | 'talentos';

/** Hub único de Habilidades: Árvore (desbloquear) + Loadout (equipar) + Talentos de Vida. */
export default function HabilidadesHub() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('arvore');

  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: 'arvore',   icon: Network,  label: t('app.habhub.tab_tree') },
    { id: 'loadout',  icon: Swords,   label: t('app.habhub.tab_loadout') },
    { id: 'talentos', icon: Sparkles, label: t('app.habhub.tab_talents') },
  ];

  return (
    <AppLayout>
      <div className="space-y-5">
        <h1 className="text-2xl font-display font-bold text-primary text-glow">{t('app.habhub.title')}</h1>

        <div className="flex gap-2 flex-wrap border-b border-border/50 pb-2">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === id
                  ? 'bg-primary/20 border border-primary/50 text-primary'
                  : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'arvore' && <SkillTreePage embedded />}
        {tab === 'loadout' && <CombatLoadout />}
        {tab === 'talentos' && <FeatsTree embedded />}
      </div>
    </AppLayout>
  );
}
