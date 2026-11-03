"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button, Card, Empty } from "@/components/ui";
import { QR } from "@/components/QR";

type R = { id: string; number: string; floor: number | null; qr_token: string | null; room_types: { name: string } | null };

/** The room codes laid out to print, like the table codes: a card per room with its number, and how ordering works — the
 *  guest confirms their stay once with the last four digits of their phone, and the food goes on the room bill. */
export function RoomQrSheet({ rooms, slug, name }: { rooms: R[]; slug: string | null; name: string }) {
  const [origin, setOrigin] = useState(""); useEffect(() => setOrigin(window.location.origin), []);
  if (!slug) return <Empty title="No web address yet" hint="Settings → Storefront" action={<Link href="/settings/storefront"><Button>Storefront settings</Button></Link>} />;
  if (!rooms.length) return <Empty title="No rooms yet" hint="Add rooms first" action={<Link href="/rooms"><Button>Rooms</Button></Link>} />;
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-steel flex-1 min-w-[16rem]">One per room · food goes on the room bill</p>
        <Button onClick={() => window.print()}><Printer size={16} /> Print</Button>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 print:grid-cols-2" data-room-qr-grid>
        {rooms.map((r) => {
          const url = `${origin}/dine/${slug}?r=${r.qr_token ?? ""}`;
          return (
            <Card key={r.id} className="text-center break-inside-avoid min-w-0 print:border print:border-black print:shadow-none print:rounded-none" data-room-qr>
              <div className="text-[11px] uppercase tracking-[0.18em] text-steel truncate">{name}</div>
              <div className="font-display text-3xl mt-1">Room {r.number}</div>
              <div className="text-xs text-steel truncate">{r.room_types?.name ?? (r.floor != null ? `Floor ${r.floor}` : "")}</div>
              <div className="my-3 flex justify-center">{origin && r.qr_token ? <QR value={url} size={168} /> : <div className="h-[168px] w-[168px] shimmer" />}</div>
              <div className="text-sm font-semibold">Scan to order food to your room</div>
              <div className="text-[11px] text-steel mt-0.5">Added to your room bill · pay at check-out</div>
              <div className="text-[10px] text-steel break-all mt-1 print:hidden">{url}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
