import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { Doc, Section, P, Bullets, Defs, Blank, Us, Mail } from "../Doc";

export const metadata = {
  title: "Terms of Service",
  description: "The agreement between DineFlow and the restaurants, hotels and resorts that use it.",
};

export default function Terms() {
  return (
    <Doc title="Terms of Service"
      intro={`These terms govern your use of ${COMPANY.product}. By opening an account, or by using the software on behalf of a property, you agree to them.`}>

      <Section title="1. Who this agreement is between">
        <P>
          This is an agreement between <Us /> {COMPANY.entityType ? `(a ${COMPANY.entityType})` : <Blank what="entity type" />}
          {COMPANY.registrationNo ? <>, registration number <span className="num">{COMPANY.registrationNo}</span></> : null}, whose registered
          office is at {COMPANY.registeredAddress ? <span className="whitespace-pre-line">{COMPANY.registeredAddress}</span> : <Blank what="registered address" />}
          {" "}(&ldquo;{COMPANY.product}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), and the business that has opened an account (&ldquo;you&rdquo;, &ldquo;the property&rdquo;).
        </P>
        <P>
          If you are accepting these terms on behalf of a company, partnership or proprietorship, you confirm you are
          authorised to bind it. If you are not, you must not open the account.
        </P>
      </Section>

      <Section title="2. What the words mean">
        <Defs rows={[
          ["The Service", <>The {COMPANY.product} software: the web application, the installable app, the kitchen display, the storefront and guest ordering pages, the printing bridge, and any API we publish.</>],
          ["Property", "The restaurant, hotel or resort whose account it is. One account covers one property unless we agree otherwise in writing."],
          ["Your Data", "Everything you or your staff enter or generate in the Service — menus, orders, bills, invoices, stock counts, staff records, guest and customer records."],
          ["Guest", "A person who eats, stays or orders at your property. They are your customer, not ours."],
          ["Subscription", "The paid right to use the Service for a period, at the plan you chose."],
        ]} />
      </Section>

      <Section title="3. Your account">
        <Bullets items={[
          "You are responsible for everything done under your account, including by your staff. Give each person their own login; do not share one.",
          "Keep credentials secret. Tell us at once, at " + COMPANY.supportEmail + ", if you believe an account has been compromised.",
          "You must be at least 18 and legally able to enter a contract.",
          "The details you give us — the property's name, address, GSTIN, FSSAI number and contact details — must be accurate and kept up to date. Tax invoices and compliance records the Service produces are built from them, and wrong details make those documents wrong.",
        ]} />
      </Section>

      <Section title="4. Trial, subscription and renewal">
        <Bullets items={[
          "A new property may be given a free trial. At the end of it the account is locked until a subscription is active. Your Data is not deleted when an account locks.",
          "Subscriptions run for the period stated on your plan and renew for the same period unless you cancel before the renewal date.",
          <>Cancellation and refunds are dealt with in the <Link href="/legal/refunds" className="underline font-semibold">Refund &amp; Cancellation Policy</Link>, which forms part of these terms.</>,
          "We may change prices. A change takes effect at your next renewal and we will tell you at least 30 days beforehand. If you do not accept it, you may cancel before that renewal.",
        ]} />
      </Section>

      <Section title="5. Fees, taxes and invoices">
        <Bullets items={[
          "Fees are in Indian Rupees and are exclusive of GST unless stated otherwise. GST is charged at the rate in force.",
          <>We raise a tax invoice for each subscription payment against our GSTIN {COMPANY.gstin ? <span className="num">{COMPANY.gstin}</span> : <Blank what="GSTIN" />}. Give us your GSTIN if you want to claim input credit.</>,
          "Payments are taken through Razorpay. We do not see or store your full card number.",
          "If a payment fails we may retry it and may suspend the account until it succeeds.",
        ]} />
      </Section>

      <Section title="6. Money your guests pay you">
        <P>
          This is worth stating plainly, because it is the part most often misunderstood. When a guest pays a bill
          through a {COMPANY.product} payment link, <b>that money goes to you, not to us</b>. The transaction runs on your own
          payment gateway account, using keys you supplied, and settles to your bank account under your own agreement
          with that gateway.
        </P>
        <P>
          We are not a party to it. We are not the merchant, the seller or the payee. Refunds, chargebacks, failed
          settlements and disputes about food, rooms or service are between you and your guest, and between you and your
          gateway. We will help you find the records in the Service, and that is the extent of our role.
        </P>
      </Section>

      <Section title="7. Your data stays yours">
        <Bullets items={[
          "You own Your Data. We claim no ownership of it.",
          "You grant us only the licence we need to run the Service for you: to store it, back it up, transmit it, display it to your staff, and process it to produce the reports, bills and documents you ask for.",
          "We do not sell Your Data. We do not use the contents of your orders, guests or menus to advertise to anyone.",
          "We may use aggregated, de-identified statistics — figures that cannot reasonably be traced to your property or to any person — to improve the Service.",
          <>Where the Service offers to share figures with nearby properties, that is off unless you switch it on, and you choose what is shared. How it works is set out in the <Link href="/legal/privacy" className="underline font-semibold">Privacy Policy</Link>.</>,
          "You can export Your Data while your subscription is live. Ask us and we will give you a copy in a common format.",
        ]} />
      </Section>

      <Section title="8. Guest and customer records">
        <P>
          When you record a guest, a customer or a staff member in the Service, you are the one deciding why that
          information is collected and what it is used for. In the language of the Digital Personal Data Protection Act,
          2023, you are the Data Fiduciary for it and we are a Data Processor acting on your instructions.
        </P>
        <P>
          That means you are responsible for telling those people what you collect and why, for having a lawful basis to
          collect it, and for answering them when they ask to see, correct or erase it. We will help you do that — we
          will act on your instructions, and we will not use those records for our own purposes.
        </P>
      </Section>

      <Section title="9. What you must not do">
        <Bullets items={[
          "Use the Service to break the law, including tax, food safety, labour and data protection law.",
          "Produce false invoices, false stock records or false attendance records.",
          "Resell, sublicense or white-label the Service without our written agreement.",
          "Copy, decompile or reverse engineer the software, except to the extent the law says you may.",
          "Probe, scan or overload the Service, or try to reach another property's data. Every account is separated at the database, and attempts to cross that line are logged.",
          "Upload malware, or content you have no right to upload.",
        ]} />
        <P>We may suspend an account immediately where we reasonably believe one of these is happening and the risk is serious.</P>
      </Section>

      <Section title="10. Things the Service depends on">
        <P>
          The Service runs on third parties, and they have their own terms: hosting and database (Supabase, Vercel),
          payments (Razorpay), and, where you switch on the assistant features, an AI provider. Delivery aggregators,
          channel managers and printers you connect are yours, not ours.
        </P>
        <P>
          We choose these carefully, but we do not control them. An outage or a change at one of them can interrupt the
          Service, and we are not liable for their acts beyond our own duty to act reasonably in choosing and managing them.
        </P>
      </Section>

      <Section title="11. Availability, support and changes">
        <Bullets items={[
          `We aim to keep the Service available at all times and support it ${COMPANY.supportHours}, but we do not promise uninterrupted service.`,
          "We may take the Service down for maintenance. Where we can plan it, we will do it outside normal service hours and tell you first.",
          "The Service is designed to keep taking orders when the internet drops, and to send them when it returns. That is a genuine feature, not a guarantee: a device that is wiped, reinstalled or lost before it reconnects can lose what was queued on it.",
          "We improve the Service continually. We may add, change or withdraw features. We will not materially reduce what your plan does without telling you first.",
        ]} />
      </Section>

      <Section title="12. Suspension and ending the agreement">
        <Bullets items={[
          "You may cancel at any time from the membership screen or by writing to us.",
          "We may suspend or end the agreement if you materially break these terms and do not put it right within 14 days of us asking, or immediately in the serious cases in clause 9.",
          "We may end the agreement for convenience on 30 days' notice, and will refund the unused part of any period you have paid for.",
          "For 60 days after an account ends you may ask for an export of Your Data. After that we may delete it, except where the law requires us to keep records for longer.",
        ]} />
      </Section>

      <Section title="13. Our intellectual property">
        <P>
          The Service, its software, its design and its name belong to us or to our licensors. These terms give you a
          limited, non-exclusive, non-transferable right to use it while your subscription is live, and nothing more.
          Feedback you send us we may use freely, without obligation to you.
        </P>
      </Section>

      <Section title="14. Warranties and what we do not promise">
        <P>
          We will provide the Service with reasonable care and skill. Beyond that, and to the extent the law allows, the
          Service is provided as it is. We do not warrant that it will be error-free, that it will meet every requirement
          you have, or that its forecasts, suggestions and assistant answers will be correct.
        </P>
        <P>
          <b>The Service helps you keep records. It is not an accountant, a lawyer or a food safety inspector.</b> Tax
          returns, GST filings, statutory registers and compliance with FSSAI and labour law remain yours. Check what the
          Service produces before you rely on it or file it.
        </P>
      </Section>

      <Section title="15. Liability">
        <P>
          Nothing here limits liability for death or personal injury caused by negligence, for fraud, or for anything
          else the law does not allow to be limited.
        </P>
        <P>
          Subject to that: neither of us is liable to the other for loss of profit, loss of business, loss of goodwill or
          any indirect or consequential loss. Our total liability arising out of this agreement in any twelve-month
          period is limited to the fees you paid us in the twelve months before the claim arose.
        </P>
      </Section>

      <Section title="16. Indemnity">
        <P>
          You will indemnify us against claims brought by a third party — including your guests, your staff and a tax or
          regulatory authority — that arise from Your Data, from how you use the Service, or from your failure to meet an
          obligation in clause 8, except to the extent the claim is caused by our own breach of this agreement.
        </P>
      </Section>

      <Section title="17. Confidentiality">
        <P>
          Each of us will keep the other&rsquo;s confidential information confidential, use it only for this agreement, and
          protect it at least as carefully as our own. This does not apply to information that is public through no fault
          of the receiver, was already known, or must be disclosed by law.
        </P>
      </Section>

      <Section title="18. Force majeure">
        <P>
          Neither of us is liable for a failure caused by something genuinely outside our control — including a failure
          of the public internet, a power grid failure, a natural disaster, or an act of government — for as long as it lasts.
        </P>
      </Section>

      <Section title="19. Changes to these terms">
        <P>
          We may change these terms. If a change materially affects you we will give at least 30 days&rsquo; notice by email
          and in the app. Continuing to use the Service after a change takes effect means you accept it; if you do not,
          you may cancel before it does.
        </P>
      </Section>

      <Section title="20. Governing law and disputes">
        <P>
          This agreement is governed by the laws of {COMPANY.governingLaw}. Before starting proceedings, both of us will
          try in good faith to settle a dispute by talking, beginning with a written notice to the grievance officer below.
          If that fails within 30 days, the courts at {COMPANY.jurisdiction} have exclusive jurisdiction.
        </P>
      </Section>

      <Section title="21. Grievance Officer">
        <P>
          In accordance with the Information Technology Act, 2000 and the rules made under it, the Grievance Officer is{" "}
          {COMPANY.grievanceOfficer ? <b>{COMPANY.grievanceOfficer}</b> : <Blank what="grievance officer name" />}, reachable at{" "}
          <Mail to={COMPANY.grievanceEmail} />
          {COMPANY.phone ? <> or <span className="num">{COMPANY.phone}</span></> : null}. Complaints are acknowledged within 48 hours
          and resolved within {COMPANY.grievanceDays} days.
        </P>
        <P>
          Postal address: {COMPANY.registeredAddress ? <span className="whitespace-pre-line">{COMPANY.registeredAddress}</span> : <Blank what="registered address" />}
        </P>
      </Section>

      <Section title="22. General">
        <Bullets items={[
          "If a clause is unenforceable, the rest stands.",
          "Not enforcing a right once does not waive it.",
          "You may not assign this agreement without our consent. We may assign it to a buyer of our business.",
          "Nothing here makes either of us the other's partner, agent or employee.",
          <>These terms, together with the <Link href="/legal/privacy" className="underline font-semibold">Privacy Policy</Link> and the <Link href="/legal/refunds" className="underline font-semibold">Refund &amp; Cancellation Policy</Link>, are the whole agreement between us.</>,
        ]} />
      </Section>

      <Section title="Questions">
        <P>
          Write to <Mail to={COMPANY.supportEmail} />, or see the <Link href="/legal/contact" className="underline font-semibold">contact page</Link>.
        </P>
      </Section>
    </Doc>
  );
}
