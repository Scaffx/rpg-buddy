import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Camera as CameraIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAppPermissions } from '@/hooks/useAppPermissions';

/**
 * Pedido de permissões logo depois do login.
 *
 * O sistema operacional só deixa perguntar uma vez: negado, o diálogo nativo
 * nunca mais aparece e a pessoa teria que ir nos ajustes do aparelho. Por isso
 * existe esta tela antes — ela explica o motivo e só então dispara o pedido
 * nativo, o que aumenta muito a chance de um "permitir".
 *
 * Aparece uma vez por aparelho. Recusar não bloqueia nada: a câmera volta a ser
 * pedida na hora de tirar a foto da medição, que é quando o motivo fica óbvio.
 */

const seenKey = (userId: string) => `permissions_prompt_seen:${userId}`;

export default function PermissionsGate() {
  const { user } = useAuth();
  const { notifications, camera, checked, isNative, requestNotifications, requestCamera } =
    useAppPermissions();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user || !checked || !isNative) return;
    // Nada a pedir se o sistema já respondeu por nós.
    if (notifications !== 'prompt' && camera !== 'prompt') return;
    try {
      if (localStorage.getItem(seenKey(user.id)) === '1') return;
    } catch {
      /* sem localStorage: mostra uma vez por sessão */
    }
    setOpen(true);
  }, [user, checked, isNative, notifications, camera]);

  const close = () => {
    if (user) {
      try {
        localStorage.setItem(seenKey(user.id), '1');
      } catch {
        /* segue sem lembrar — melhor perguntar de novo que travar */
      }
    }
    setOpen(false);
  };

  const allow = async () => {
    setWorking(true);
    try {
      // Um pedido de cada vez: dois diálogos nativos simultâneos se atropelam.
      if (notifications === 'prompt') await requestNotifications();
      if (camera === 'prompt') await requestCamera();
    } finally {
      setWorking(false);
      close();
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ y: 24, scale: 0.97 }}
          animate={{ y: 0, scale: 1 }}
          className="w-full max-w-sm rounded-2xl border border-primary/30 bg-card p-5 space-y-4 shadow-2xl"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Antes de começar</h2>
            <p className="text-sm text-muted-foreground">
              Duas permissões ajudam o herói a não ficar para trás.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3">
              <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Lembretes</p>
                <p className="text-xs text-muted-foreground">
                  Avisos curtos quando faltar cumprir missão, comer, beber água ou descansar.
                  No máximo três por dia, nunca de madrugada.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <CameraIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Câmera</p>
                <p className="text-xs text-muted-foreground">
                  Só para registrar fotos das suas medições corporais. Elas ficam na sua conta.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={close}
              disabled={working}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-muted/50 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              Agora não
            </button>
            <button
              onClick={allow}
              disabled={working}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {working ? 'Aguarde…' : 'Permitir'}
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Dá para mudar isso depois no seu perfil.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
