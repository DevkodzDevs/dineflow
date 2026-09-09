"use client";
/** Sends ESC/POS bytes to a printer over Bluetooth, USB, the network bridge, or the browser dialog. */
export type Transport = "bluetooth" | "usb" | "network" | "browser";
export type PrinterCfg = { id: string; name: string; transport: Transport; width: number; address?: string | null; copies?: number };

const chunk = (b: Uint8Array, n = 180) => { const out: Uint8Array[] = []; for (let i = 0; i < b.length; i += n) out.push(b.slice(i, i + n)); return out; };
const btCache = new Map<string, BluetoothRemoteGATTCharacteristic>();
const usbCache = new Map<string, USBDevice>();

/** Common BLE printer service UUIDs (Goojprt, Xprinter, Rongta, Epson TM-P, Bixolon…). */
const BT_SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455", "0000ff00-0000-1000-8000-00805f9b34fb"];

export async function printBluetooth(bytes: Uint8Array, key = "default") {
  const nav = navigator as Navigator & { bluetooth?: { requestDevice: (o: unknown) => Promise<BluetoothDevice> } };
  if (!nav.bluetooth) throw new Error("This browser has no Bluetooth. Use Chrome on Android/Windows, or choose Network/Browser printing.");
  let ch = btCache.get(key);
  if (!ch || !ch.service.device.gatt?.connected) {
    const dev = await nav.bluetooth.requestDevice({ filters: BT_SERVICES.map((s) => ({ services: [s] })).concat([{ namePrefix: "Print" }, { namePrefix: "POS" }, { namePrefix: "BT" }] as never), optionalServices: BT_SERVICES });
    const gatt = await dev.gatt!.connect();
    let found: BluetoothRemoteGATTCharacteristic | undefined;
    for (const s of BT_SERVICES) { try { const svc = await gatt.getPrimaryService(s); const cs = await svc.getCharacteristics(); found = cs.find((c) => c.properties.write || c.properties.writeWithoutResponse); if (found) break; } catch { /* next */ } }
    if (!found) throw new Error("Paired, but no printable characteristic found on this device.");
    ch = found; btCache.set(key, ch);
  }
  for (const part of chunk(bytes)) { const buf = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer; await (ch.properties.writeWithoutResponse ? ch.writeValueWithoutResponse(buf) : ch.writeValue(buf)); await new Promise((r) => setTimeout(r, 20)); }
}

export async function printUsb(bytes: Uint8Array, key = "default") {
  const nav = navigator as Navigator & { usb?: { requestDevice: (o: unknown) => Promise<USBDevice> } };
  if (!nav.usb) throw new Error("This browser has no WebUSB. Use Chrome on desktop/Android.");
  let dev = usbCache.get(key);
  if (!dev) { dev = await nav.usb.requestDevice({ filters: [{ classCode: 7 }, { vendorId: 0x04b8 }, { vendorId: 0x0519 }, { vendorId: 0x0416 }, { vendorId: 0x0483 }, { vendorId: 0x1fc9 }] }); usbCache.set(key, dev); }
  if (!dev.opened) await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  const iface = dev.configuration!.interfaces.find((i) => i.alternate.interfaceClass === 7) ?? dev.configuration!.interfaces[0];
  try { await dev.claimInterface(iface.interfaceNumber); } catch { /* already claimed */ }
  const ep = iface.alternate.endpoints.find((e) => e.direction === "out")!;
  for (const part of chunk(bytes, 4096)) await dev.transferOut(ep.endpointNumber, part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer);
}

/** Network printers (port 9100) via the small bridge that ships with DineFlow: `node scripts/print-bridge.mjs`. */
export async function printNetwork(bytes: Uint8Array, address: string, bridge = "http://localhost:9110") {
  const res = await fetch(`${bridge}/print`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-printer": address }, body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  if (!res.ok) throw new Error(`Print bridge said ${res.status}. Is it running? (node scripts/print-bridge.mjs)`);
}

/** Last resort: render the receipt as HTML at the right paper width and open the print dialog. */
export function printBrowser(html: string, width = 80) {
  const w = window.open("", "_blank", "width=420,height=640"); if (!w) throw new Error("Popup blocked");
  w.document.write(`<html><head><title>Print</title><style>@page{size:${width}mm auto;margin:3mm}body{font:12px/1.35 ui-monospace,"Courier New",monospace;width:${width - 6}mm;margin:0}h1{font-size:16px;text-align:center;margin:0 0 2px}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:6px}.b{font-weight:700}hr{border:0;border-top:1px dashed #000;margin:4px 0}.big{font-size:15px;font-weight:700}</style></head><body>${html}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}<\/script></body></html>`);
  w.document.close();
}

export async function sendToPrinter(cfg: PrinterCfg, bytes: Uint8Array, htmlFallback?: string) {
  const copies = Math.max(1, cfg.copies ?? 1);
  for (let i = 0; i < copies; i++) {
    if (cfg.transport === "bluetooth") await printBluetooth(bytes, cfg.id);
    else if (cfg.transport === "usb") await printUsb(bytes, cfg.id);
    else if (cfg.transport === "network") await printNetwork(bytes, cfg.address ?? "");
    else if (htmlFallback) printBrowser(htmlFallback, cfg.width);
    else throw new Error("Browser printing needs the HTML version");
  }
}
