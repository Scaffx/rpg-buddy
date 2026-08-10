import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';

/**
 * OAuth dentro do app Android.
 *
 * Na web o fluxo é trivial: o Supabase redireciona a própria página e volta.
 * No Capacitor não — `window.location.origin` vale "localhost", endereço que
 * só existe dentro do webview. O provedor mandava o navegador do sistema para
 * lá, o Chrome não achava nada, e a sessão morria fora do app.
 *
 * A saída é um deep link: pedimos a URL de autorização sem deixar o webview
 * navegar, abrimos numa aba do sistema, e o provedor devolve para
 * `com.scaffx.lifeonrpg://login-callback` — esquema registrado no
 * intent-filter do AndroidManifest, que o Android entrega de volta ao app.
 */

/** Igual ao custom_url_scheme de strings.xml e ao intent-filter do manifesto. */
export const APP_SCHEME = 'com.scaffx.lifeonrpg';
export const OAUTH_CALLBACK = `${APP_SCHEME}://login-callback`;

export const isNative = () => Capacitor.isNativePlatform();

/** Web devolve a origem real; app devolve o deep link. */
export function oauthRedirectTo(): string {
  return isNative() ? OAUTH_CALLBACK : `${window.location.origin}/`;
}

export async function signInWithDiscord(): Promise<void> {
  const redirectTo = oauthRedirectTo();

  if (!isNative()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) {
    throw new Error('O Supabase não devolveu a URL de autorização do Discord.');
  }

  await Browser.open({ url: data.url });
}

/**
 * Separa query e hash de uma URL de esquema customizado.
 *
 * `new URL()` trata esquemas não-especiais de forma inconsistente entre
 * plataformas, então quebramos na mão — é curto e não tem surpresa.
 */
function splitCallback(url: string) {
  const hashAt = url.indexOf('#');
  const hash = hashAt >= 0 ? url.slice(hashAt + 1) : '';
  const semHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = semHash.indexOf('?');
  const query = queryAt >= 0 ? semHash.slice(queryAt + 1) : '';
  return {
    query: new URLSearchParams(query),
    hash: new URLSearchParams(hash),
  };
}

/**
 * Converte o retorno do provedor numa sessão.
 *
 * Cobre os dois fluxos de propósito: PKCE devolve `?code=`, implicit devolve
 * `#access_token=`. Qual deles vale depende da versão do supabase-js e do
 * flowType do client — tratar os dois evita quebrar num upgrade futuro.
 */
async function consumirRetorno(url: string): Promise<boolean> {
  const { query, hash } = splitCallback(url);

  const erro = query.get('error_description') || hash.get('error_description');
  if (erro) throw new Error(erro);

  const code = query.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return true;
  }

  return false;
}

let listenerRegistrado = false;

/**
 * Registra o tratamento do deep link. Idempotente: chamar duas vezes não
 * duplica o listener, o que geraria troca de sessão em dobro no StrictMode.
 */
export function initDeepLinkAuth(onSession?: () => void): void {
  if (!isNative() || listenerRegistrado) return;
  listenerRegistrado = true;

  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith(`${APP_SCHEME}://`)) return;
    try {
      if (await consumirRetorno(url)) onSession?.();
    } catch (e) {
      console.error('[auth] falha ao consumir o retorno do OAuth:', e);
    } finally {
      // Fecha a aba do sistema mesmo quando deu erro: deixá-la aberta prende
      // o usuário numa tela sem saída, sem pista do que houve.
      await Browser.close().catch(() => {});
    }
  });
}
