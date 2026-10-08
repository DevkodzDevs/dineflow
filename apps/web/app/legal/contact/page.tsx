import Link from "next/link";
import { Mail as MailIcon, Phone, MapPin, Clock, ShieldAlert, LifeBuoy, Building2, Receipt } from "lucide-react";
import { COMPANY } from "@/lib/company";
import { Doc, Section, P, Bullets, Blank, Us, Mail } from "../Doc";

export const metadata = {
  title: "Contact us",
  description: `How to reach ${COMPANY.product} — support, billing, privacy and grievances.`,
};

export default function Contact() {
  return (
    <Doc title="Contact us"
      intro={`Who to write to, what they answer, and how long it takes. A real person reads every one of these.`}>

      <Section title="Where to write">
        <div className="grid sm:grid-cols-2 gap-3">
          <Card icon={<LifeBuoy size={16} />} title="Support"
            lines={["Anything about using the app — a screen behaving oddly, a printer that will not print, a figure that looks wrong."]}
            action={<Mail to={COMPANY.supportEmail} />} note={`Answered ${COMPANY.supportHours}`} />
          <Card icon={<MailIcon size={16} />} title="Billing"
            lines={["Subscriptions, invoices, GST, refunds and cancellations."]}
            action={<Mail to={COMPANY.supportEmail} />} note="Acknowledged within 48 hours" />
          <Card icon={<ShieldAlert size={16} />} title="Privacy"
            lines={["To see, correct or erase personal data, or to withdraw a consent."]}
            action={<Mail to={COMPANY.privacyEmail} />} note="Answered within 30 days" />
          <Card icon={<ShieldAlert size={16} />} title="Grievances"
            lines={["If an answer you were given does not settle the matter."]}
            action={<Mail to={COMPANY.grievanceEmail} />} note={`Resolved within ${COMPANY.grievanceDays} days`} />
        </div>
      </Section>

      <Section title="By telephone">
        <P>
          {COMPANY.phone
            ? <>Ring <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="num font-semibold underline">{COMPANY.phone}</a>, {COMPANY.supportHours}.</>
            : <>A support telephone number has not been set. <Blank what="support telephone" /> Add it in <code className="num text-xs">apps/web/lib/company.ts</code> — a contact page without one will not pass a payment gateway&rsquo;s review.</>}
        </P>
      </Section>

      <Section title="The business">
        <div className="rounded-2xl border border-line divide-y divide-line">
          <Row icon={<MapPin size={15} />} label="Registered office"
            value={COMPANY.registeredAddress
              ? <span className="whitespace-pre-line">{COMPANY.registeredAddress}</span>
              : <Blank what="registered address" />} />
          <Row icon={<Building2 size={15} />} label="Registered name"
            value={COMPANY.legalName ? <>{COMPANY.legalName}{COMPANY.entityType ? ` · ${COMPANY.entityType}` : ""}</> : <Blank what="registered name" />} />
          {COMPANY.registrationNo && <Row icon={<Building2 size={15} />} label="Registration no." value={<span className="num">{COMPANY.registrationNo}</span>} />}
          <Row icon={<Receipt size={15} />} label="GSTIN"
            value={COMPANY.gstin ? <span className="num">{COMPANY.gstin}</span> : <Blank what="GSTIN" />} />
          <Row icon={<Phone size={15} />} label="Telephone"
            value={COMPANY.phone ? <span className="num">{COMPANY.phone}</span> : <Blank what="support telephone" />} />
          <Row icon={<Clock size={15} />} label="Support hours" value={COMPANY.supportHours} />
        </div>
      </Section>

      <Section title="Grievance Officer">
        <P>
          As required by the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023, the
          Grievance Officer for <Us /> is{" "}
          {COMPANY.grievanceOfficer ? <b>{COMPANY.grievanceOfficer}</b> : <Blank what="grievance officer name" />}.
        </P>
        <Bullets items={[
          <>By email: <Mail to={COMPANY.grievanceEmail} /></>,
          COMPANY.phone ? <>By telephone: <span className="num">{COMPANY.phone}</span>, {COMPANY.supportHours}</> : <>By telephone: <Blank what="support telephone" /></>,
          <>By post: {COMPANY.registeredAddress ? <span className="whitespace-pre-line">{COMPANY.registeredAddress}</span> : <Blank what="registered address" />}</>,
        ]} />
        <P>
          Complaints are acknowledged within 48 hours and resolved within {COMPANY.grievanceDays} days. If you are not
          satisfied with the outcome of a privacy complaint you may take it to the Data Protection Board of India.
        </P>
      </Section>

      <Section title="If you are a guest, not a property">
        <P>
          If you ate or stayed somewhere that uses {COMPANY.product} and you want a refund, a bill explained, or your
          details corrected or removed, ask <b>that restaurant or hotel</b> — the records are theirs and so is the
          decision. We only store them on the property&rsquo;s behalf.
        </P>
        <P>
          If you cannot reach them, write to <Mail to={COMPANY.grievanceEmail} /> and we will pass it on and press for an
          answer. The reasoning is set out in the{" "}
          <Link href="/legal/privacy" className="underline font-semibold">Privacy Policy</Link> and the{" "}
          <Link href="/legal/refunds" className="underline font-semibold">Refund Policy</Link>.
        </P>
      </Section>
    </Doc>
  );
}

const Card = ({ icon, title, lines, action, note }: { icon: React.ReactNode; title: string; lines: string[]; action: React.ReactNode; note: string }) => (
  <div className="rounded-2xl border border-line p-4">
    <div className="flex items-center gap-2 font-semibold text-ink"><span className="text-steel">{icon}</span> {title}</div>
    {lines.map((l, i) => <p key={i} className="text-sm text-steel mt-1.5 leading-relaxed">{l}</p>)}
    <div className="mt-2.5 text-sm">{action}</div>
    <div className="text-[11px] text-steel mt-1">{note}</div>
  </div>
);

const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="grid sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-3">
    <div className="flex items-center gap-2 font-semibold text-ink"><span className="text-steel shrink-0">{icon}</span> {label}</div>
    <div className="text-steel">{value}</div>
  </div>
);
