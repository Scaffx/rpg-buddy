import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Aguarda o Supabase processar o token de recovery da URL
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: t('app.reset_password.toast_short_title'), description: t('app.reset_password.toast_short_desc'), variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: t('app.reset_password.toast_mismatch_title'), description: t('app.reset_password.toast_mismatch_desc'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: t('app.reset_password.toast_success_title'), description: t('app.reset_password.toast_success_desc') });
      navigate('/');
    } catch (err: any) {
      toast({ title: t('app.reset_password.toast_error'), description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--gradient-dark)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <ShieldCheck className="w-10 h-10 text-primary mx-auto mb-3" />
            <h1 className="font-display text-2xl font-bold text-foreground">{t('app.reset_password.title')}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t('app.reset_password.subtitle')}</p>
          </div>

          {!ready ? (
            <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>{t('app.reset_password.verifying')}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('app.reset_password.new_label')}</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('app.reset_password.new_placeholder')}
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('app.reset_password.confirm_label')}</label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t('app.reset_password.confirm_placeholder')}
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('app.reset_password.button')}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
