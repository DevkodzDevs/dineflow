/**
 * True for an address a server-side fetch must never reach: loopback, the private ranges, link-local
 * (the cloud metadata address lives there), carrier-grade NAT, multicast and reserved space — and
 * their IPv6 forms, including an IPv4 address written as IPv6 (::ffff:10.0.0.1).
 *
 * Checked against every address a host name resolves to, not just the name as typed: a feed URL like
 * https://10.0.0.5.nip.io reads as a public name and resolves to a private address.
 */
export function privateAddr(ip: string): boolean {
  if (ip.includes(":")) {
    const x = ip.toLowerCase();
    return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:") || x.startsWith("64:ff9b");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
