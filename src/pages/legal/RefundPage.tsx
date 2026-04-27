import { LegalLayout } from "@/components/LegalLayout";

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy / Política de Reembolso" lastUpdated="2026-04-27">
      <p>
        We want you to be satisfied with LifeOnRPG. If for any reason you are not happy with your
        subscription, you can request a refund as described below.
      </p>
      <p>
        <em>
          Queremos que você fique satisfeito com o LifeOnRPG. Caso não esteja, você pode solicitar
          reembolso conforme as condições abaixo.
        </em>
      </p>

      <h2>30-Day Money-Back Guarantee / Garantia de 30 Dias</h2>
      <p>
        We offer a <strong>30-day money-back guarantee</strong> on paid subscriptions. If you
        request a refund within 30 days of your initial paid charge and you have not abused the
        Service, we will issue a full refund.
      </p>
      <p>
        <em>
          Oferecemos uma <strong>garantia de reembolso de 30 dias</strong> nas assinaturas pagas.
          Se você solicitar o reembolso em até 30 dias após a primeira cobrança e não tiver feito
          uso abusivo do Serviço, devolveremos o valor integral.
        </em>
      </p>

      <h2>Free Trial / Período de Teste</h2>
      <p>
        New users may be eligible for a free trial period as advertised on our pricing section. You
        will not be charged during the trial. To avoid being charged, cancel before the trial ends.
      </p>

      <h2>How to Request a Refund / Como Solicitar</h2>
      <p>
        Our payments are processed by our reseller and Merchant of Record,{" "}
        <strong>Paddle.com</strong>. To request a refund:
      </p>
      <ul>
        <li>
          Visit{" "}
          <a href="https://paddle.net" target="_blank" rel="noreferrer">
            paddle.net
          </a>{" "}
          and find your order using the email used at checkout, or
        </li>
        <li>
          Email us at{" "}
          <a href="mailto:support@lifeonrpg.app">support@lifeonrpg.app</a> with the subject
          "Refund request" and we will help process it through Paddle.
        </li>
      </ul>
      <p>
        Refunds are returned to the original payment method. Processing times depend on your bank
        or card issuer, typically 5–10 business days.
      </p>

      <h2>Cancellations / Cancelamentos</h2>
      <p>
        You can cancel your subscription at any time through your account or via{" "}
        <a href="https://paddle.net" target="_blank" rel="noreferrer">
          paddle.net
        </a>
        . Cancellation stops future renewals; you keep access until the end of the current paid
        billing period.
      </p>

      <h2>Exceptions / Exceções</h2>
      <p>
        Refunds may be denied in cases of clear abuse, fraud, chargeback abuse, or violation of
        our <a href="/terms">Terms & Conditions</a>. Statutory consumer rights in your country
        always apply on top of this policy.
      </p>

      <h2>Contact / Contato</h2>
      <p>
        For any question related to billing or refunds, contact{" "}
        <a href="mailto:support@lifeonrpg.app">support@lifeonrpg.app</a>.
      </p>
    </LegalLayout>
  );
}
