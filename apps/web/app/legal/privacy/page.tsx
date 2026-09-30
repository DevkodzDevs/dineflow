import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { Doc, Section, P, Bullets, Defs, Blank, Us, Mail } from "../Doc";

export const metadata = {
  title: "Privacy Policy",
  description: "What DineFlow collects, why, who it is shared with, and the rights you have over it.",
};

export default function Privacy() {
  return (
    <Doc title="Privacy Policy"
      intro={`What ${COMPANY.product} collects, why we hold it, who else sees it, and what you can ask us to do with it. Written to the Digital Personal Data Protection Act, 2023.`}>

      <Section title="1. Who is responsible for what">
        <P>
          There are two different relationships here, and they matter, because they decide who you ask when you want
          something changed or erased.
        </P>
        <Defs rows={[
          ["If you run a property", <>You signed up with us. For your own account details and how you use the Service, <Us /> is the Data Fiduciary — we decide why that information is held. Ask us.</>],
          ["If you are a guest or a customer", <>A restaurant or hotel recorded you in their own {COMPANY.product} account. <b>They</b> are the Data Fiduciary; we only store and process it for them, on their instructions. Ask the property you dealt with. If you cannot reach them, write to us and we will pass it on.</>],
          ["If you are staff at a property", "Your employer entered your record. They are the Data Fiduciary for it."],
        ]} />
      </Section>

      <Section title="2. What we collect, and why">
        <Defs rows={[
          ["Account", "Name, email address, telephone number, role and password (stored only as a one-way hash, never in readable form). To create and secure your account and to let you sign in."],
          ["Property", "Trading and legal name, address, telephone, GSTIN, PAN, FSSAI number, bank or gateway identifiers. To run the property in the Service and to produce valid tax invoices and compliance records."],
          ["Operational", "Orders, tickets, bills, invoices, table and room states, stock counts and movements, purchase orders, suppliers, attendance and wages. This is the working record of the business — it is why the Service exists."],
          ["Guests and customers", "Name, telephone, email, address, identity document type and the last four digits, stay and order history, preferences, loyalty points. Entered by the property to serve and bill the person."],
          ["Payments", "The amount, the method, the gateway's reference and the result. We never see or store a full card number or a UPI PIN — those go straight to the gateway."],
          ["Technical", "IP address, device and browser type, timestamps, and error diagnostics. To keep the Service secure, to find faults, and to detect abuse."],
          ["Assistant", "If you use the assistant features, the question you ask and the relevant figures from your own account are sent to an AI provider to answer it."],
        ]} />
        <P>
          We do not collect more than the above, we do not buy personal data from anyone, and we do not run advertising
          or advertising trackers.
        </P>
      </Section>

      <Section title="3. Identity documents">
        <P>
          Hotels are required to record a guest&rsquo;s identity. The Service is built to store the <b>type</b> of document and
          its <b>last four digits only</b> — never the full number, and never a scan or photograph of it. That is a
          deliberate design decision: the full number is a liability nobody needs to carry.
        </P>
        <P>
          If a property records a full identity number somewhere it does not belong — in a notes field, for instance —
          that is the property&rsquo;s doing and its responsibility. We advise strongly against it.
        </P>
      </Section>

      <Section title="4. On what basis we hold it">
        <Bullets items={[
          "To perform the contract with you — running the account you asked for.",
          "For the legitimate uses the DPDP Act allows, including keeping the Service secure and preventing fraud.",
          "To meet a legal obligation — tax and company law require certain records to be kept for a set number of years.",
          "With your consent, where consent is what the law requires. You may withdraw it, and withdrawing it is as easy as giving it.",
        ]} />
      </Section>

      <Section title="5. Who else sees it">
        <P>We share personal data only with the processors that make the Service work, and only as far as each needs:</P>
        <Defs rows={[
          ["Supabase", "Database, authentication and file storage. Your data is held in their Mumbai (ap-south-1) region, in India."],
          ["Vercel", "Hosts and serves the application."],
          ["Razorpay", "Processes card and UPI payments. Receives the payment details needed to take the payment."],
          ["An AI provider", "Only when you use the assistant. Receives the question and the figures needed to answer it. Off unless the feature is switched on for your server."],
          ["Delivery and channel partners", "Swiggy, Zomato, an OTA or a channel manager — only where you have connected them yourself, and only the order or booking data that connection needs."],
        ]} />
        <P>
          We may also disclose data where the law requires it, to a court or an authority acting within its powers, or
          to a buyer of our business — in which case this policy continues to apply until you are told otherwise.
        </P>
        <P><b>We do not sell personal data, and we never will.</b></P>
      </Section>

      <Section title="6. Sharing between nearby properties">
        <P>
          The Service can show a property anonymous, aggregated figures from other properties nearby — what ingredients
          are costing, where there is surplus stock, how busy the area is. This is <b>off unless a property switches it
          on</b>, each kind of sharing is a separate switch, and what leaves an account is a number, never a guest, a
          customer, an order or a staff record. No property can see another&rsquo;s rows.
        </P>
      </Section>

      <Section title="7. Where it is kept, and for how long">
        <Bullets items={[
          "Data is stored in India, in Supabase's Mumbai region.",
          "We keep operational records for as long as the account is live, and then for 60 days so you can export them.",
          "Tax and financial records — invoices, bills, GST data — are kept for 8 years, because the Income-tax Act and the GST law require it.",
          "Security and access logs are kept for 180 days.",
          "When a retention period ends, data is deleted or irreversibly anonymised.",
        ]} />
      </Section>

      <Section title="8. How it is protected">
        <Bullets items={[
          "Every connection is encrypted in transit (TLS), and data is encrypted at rest by our hosting provider.",
          "Passwords are stored as one-way hashes. Nobody at DineFlow can read your password.",
          "Every property's rows are separated at the database itself by row-level security, not merely by application code — so a bug in a screen cannot expose another property's data. This is tested.",
          "Staff access inside a property is limited by role; an owner decides what each person can open.",
          "Our own access to customer data is limited to the people who need it to support you, and administrative access to a property is recorded and shown in the app while it is happening.",
        ]} />
        <P>
          No system is perfectly secure. If a breach occurs that is likely to affect you, we will notify you and the Data
          Protection Board of India as the DPDP Act requires, without undue delay.
        </P>
      </Section>

      <Section title="9. Your rights">
        <P>Under the DPDP Act, 2023 you may ask us to:</P>
        <Bullets items={[
          "Tell you what personal data we hold about you and who it has been shared with.",
          "Correct anything inaccurate, complete anything incomplete, or update anything out of date.",
          "Erase personal data where it is no longer needed for the purpose it was collected for and no law requires us to keep it.",
          "Nominate someone to exercise these rights on your behalf if you die or become incapable.",
          "Withdraw a consent you gave.",
          "Raise a grievance — and if you are not satisfied with our answer, complain to the Data Protection Board of India.",
        ]} />
        <P>
          Write to <Mail to={COMPANY.privacyEmail} />. We answer within 30 days. We may need to confirm who you are
          first, so that we do not hand somebody&rsquo;s data to the wrong person.
        </P>
        <P>
          If a property recorded you as a guest, customer or staff member, ask that property first — they decide what
          happens to their records. Tell us and we will pass the request on and make sure it is acted on.
        </P>
      </Section>

      <Section title="10. Cookies and local storage">
        <P>
          We use no advertising or tracking cookies. What the Service stores on your device is only what it needs to work:
        </P>
        <Bullets items={[
          "A session cookie that keeps you signed in.",
          "Small preferences — the theme you chose, the kitchen station a screen is set to.",
          "An offline queue holding orders taken while the internet was down, so they can be sent when it returns.",
        ]} />
        <P>Clearing your browser data removes all of it, and will sign you out and discard anything still queued.</P>
      </Section>

      <Section title="11. Children">
        <P>
          The Service is for businesses and is not directed at children. We do not knowingly collect the personal data of
          anyone under 18 as a user. A property that records a child in a booking must have the consent of a parent or
          guardian, as the DPDP Act requires.
        </P>
      </Section>

      <Section title="12. Changes to this policy">
        <P>
          We will post any change here and update the date at the top. If a change materially affects your rights we will
          tell you by email and in the app at least 30 days beforehand.
        </P>
      </Section>

      <Section title="13. Contact and grievances">
        <P>
          For anything about privacy, write to <Mail to={COMPANY.privacyEmail} />.
        </P>
        <P>
          The Grievance Officer is {COMPANY.grievanceOfficer ? <b>{COMPANY.grievanceOfficer}</b> : <Blank what="grievance officer name" />}, at{" "}
          <Mail to={COMPANY.grievanceEmail} />{COMPANY.phone ? <> or <span className="num">{COMPANY.phone}</span></> : null}. We acknowledge
          within 48 hours and resolve within {COMPANY.grievanceDays} days.
        </P>
        <P>
          Postal address: {COMPANY.registeredAddress ? <span className="whitespace-pre-line">{COMPANY.registeredAddress}</span> : <Blank what="registered address" />}
        </P>
        <P>
          See also the <Link href="/legal/terms" className="underline font-semibold">Terms of Service</Link> and the{" "}
          <Link href="/legal/contact" className="underline font-semibold">contact page</Link>.
        </P>
      </Section>
    </Doc>
  );
}
