import { LegalLayout } from "@/components/LegalLayout";

export default function RefundPage() {
  return (
    <LegalLayout title="Previous Billing & Refunds / Cobranças Anteriores e Reembolsos" lastUpdated="2026-10-26">
      <p>
        LifeOnRPG currently offers free access. There is no subscription checkout for new access,
        and optional contributions do not unlock features or rewards.
      </p>
      <p>
        <em>
          O acesso ao LifeOnRPG agora é gratuito. Não há contratação de assinatura para novos
          acessos, e contribuições opcionais não liberam recursos nem recompensas.
        </em>
      </p>

      <h2>Previous charges / Cobranças anteriores</h2>
      <p>
        If you paid for a subscription previously, keep your receipt and check its terms and the
        payment provider listed there. Any rights and refund offers attached to that purchase,
        including the previously advertised 30-day guarantee where applicable, remain subject to
        the terms presented at the time and applicable law. Free access does not automatically
        cancel an existing billing arrangement or trigger a refund.
      </p>
      <p>
        <em>
          Se você pagou uma assinatura antes, guarde o comprovante e confira as condições e o
          provedor de pagamento indicados nele. Direitos e ofertas de reembolso daquela compra,
          inclusive a garantia de 30 dias antes anunciada quando aplicável, seguem as condições
          apresentadas na contratação e a lei aplicável. O acesso gratuito não cancela cobranças
          antigas nem gera reembolso automaticamente.
        </em>
      </p>

      <h2>Help with a previous purchase / Ajuda com uma compra anterior</h2>
      <p>
        Contact <a href="mailto:support@lifeonrpg.app">support@lifeonrpg.app</a> with your receipt
        or use the support channel of the payment provider shown on it. We can review the charge
        and the conditions that applied to it. Statutory consumer rights continue to apply.
      </p>
      <p>
        <em>
          Escreva para <a href="mailto:support@lifeonrpg.app">support@lifeonrpg.app</a> com o
          comprovante ou use o atendimento do provedor indicado nele. Podemos revisar a cobrança
          e as condições aplicáveis. Seus direitos legais como consumidor permanecem válidos.
        </em>
      </p>
    </LegalLayout>
  );
}
