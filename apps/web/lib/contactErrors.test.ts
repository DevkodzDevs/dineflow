import { describe, expect, it } from "vitest";
import { friendlyContactError } from "./contactErrors";

describe("contact repeats read the same everywhere (0196)", () => {
  it("turns the unique-index errors into one sentence", () => {
    expect(friendlyContactError('duplicate key value violates unique constraint "profiles_phone_uniq"')).toMatch(/phone number is already used/);
    expect(friendlyContactError('duplicate key value violates unique constraint "profiles_contact_email_uniq"')).toMatch(/email is already used/);
    expect(friendlyContactError('duplicate key value violates unique constraint "profiles_login_email_uniq"')).toMatch(/email is already used/);
  });
  it("leaves every other message as it was", () => {
    expect(friendlyContactError("That code is not right. 4 tries left.")).toBe("That code is not right. 4 tries left.");
    expect(friendlyContactError(undefined)).toBe("");
  });
});
