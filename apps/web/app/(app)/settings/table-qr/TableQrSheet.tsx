"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button, Card, Empty } from "@/components/ui";
import { QR } from "@/components/QR";

type T = { id: string; name: string; zone: string; qr_token: string | null };

/** The codes, laid out to print: A4 gets six a page, each with the table's name under it. */
export function TableQrSheet({ tables, slug, name }: { tables: T[]; slug: string | null; name: string }) {
  const [origin, setOrigin] = useState(""); useEffect(() => setOrigin(window.location.origin), []);
  if (!slug) return <Empty title="Give the property a web address first" hint="The code opens your menu at a link like dineflow.app/dine/your-name. Set the name under Settings → Storefront." action={<Link href="/settings/storefront"><Button>Storefront settings</Button></Link>} />;
  if (!tables.length) return <Empty title="No tables yet" hint="Add tables under Settings → Tables; each one gets a code of its own." action={<Link href="/settings"><Button>Settings</Button></Link>} />;
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-steel flex-1 min-w-[16rem]">A guest scans the code, sees the menu on their phone, and the order lands on that table — in Online orders, or straight in the kitchen when the website channel accepts on its own (Channels). Print, cut, and stand one on each table.</p>
        <Button onClick={() => window.print()}><Printer size={16} /> Print</Button>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 print:grid-cols-2">
        {tables.map((t) => {
          const url = `${origin}/dine/${slug}?t=${t.qr_token ?? ""}`;
          return (
            <Card key={t.id} className="text-center break-inside-avoid print:border print:border-black print:shadow-none print:rounded-none">
              <div className="text-[11px] uppercase tracking-[0.18em] text-steel">{name}</div>
              <div className="font-display text-3xl mt-1">Table {t.name}</div>
              <div className="text-xs text-steel">{t.zone}</div>
              <div className="my-3 flex justify-center">{origin && t.qr_token ? <QR value={url} size={168} /> : <div className="h-[168px] w-[168px] shimmer" />}</div>
              <div className="text-sm font-semibold">Scan to see the menu &amp; order</div>
              <div className="text-[10px] text-steel break-all mt-1 print:hidden">{url}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
