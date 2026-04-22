import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { Sword, Shield, Loader2, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isEmailConfirmationError = (message: string) =>
    message.toLowerCase().includes('email not confirmed') ||
    message.toLowerCase().includes('invalid login credentials');

  const handleResendConfirmation = async () => {
    if (!email) {
      toast({ title: 'Informe seu email primeiro', variant: 'destructive' });
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      toast({
        title: '📧 Email reenviado!',
        description: 'Verifique sua caixa de entrada e confirme o cadastro.',
      });
    } catch (err: any) {
      toast({ title: 'Erro ao reenviar', description: err.message, variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Informe seu email', variant: 'destructive' });
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw error;
      toast({
        title: '📧 Email enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      setForgotPassword(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsConfirmation(false);
    try {
      if (isLogin) {
        await signIn(email, password);
        navigate('/');
      } else {
        await signUp(email, password, displayName);
        setNeedsConfirmation(true);
        toast({
          title: '⚔️ Conta criada!',
          description: 'Verifique seu email para confirmar o registro.',
        });
      }
    } catch (err: any) {
      if (isLogin && isEmailConfirmationError(err.message)) {
        setNeedsConfirmation(true);
        toast({
          title: 'Email não confirmado',
          description: 'Confirme seu email antes de entrar. Verifique sua caixa de entrada ou reenvie o email abaixo.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro',
          description: err.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
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
            RPG Pessoal
          </h1>
          <p className="text-muted-foreground mt-2">
            Transforme sua vida em uma aventura épica
          </p>
        </div>

        <div className="rpg-card-glow p-6">
          <div className="flex mb-6 rounded-lg overflow-hidden border border-border">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                isLogin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-1.5" />
              Entrar
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                !isLogin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              <Sword className="w-4 h-4 inline mr-1.5" />
              Registrar
            </button>
          </div>

          {forgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Email cadastrado
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
                📧 Enviar link de redefinição
              </Button>
              <button
                type="button"
                onClick={() => setForgotPassword(false)}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Voltar ao login
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Nome do Herói
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome de aventureiro"
                  className="bg-secondary border-border"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Email
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
                  Senha
                </label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setForgotPassword(true)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Esqueci a senha
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
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {isLogin ? '⚔️ Entrar na Aventura' : '🛡️ Criar Personagem'}
            </Button>
            {needsConfirmation && (
              <div className="mt-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-sm text-yellow-300">
                <p className="mb-2 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  Confirme seu email para acessar o jogo.
                </p>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resending}
                  className="underline text-yellow-200 hover:text-yellow-100 disabled:opacity-50"
                >
                  {resending ? 'Enviando...' : 'Reenviar email de confirmação'}
                </button>
              </div>
            )}
          </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
