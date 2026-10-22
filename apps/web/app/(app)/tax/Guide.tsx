import { ExternalLink } from "lucide-react";
import { GST_RATES, INVOICE_MUST_SHOW, RECORD_KEEPING, COMPOSITION_NOTE, SAC } from "@dineflow/shared";

/**
 * The written guide: what the Indian rules ask of a restaurant, hotel or resort, in the order an
 * owner meets them. Plain language, with the section or rule named so a CA can check it.
 */
const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-xl mb-3">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-[var(--color-label-2)] leading-relaxed mb-2">{children}</p>;
const Ref = ({ children }: { children: React.ReactNode }) => <span className="num text-[11px] text-[var(--color-label-3)] ml-1">{children}</span>;
const Portal = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--color-tint)] hover:underline">{children} <ExternalLink size={11} /></a>;

export function Guide({ propertyType }: { propertyType: string }) {
  const hotel = propertyType !== "restaurant";
  return (
    <div className="space-y-4">
      <div className="card p-6">
        <H>Read this first</H>
        <P>Rules as of the 22 Sep 2025 GST rate changes; they can change. Your CA has the final word.</P>
        <P>Portals: <Portal href="https://www.gst.gov.in">GST</Portal> · <Portal href="https://www.incometax.gov.in">Income tax</Portal> · <Portal href="https://foscos.fssai.gov.in">FSSAI (FoSCoS)</Portal> · <Portal href="https://einvoice1.gst.gov.in">e-Invoice</Portal> · <Portal href="https://unifiedportal-emp.epfindia.gov.in">EPFO</Portal> · <Portal href="https://www.esic.gov.in">ESIC</Portal></P>
      </div>

      <div className="card p-6">
        <H>1 · Registering for GST</H>
        <P>Register once yearly turnover passes ₹20 lakh (₹10 lakh in north-east and hill states), packaged goods included. Below that it's optional.<Ref>Sec 22, 23, 24 CGST Act</Ref></P>
        <P>Two schemes. <b>Regular</b>: GST on every bill, file monthly or quarterly, claim input credit where allowed. <b>Composition</b>: up to ₹1.5 crore turnover; flat 5% of turnover, no GST on bills, no input credit, no sales outside the state; issue a <i>bill of supply</i>, not a tax invoice.<Ref>Sec 10 · Rule 5 to 7</Ref></P>
        <P>Swiggy, Zomato and similar apps pay GST on their orders (since 1 Jan 2022). Show them as e-commerce sales.<Ref>Sec 9(5) · Notification 17/2021-CT(R)</Ref></P>
      </div>

      <div className="card p-6">
        <H>2 · The rates that apply to you</H>
        <div className="table-wrap"><table className="w-full text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--color-label-2)] border-b border-[var(--color-separator)]"><tr><th className="text-left py-2">Supply</th><th className="text-left py-2">SAC</th><th className="text-right py-2">Rate</th><th className="text-left py-2 pl-4">Input credit</th></tr></thead>
          <tbody>{GST_RATES.map((r, i) => <tr key={i} className="border-b border-[var(--color-separator)]/60"><td className="py-2 pr-3">{r.what}{r.note && <div className="text-xs text-[var(--color-label-3)]">{r.note}</div>}</td><td className="py-2 num">{r.sac || "—"}</td><td className="py-2 text-right num">{r.rate === null ? "n/a" : `${r.rate}%`}</td><td className="py-2 pl-4">{r.rate === null ? "—" : r.itc ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
        <P>5% is 2.5% CGST + 2.5% SGST (UTGST in some Union Territories), printed separately. No IGST: guests are served in your state.<Ref>Sec 8, 9 · Sec 12(3) IGST Act</Ref></P>
        {hotel && <P>If any room is charged over ₹7,500 a night, even seasonally, the hotel's restaurant is 18% with credit.<Ref>Notification 20/2019-CT(R) as amended</Ref></P>}
        <P>Alcohol pays state VAT and excise, not GST — keep it off the GST return. A bar needs VAT registration.</P>
      </div>

      <div className="card p-6">
        <H>3 · What every bill must show</H>
        <P>A regular dealer issues a <b>tax invoice</b>. DineFlow prints these on every paid bill and invoice:</P>
        <ul className="text-sm text-[var(--color-label-2)] space-y-1 list-disc pl-5">{INVOICE_MUST_SHOW.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <P>Restaurant service is SAC <span className="num">{SAC.restaurant}</span>, accommodation is <span className="num">{SAC.accommodation}</span>. A composition dealer prints a <b>bill of supply</b> with no tax line, saying: <i>&ldquo;{COMPOSITION_NOTE}&rdquo;</i>.<Ref>Rule 46, 49</Ref></P>
        <P>For input credit, the guest's GSTIN goes on the invoice (Billing asks). No gaps in invoice numbers.<Ref>Rule 46(b)</Ref></P>
        <P><b>e-Invoicing</b>: if turnover passed ₹5 crore in any year since 2017-18, register each B2B invoice on the IRP (it gets an IRN and QR). Not for B2C bills.<Ref>Rule 48(4) · Notification 10/2023-CT</Ref></P>
      </div>

      <div className="card p-6">
        <H>4 · Returns and when they fall due</H>
        <P><b>Regular, monthly</b> (default): GSTR-1 (all sales) by the 11th of next month; GSTR-3B (tax paid) by the 20th. <b>Regular, quarterly</b> (QRMP, up to ₹5 crore): GSTR-1 by the 13th after the quarter; GSTR-3B by the 22nd (south and west states) or 24th; monthly tax by challan by the 25th. <b>Composition</b>: CMP-08 by the 18th after each quarter; GSTR-4 for the year by 30 June.<Ref>Sec 37, 39 · Rule 59, 61, 62</Ref></P>
        <P><b>Annual</b>: GSTR-9 by 31 December (optional below ₹2 crore). Above ₹5 crore, also GSTR-9C, matched to audited accounts.<Ref>Sec 44 · Rule 80</Ref></P>
        <P>Dates are in Calendar, GSTR-1 and GSTR-3B figures in Returns. Late: ₹50 a day (₹20 for nil) plus 18% interest on late tax.<Ref>Sec 47, 50</Ref></P>
      </div>

      <div className="card p-6">
        <H>5 · Income tax, the audit and your CA</H>
        <P>A <b>tax audit</b> (section 44AB) is a must above ₹1 crore turnover (₹10 crore if cash in and out are each under 5%). Your CA files Form 3CA/3CB with 3CD by 30 Sep; return due 31 Oct. No audit: return due 31 July.<Ref>Sec 44AB, 139(1)</Ref></P>
        <P>Under ₹2 crore (₹3 crore if cash receipts are within 5%), you may choose <b>presumptive tax</b>: 8% of turnover (6% for digital), no audit, no books. Rarely suits a restaurant — ask your CA.<Ref>Sec 44AD</Ref></P>
        <P><b>Advance tax</b> (if the year's tax is over ₹10,000): 15%, 45%, 75%, 100% by 15 Jun, 15 Sep, 15 Dec, 15 Mar.<Ref>Sec 208, 211</Ref></P>
        <P><b>TDS</b> to deduct: 10% on rent over ₹6 lakh a year (194-I), 1% or 2% on contractors (194C), salaries above the slab (192). Pay by the 7th of next month; file quarterly.<Ref>Sec 192, 194C, 194-I</Ref></P>
        <P>Your CA's details go in Profile. Keep the signed 3CD and ITR receipt in Documents.</P>
      </div>

      <div className="card p-6">
        <H>6 · Records, and how long to keep them</H>
        <P>Keep for {RECORD_KEEPING.years}.<Ref>{RECORD_KEEPING.ref}</Ref></P>
        <ul className="text-sm text-[var(--color-label-2)] space-y-1 list-disc pl-5">{RECORD_KEEPING.keep.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <P>Proof of business locks each month's figures. Sales register: Reports. Stock register: Pantry.</P>
      </div>

      <div className="card p-6">
        <H>7 · Licences beyond tax</H>
        <P><b>FSSAI</b>: registration under ₹12 lakh turnover, licence above; renew on time, print the number on bills. <b>Shops &amp; Establishments</b> registration once you hire anyone. <b>Trade licence</b> from the corporation, yearly. <b>Fire NOC</b> for hotels and larger dining rooms. <b>Liquor licence</b> from state excise if you serve alcohol. <b>Professional tax</b> where your state charges it (Tamil Nadu: half-yearly).</P>
        <P><b>EPF</b> from 20 staff: 12% each side on basic pay, by the 15th. <b>ESI</b> from 10 staff on pay up to ₹21,000 a month: 0.75% staff, 3.25% you, by the 15th. Documents warns 60 days before a certificate expires.</P>
      </div>
    </div>
  );
}
