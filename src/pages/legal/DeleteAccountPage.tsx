import { LegalLayout } from "@/components/LegalLayout";

/**
 * Página pública de exclusão de conta. A Google Play exige uma URL alcançável
 * SEM login, explicando o processo — é este endereço que vai no formulário de
 * Segurança dos Dados. Por isso a rota fica fora da área autenticada.
 */
export default function DeleteAccountPage() {
  return (
    <LegalLayout title="Excluir sua conta / Delete your account" lastUpdated="2026-07-30">
      <p>
        Esta página explica como excluir sua conta do <strong>LifeOnRPG</strong> e quais dados
        são apagados.
      </p>
      <p>
        <em>
          This page explains how to delete your LifeOnRPG account and what data is removed.
        </em>
      </p>

      <h2>1. Pelo app / In the app</h2>
      <ol>
        <li>Entre na sua conta.</li>
        <li>
          Abra <strong>Perfil</strong>.
        </li>
        <li>
          Role até <strong>Excluir minha conta</strong>.
        </li>
        <li>
          Digite <strong>EXCLUIR</strong> para confirmar.
        </li>
      </ol>
      <p>
        A exclusão é imediata e definitiva. Não existe período de carência nem forma de
        recuperar os dados depois.
      </p>
      <p>
        <em>
          Sign in, open Profile, scroll to "Excluir minha conta", and type EXCLUIR to confirm.
          Deletion is immediate and permanent.
        </em>
      </p>

      <h2>2. Sem acesso à conta / If you cannot sign in</h2>
      <p>
        Se você perdeu o acesso e não consegue entrar, escreva para{" "}
        <a href="mailto:privacy@lifeonrpg.app">privacy@lifeonrpg.app</a> a partir do e-mail
        cadastrado, pedindo a exclusão. Respondemos no prazo exigido pela legislação aplicável
        — normalmente em até 30 dias.
      </p>
      <p>
        <em>
          Lost access? Email <a href="mailto:privacy@lifeonrpg.app">privacy@lifeonrpg.app</a>{" "}
          from your registered address requesting deletion.
        </em>
      </p>

      <h2>3. O que é apagado / What gets deleted</h2>
      <p>Tudo que está ligado à sua conta, sem exceção:</p>
      <ul>
        <li>Login, e-mail e senha.</li>
        <li>Perfil, herói, classe, nível, atributos e progresso.</li>
        <li>Missões, planos, histórico de XP, ouro e conquistas.</li>
        <li>
          Registros de saúde: água, refeições, peso, medidas corporais, sono e humor.
        </li>
        <li>Fotos de progresso e avatar.</li>
        <li>Amizades, mensagens trocadas, bloqueios e denúncias que você enviou.</li>
        <li>Assinatura e identificadores do provedor de pagamento.</li>
      </ul>

      <h2>4. O que pode permanecer / What may remain</h2>
      <p>
        Registros que a lei nos obriga a manter — por exemplo, comprovantes fiscais de
        pagamentos já realizados — são conservados pelo prazo legal e depois eliminados.
        Backups são sobrescritos no ciclo normal de retenção. Nada disso é usado para
        reconstruir seu perfil.
      </p>
      <p>
        <em>
          Records we are legally required to keep (such as payment/tax records) are retained
          for the legal period. Backups are overwritten on their normal rotation.
        </em>
      </p>

      <h2>5. Cancelar a assinatura / Canceling your subscription</h2>
      <p>
        Excluir a conta encerra seu acesso, mas cancele a assinatura na loja onde ela foi
        contratada para garantir que não haja nova cobrança.
      </p>

      <h2>6. Dúvidas / Questions</h2>
      <p>
        <a href="mailto:privacy@lifeonrpg.app">privacy@lifeonrpg.app</a>
      </p>
    </LegalLayout>
  );
}
