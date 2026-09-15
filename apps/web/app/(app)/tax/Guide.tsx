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
        <P>Rates, thresholds and dates below follow the notifications in force at the time of writing, including the GST Council's rate changes effective 22 September 2025. They change by notification. Nothing here replaces your Chartered Accountant; it exists so that you know what to ask, and so the numbers you hand over are already in the shape a return needs.</P>
        <P>Portals: <Portal href="https://www.gst.gov.in">GST</Portal> · <Portal href="https://www.incometax.gov.in">Income tax</Portal> · <Portal href="https://foscos.fssai.gov.in">FSSAI (FoSCoS)</Portal> · <Portal href="https://einvoice1.gst.gov.in">e-Invoice</Portal> · <Portal href="https://unifiedportal-emp.epfindia.gov.in">EPFO</Portal> · <Portal href="https://www.esic.gov.in">ESIC</Portal></P>
      </div>

      <div className="card p-6">
        <H>1 · Registering for GST</H>
        <P>Registration is compulsory once aggregate turnover in a financial year crosses ₹20 lakh for services (₹10 lakh in the special-category states of the north-east and hills). Restaurants that also sell packaged goods count both. Register voluntarily below the threshold if your customers want input credit or if you supply to companies.<Ref>Sec 22, 23, 24 CGST Act</Ref></P>
        <P>Two schemes exist. <b>Regular</b>: you charge GST on every bill, file monthly or quarterly, and may claim input credit where the rate allows it. <b>Composition</b>: available up to ₹1.5 crore turnover; restaurants pay a flat 5% of turnover, cannot charge GST to customers, cannot claim input credit, cannot supply outside the state, and issue a <i>bill of supply</i> rather than a tax invoice.<Ref>Sec 10 · Rule 5 to 7</Ref></P>
        <P>Orders through Swiggy, Zomato and similar platforms: since 1 January 2022 the platform itself pays the GST on restaurant services made through it, and you show those sales as supplies through an e-commerce operator, not as your own taxable sales.<Ref>Sec 9(5) · Notification 17/2021-CT(R)</Ref></P>
      </div>

      <div className="card p-6">
        <H>2 · The rates that apply to you</H>
        <div className="table-wrap"><table className="w-full text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--color-label-2)] border-b border-[var(--color-separator)]"><tr><th className="text-left py-2">Supply</th><th className="text-left py-2">SAC</th><th className="text-right py-2">Rate</th><th className="text-left py-2 pl-4">Input credit</th></tr></thead>
          <tbody>{GST_RATES.map((r, i) => <tr key={i} className="border-b border-[var(--color-separator)]/60"><td className="py-2 pr-3">{r.what}{r.note && <div className="text-xs text-[var(--color-label-3)]">{r.note}</div>}</td><td className="py-2 num">{r.sac || "—"}</td><td className="py-2 text-right num">{r.rate === null ? "n/a" : `${r.rate}%`}</td><td className="py-2 pl-4">{r.rate === null ? "—" : r.itc ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
        <P>The rate is split equally: 5% is 2.5% CGST + 2.5% SGST (UTGST in a Union Territory without a legislature). Both halves print separately on the bill. IGST arises only on an inter-state supply, which a restaurant or hotel serving guests on its premises does not make: the place of supply is where the premises are.<Ref>Sec 8, 9 · Sec 12(3) IGST Act</Ref></P>
        {hotel && <P>For a hotel the room tariff decides the rate for the whole property: if any room is priced above ₹7,500 a night, the restaurant inside becomes 18% with credit. Declared tariff was replaced by the value actually charged; a seasonal price above ₹7,500 moves the rate for that supply.<Ref>Notification 20/2019-CT(R) as amended</Ref></P>}
        <P>Alcohol is outside GST entirely and carries state VAT and excise. A bar keeps a separate VAT registration and the liquor lines never enter the GST return.</P>
      </div>

      <div className="card p-6">
        <H>3 · What every bill must show</H>
        <P>A registered regular dealer issues a <b>tax invoice</b> for each supply. DineFlow prints these on every paid bill and on the invoices it generates:</P>
        <ul className="text-sm text-[var(--color-label-2)] space-y-1 list-disc pl-5">{INVOICE_MUST_SHOW.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <P>Restaurant service is SAC <span className="num">{SAC.restaurant}</span>, accommodation is <span className="num">{SAC.accommodation}</span>. A composition dealer prints a <b>bill of supply</b> instead, without any tax line, carrying the words: <i>&ldquo;{COMPOSITION_NOTE}&rdquo;</i>.<Ref>Rule 46, 49</Ref></P>
        <P>A registered guest who wants input credit needs their GSTIN on the invoice; Billing asks for it when you raise the tax invoice. Keep the serial numbers unbroken through the year.<Ref>Rule 46(b)</Ref></P>
        <P><b>e-Invoicing</b> applies once turnover in any year since 2017-18 crossed ₹5 crore: each B2B invoice is registered on the Invoice Registration Portal and carries its IRN and QR. B2C bills are unaffected.<Ref>Rule 48(4) · Notification 10/2023-CT</Ref></P>
      </div>

      <div className="card p-6">
        <H>4 · Returns and when they fall due</H>
        <P><b>Regular, monthly</b> (the default): GSTR-1 by the 11th of the next month with every sale, B2B invoice by invoice; GSTR-3B by the 20th with the tax paid. <b>Regular, quarterly</b> (QRMP, allowed up to ₹5 crore): GSTR-1 by the 13th after the quarter, GSTR-3B by the 22nd (southern and western states) or 24th, with monthly tax by challan by the 25th. <b>Composition</b>: CMP-08 by the 18th after each quarter, and GSTR-4 for the year by 30 June.<Ref>Sec 37, 39 · Rule 59, 61, 62</Ref></P>
        <P><b>Annual</b>: GSTR-9 by 31 December, optional below ₹2 crore turnover; GSTR-9C, the self-certified reconciliation with the audited accounts, above ₹5 crore.<Ref>Sec 44 · Rule 80</Ref></P>
        <P>The Calendar tab lists each of these for your scheme with its date, and the Returns tab gives the figures for the month in the rows GSTR-1 and GSTR-3B want. Late filing costs ₹50 a day (₹20 for a nil return) plus 18% interest on tax paid late.<Ref>Sec 47, 50</Ref></P>
      </div>

      <div className="card p-6">
        <H>5 · Income tax, the audit and your CA</H>
        <P>A <b>tax audit</b> under section 44AB is compulsory when turnover crosses ₹1 crore, raised to ₹10 crore where cash receipts and cash payments are each under 5% of the total. Your CA files Form 3CA (companies) or 3CB (others) together with the particulars in Form 3CD by 30 September; the return itself then falls due on 31 October. Without an audit the return is due 31 July.<Ref>Sec 44AB, 139(1)</Ref></P>
        <P>Businesses under ₹2 crore may opt for <b>presumptive tax</b> at 8% of turnover (6% for digital receipts), which removes the audit and the books requirement; it is rarely right for a restaurant with real margins, but ask.<Ref>Sec 44AD</Ref></P>
        <P><b>Advance tax</b> is paid in four instalments, 15 June, 15 September, 15 December and 15 March, cumulatively 15%, 45%, 75% and 100% of the year's estimate, once the year's liability exceeds ₹10,000.<Ref>Sec 208, 211</Ref></P>
        <P><b>TDS</b> you may have to deduct: 10% on rent above ₹6 lakh a year (section 194-I), 1% or 2% on contractor bills (194C), and on salaries above the slab (192). Deposit by the 7th of the next month and file the quarterly statement.<Ref>Sec 192, 194C, 194-I</Ref></P>
        <P>The Profile tab holds your CA's name, firm, ICAI membership number and contact, so anyone at the counter knows who to call, and the Documents tab keeps the signed 3CD and the ITR acknowledgement where they can be found.</P>
      </div>

      <div className="card p-6">
        <H>6 · Records, and how long to keep them</H>
        <P>Keep for {RECORD_KEEPING.years}.<Ref>{RECORD_KEEPING.ref}</Ref></P>
        <ul className="text-sm text-[var(--color-label-2)] space-y-1 list-disc pl-5">{RECORD_KEEPING.keep.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <P>Proof of business seals each month's figures with a hash so a bank, a buyer or an officer can verify them later; Reports and the Pantry hold the sales and stock registers.</P>
      </div>

      <div className="card p-6">
        <H>7 · Licences beyond tax</H>
        <P><b>FSSAI</b>: every food business holds a registration (turnover under ₹12 lakh) or a state or central licence above it, renewed before expiry, its number printed on bills. <b>Shops &amp; Establishments</b> registration with the state labour department once you employ anyone. <b>Trade licence</b> from the corporation, yearly. <b>Fire NOC</b> for hotels and larger dining rooms. <b>Liquor licence</b> from state excise if you serve alcohol. <b>Professional tax</b> where your state levies it (Tamil Nadu: half-yearly, to the local body).</P>
        <P><b>EPF</b> applies from 20 employees, 12% each side on basic pay, deposited by the 15th. <b>ESI</b> from 10 employees where wages are up to ₹21,000 a month, 0.75% employee and 3.25% employer, also by the 15th. The Documents tab tracks each certificate's expiry and warns you sixty days ahead.</P>
      </div>
    </div>
  );
}
