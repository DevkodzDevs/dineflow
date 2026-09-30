import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { Doc, Section, P, Bullets, Defs, Mail } from "../Doc";

export const metadata = {
  title: "Refund & Cancellation Policy",
  description: "How to cancel a DineFlow subscription, when a refund is due, and how long it takes.",
};

export default function Refunds() {
  return (
    <Doc title="Refund &amp; Cancellation Policy"
      intro={`How to cancel a ${COMPANY.product} subscription, when money comes back, and how long it takes to arrive.`}>

      <Section title="First, which payment do you mean?">
        <P>
          Two different kinds of money move through {COMPANY.product}, and they have nothing to do with each other. Almost
          every refund question is really a question about which one.
        </P>
        <Defs rows={[
          [<>A property paying <b>us</b></>, <>Your subscription to the {COMPANY.product} software. We are the merchant. <b>This policy covers it.</b></>],
          [<>A guest paying <b>a property</b></>, <>A bill for food or a room, paid through a payment link. The money goes to the property&rsquo;s own gateway account and settles to the property&rsquo;s bank. We are not the merchant and never hold it. See the last section.</>],
        ]} />
      </Section>

      <Section title="1. The free trial">
        <P>
          A new property gets a free trial. Nothing is charged during it and no card is required to start it. If you do
          not subscribe, the account simply locks at the end of the trial — there is nothing to cancel and nothing to
          refund. Your data is kept, not deleted, so you can pick it up later.
        </P>
      </Section>

      <Section title="2. Cancelling a subscription">
        <Bullets items={[
          "You can cancel at any time, from the membership screen in the app or by writing to " + COMPANY.supportEmail + ".",
          "Cancelling stops the next renewal. It does not cut the current period short — you keep full access until the date you have already paid up to.",
          "You do not have to give a reason, and we will not make you telephone anyone to do it.",
          "We will confirm the cancellation by email. If you do not get that email, assume it has not happened and tell us.",
        ]} />
      </Section>

      <Section title="3. When a refund is due">
        <Defs rows={[
          ["Within 7 days of a first subscription", "Full refund, no questions asked, as long as the account has not been used to place more than 50 orders. If the software is not right for your property, you should not be stuck with it."],
          ["Within 7 days of a renewal you did not intend", "Full refund of that renewal, provided you have not used the Service in the new period."],
          ["A failure that is ours", "If the Service is unavailable through our fault for more than 24 consecutive hours in a billing period, you may claim a pro-rata refund for the days lost, or a credit against the next period — your choice."],
          ["We end the agreement for convenience", "Pro-rata refund of the unused part of the period, automatically. You do not have to ask."],
          ["Duplicate or incorrect charge", "Refunded in full as soon as we can confirm it, whenever it happened."],
        ]} />
      </Section>

      <Section title="4. When a refund is not due">
        <Bullets items={[
          "The remaining part of a period you cancel mid-way, outside the windows above. You keep access to the end of it instead.",
          "Periods already used. We do not refund backwards for months you ran your business on the Service.",
          "An account we suspended or ended because of a serious breach of the Terms — for instance, using it to produce false records.",
          "Charges from a third party: your payment gateway's fees, an aggregator's commission, hardware, or a printer you bought elsewhere.",
          "Setup or training work that has already been carried out at your request.",
        ]} />
      </Section>

      <Section title="5. How to ask for one">
        <P>
          Write to <Mail to={COMPANY.supportEmail} /> from the email address on the account, with the property name and the
          payment reference or invoice number. That is all we need.
        </P>
        <Bullets items={[
          "We acknowledge within 48 hours.",
          "We decide and tell you within 7 working days.",
          "If we approve it, we start the refund the same day.",
        ]} />
      </Section>

      <Section title="6. How the money comes back">
        <Bullets items={[
          "Always to the original payment method. We cannot send a card refund to a bank account, or the other way round — the gateway does not allow it.",
          "Card and UPI refunds reach you in 5 to 7 working days once we start them. Net banking can take up to 10. The delay after we press the button belongs to the banks, not to us.",
          "Refunds are made in Indian Rupees for the amount charged. We do not carry exchange-rate movement.",
          "Where GST was charged, it is refunded in proportion and a credit note is issued against the original tax invoice.",
        ]} />
      </Section>

      <Section title="7. If we disagree">
        <P>
          Ask the Grievance Officer to look at it again — the details are on the{" "}
          <Link href="/legal/contact" className="underline font-semibold">contact page</Link>. We acknowledge within 48
          hours and answer within {COMPANY.grievanceDays} days. Please come to us before raising a chargeback with your
          bank: a chargeback freezes the money for weeks and we can usually settle it in days.
        </P>
      </Section>

      <Section title="8. Money your guests pay you">
        <P>
          When a guest pays one of your bills through a {COMPANY.product} payment link, that payment runs on{" "}
          <b>your own gateway account</b>, using keys you supplied, and settles to <b>your own bank account</b>. We never
          hold it and we cannot refund it.
        </P>
        <P>
          So if you are a guest wanting money back for a meal, a room or a cancelled booking, ask the restaurant or hotel
          you dealt with — their refund and cancellation terms apply, not ours. If you cannot reach them, write to{" "}
          <Mail to={COMPANY.grievanceEmail} /> and we will pass your request on and ask them to respond, but the decision
          and the money are theirs.
        </P>
        <P>
          And if you are a property: refund your guest from your gateway dashboard, then record it against the bill in{" "}
          {COMPANY.product} so your books and your GST agree with your bank.
        </P>
      </Section>

      <Section title="9. Changes">
        <P>
          We may change this policy. The version that applies to a payment is the one published when that payment was
          made. Material changes are announced by email and in the app at least 30 days beforehand.
        </P>
        <P>
          This policy forms part of the <Link href="/legal/terms" className="underline font-semibold">Terms of Service</Link>.
        </P>
      </Section>
    </Doc>
  );
}
