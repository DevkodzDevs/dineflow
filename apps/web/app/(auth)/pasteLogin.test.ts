import { describe, expect, it } from "vitest";
import { sameLogin, splitPastedLogin } from "./pasteLogin";

// Made-up sample values only — not real logins or passwords.
const ID = "dine-htl-test-00001@dineflow.local";
const PW = "DineSample123456!";

describe("splitPastedLogin", () => {
  it("splits the old Master control copy, id / password", () => {
    expect(splitPastedLogin(`${ID} / ${PW}`)).toEqual({ id: ID, password: PW });
  });
  it("splits a tab and two lines", () => {
    expect(splitPastedLogin(`${ID}\t${PW}`)).toEqual({ id: ID, password: PW });
    expect(splitPastedLogin(`${ID}\n${PW}\n`)).toEqual({ id: ID, password: PW });
    expect(splitPastedLogin(`${ID}\r\n${PW}`)).toEqual({ id: ID, password: PW });
  });
  it("reads labelled lines and skips the property code", () => {
    expect(splitPastedLogin(`DineFlow code: dine-htl-test-00001\nUser ID: ${ID}\nTemporary password: ${PW}`)).toEqual({ id: ID, password: PW });
    expect(splitPastedLogin(`Login ID: dine-htl-test-00001\nPassword: a:b/c`)).toEqual({ id: "dine-htl-test-00001", password: "a:b/c" });
  });
  it("keeps a bare id and a password that itself contains a slash", () => {
    expect(splitPastedLogin("priya / Dine/Lotus1")).toEqual({ id: "priya", password: "Dine/Lotus1" });
  });
  it("leaves an ordinary password alone", () => {
    for (const p of [PW, "  spaced out  ", "a/b", "my pass / word", "x / y", "", "   ", "one\ntwo\nthree", "Note: hi\nPassword: x"]) {
      expect(splitPastedLogin(p)).toBeNull();
    }
  });
  it("needs both halves", () => {
    expect(splitPastedLogin(`${ID} / `)).toBeNull();
    expect(splitPastedLogin(` / ${PW}`)).toBeNull();
    expect(splitPastedLogin(`User ID: ${ID}`)).toBeNull();
  });
});

describe("sameLogin", () => {
  it("matches case-blind and bare id against its address", () => {
    expect(sameLogin(ID, ID.toUpperCase())).toBe(true);
    expect(sameLogin("dine-htl-test-00001", ID)).toBe(true);
    expect(sameLogin("dine-htl-test-00002", ID)).toBe(false);
    expect(sameLogin("", ID)).toBe(false);
  });
});
