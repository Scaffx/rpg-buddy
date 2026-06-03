import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura erros de render em qualquer rota e mostra um fallback amigável
 * em vez de uma tela branca. Evita que um único erro derrube o app inteiro.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary capturou um erro:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-border bg-card p-8">
          <div className="text-5xl">🛡️</div>
          <h1 className="text-xl font-bold text-foreground">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground">
            Encontramos um erro inesperado nesta tela. Você pode voltar ao início e tentar de novo.
          </p>
          {this.state.error?.message && (
            <p className="text-xs text-muted-foreground/60 break-words font-mono">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
