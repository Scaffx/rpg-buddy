import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { Sword, Shield, Loader2, Mail, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AccountRecoveryModal } from '@/components/AccountRecoveryModal';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  // Fluxo de redefinição de senha (token no hash da URL)
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const { t } = useTranslation();
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Detecta token de recovery no hash da URL: #type=recovery&access_token=...
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsPasswordReset(true);
    }
  }, []);

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: 'Senha muito curta', description: 'A senha precisa ter pelo menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Senha atualizada!', description: 'Sua nova senha foi salva com sucesso.' });
      // Limpa o hash e redireciona para o app
      window.history.replaceState(null, '', window.location.pathname);
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Erro ao salvar senha', description: err.message, variant: 'destructive' });
    } finally {
      setSavingPassword(false);
    }
  };

  const isEmailConfirmationError = (message: string) =>
    message.toLowerCase().includes('email not confirmed') ||
    message.toLowerCase().includes('invalid login credentials');

  const handleResendConfirmation = async () => {
    if (!email) {
      toast({ title: t('app.auth.toast_email_required'), variant: 'destructive' });
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      toast({
        title: t('app.auth.toast_email_resent_title'),
        description: t('app.auth.toast_email_resent_desc'),
      });
    } catch (err: any) {
      toast({ title: t('app.auth.toast_resend_error'), description: err.message, variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: t('app.auth.toast_email_required_reset'), variant: 'destructive' });
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: t('app.auth.toast_reset_sent_title'),
        description: t('app.auth.toast_reset_sent_desc'),
      });
      setForgotPassword(false);
    } catch (err: any) {
      toast({ title: t('app.auth.toast_error'), description: err.message, variant: 'destructive' });
    } finally {
      setResetLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Erro ao entrar com Discord', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsConfirmation(false);
    try {
      if (isLogin) {
        await signIn(email, password);
        // Checar se há perfis órfãos para recuperação antes de redirecionar
        const { data: orphaned } = await (supabase.rpc as any)('get_orphaned_profiles');
        if (orphaned && (orphaned as any[]).length > 0) {
          setShowRecovery(true);
        } else {
          navigate('/');
        }
      } else {
        await signUp(email, password, displayName);
        setNeedsConfirmation(true);
        toast({
          title: t('app.auth.toast_account_created_title'),
          description: t('app.auth.toast_account_created_desc'),
        });
      }
    } catch (err: any) {
      if (isLogin && isEmailConfirmationError(err.message)) {
        setNeedsConfirmation(true);
        toast({
          title: t('app.auth.toast_email_not_confirmed_title'),
          description: t('app.auth.toast_email_not_confirmed_desc'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('app.auth.toast_error'),
          description: err.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--gradient-dark)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/30 mb-4"
            >
              <Sword className="w-8 h-8 text-primary" />
            </motion.div>
            <h1 className="text-3xl font-display font-bold text-primary text-glow">
              {t('app.auth.app_title')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('app.auth.app_subtitle')}
            </p>
          </div>

          <div className="rpg-card-glow p-6">
            {/* Formulário de redefinição de senha (via link do email) */}
            {isPasswordReset ? (
              <form onSubmit={handleSaveNewPassword} className="space-y-4">
                <div className="flex items-center gap-2 mb-4 text-primary">
                  <KeyRound className="w-5 h-5" />
                  <h2 className="font-semibold text-lg">Nova senha</h2>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Digite sua nova senha
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="bg-secondary border-border"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={savingPassword}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Salvar nova senha
                </Button>
              </form>
            ) : (
              <>
                <div className="flex mb-6 rounded-lg overflow-hidden border border-border">
                  <button
                    onClick={() => setIsLogin(true)}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                      isLogin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    <Shield className="w-4 h-4 inline mr-1.5" />
                    {t('app.auth.tab_login')}
                  </button>
                  <button
                    onClick={() => setIsLogin(false)}
                    className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                      !isLogin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    <Sword className="w-4 h-4 inline mr-1.5" />
                    {t('app.auth.tab_register')}
                  </button>
                </div>

                {forgotPassword ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">
                        {t('app.auth.label_registered_email')}
                      </label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="heroi@aventura.com"
                        required
                        className="bg-secondary border-border"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                    >
                      {resetLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {t('app.auth.button_send_reset')}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setForgotPassword(false)}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('app.auth.link_back_to_login')}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">
                          {t('app.auth.label_hero_name')}
                        </label>
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder={t('app.auth.placeholder_hero_name')}
                          className="bg-secondary border-border"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">
                        {t('app.auth.label_email')}
                      </label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="heroi@aventura.com"
                        required
                        className="bg-secondary border-border"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-medium text-foreground">
                          {t('app.auth.label_password')}
                        </label>
                        {isLogin && (
                          <button
                            type="button"
                            onClick={() => setForgotPassword(true)}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors"
                          >
                            {t('app.auth.link_forgot_password')}
                          </button>
                        )}
                      </div>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        className="bg-secondary border-border"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {isLogin ? t('app.auth.button_login') : t('app.auth.button_register')}
                    </Button>
                    {needsConfirmation && (
                      <div className="mt-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-sm text-yellow-300">
                        <p className="mb-2 flex items-center gap-1.5">
                          <Mail className="w-4 h-4 flex-shrink-0" />
                          {t('app.auth.notice_confirm_email')}
                        </p>
                        <button
                          type="button"
                          onClick={handleResendConfirmation}
                          disabled={resending}
                          className="underline text-yellow-200 hover:text-yellow-100 disabled:opacity-50"
                        >
                          {resending ? t('app.auth.button_resend_sending') : t('app.auth.button_resend')}
                        </button>
                      </div>
                    )}

                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">ou</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={handleDiscordLogin}
                      variant="outline"
                      className="w-full border-[#5865F2]/50 hover:border-[#5865F2] hover:bg-[#5865F2]/10 font-semibold gap-2"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#5865F2' }}>
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      Entrar com Discord
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      <AccountRecoveryModal
        open={showRecovery}
        onClose={() => {
          setShowRecovery(false);
          navigate('/');
        }}
      />
    </>
  );
}
