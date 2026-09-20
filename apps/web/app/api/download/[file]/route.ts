import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolveFile } from "@/lib/installers";

/**
 * Hands out an installer this machine has built. A route file may export only its handlers, so the
 * table of what exists lives in lib/installers.ts and is shared with the /get page.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const f = resolveFile(file);
  if (!f) return new Response("Not built on this machine yet.", { status: 404 });

  const stream = Readable.toWeb(createReadStream(f.full)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "content-type": f.type,
      "content-length": String(f.size),
      "content-disposition": `attachment; filename="${f.as}"`,
      "cache-control": "no-store",
    },
  });
}

export async function HEAD(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const f = resolveFile(file);
  return new Response(null, {
    status: f ? 200 : 404,
    headers: f ? { "content-length": String(f.size), "content-type": f.type } : {},
  });
}
