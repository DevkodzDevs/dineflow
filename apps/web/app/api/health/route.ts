/** A byte the offline layer can ping to tell a real connection from a browser that hasn't noticed yet. */
export const dynamic = "force-dynamic";
export function GET() { return new Response("ok", { headers: { "cache-control": "no-store" } }); }
