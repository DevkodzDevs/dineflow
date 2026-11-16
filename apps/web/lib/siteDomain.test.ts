import { describe, it, expect } from "vitest";
import { bareHost, isOwnHost, domainRewrite } from "./siteDomain";

/** A client's own web address (0185 websites.domain): whose host is it, and which page answers. */
describe("a client's own domain", () => {
  it("a host is read bare: lower case, no port; anything odd is nothing", () => {
    expect(bareHost("WWW.Anjappar.com:443")).toBe("www.anjappar.com");
    expect(bareHost(" anjappar.com ")).toBe("anjappar.com");
    for (const bad of ["", null, undefined, "a b.com", "evil.com/x", "x<script>", "-x.com", "x.com-", "https://x.com"]) expect(bareHost(bad as string), String(bad)).toBe("");
  });

  it("the app's own addresses are never looked up", () => {
    for (const ours of ["dineflow.cloud", "www.dineflow.cloud", "anjappar.dineflow.cloud", "dineflow.in", "my-app-git-main.vercel.app", "localhost", "localhost:3141", "127.0.0.1:3000", "192.168.1.20", "intranet"]) expect(isOwnHost(ours, undefined), ours).toBe(true);
    expect(isOwnHost("app.example.org", "https://app.example.org")).toBe(true);        // the configured public address
    for (const theirs of ["www.anjappar.com", "anjappar.in", "notdineflow.cloud.evil.com", "dineflow.cloud.evil.com", "evildineflow.cloud"]) expect(isOwnHost(theirs, "https://www.dineflow.cloud"), theirs).toBe(false);
    expect(isOwnHost("anything.com", "not a url")).toBe(false);
  });

  it("only the front door is rewritten; every other path is the app's as usual", () => {
    expect(domainRewrite("/", "anjappar")).toBe("/site/anjappar");
    for (const p of ["/dine/anjappar", "/book/anjappar", "/site/anjappar", "/site/anjappar/opengraph-image", "/_next/static/x.js", "/fonts/a.woff2", "/login", "/robots.txt", "/sitemap.xml"]) expect(domainRewrite(p, "anjappar"), p).toBeNull();
    expect(domainRewrite("/", "Bad_Slug!")).toBeNull();
    expect(domainRewrite("/", "")).toBeNull();
  });
});
