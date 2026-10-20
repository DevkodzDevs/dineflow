import { describe, expect, it } from "vitest";
import { shuffleFrame, settleSteps, countFrames, clockText, clockTone, twelveHour } from "./flap";

describe("flap numbers", () => {
  it("settles left to right: position i lands on step 3 + i, punctuation never shuffles", () => {
    const zero = () => 0;
    expect(shuffleFrame("47", 0, zero)).toBe("00");
    expect(shuffleFrame("47", 3, zero)).toBe("40");
    expect(shuffleFrame("47", 4, zero)).toBe("47");
    expect(shuffleFrame("2/12", 0, zero)).toBe("0/00");
    expect(shuffleFrame("T4", 0, zero)).toBe("A0");
    expect(shuffleFrame("#14", 1, zero)).toBe("#00");
    expect(settleSteps("2/12")).toBe(6);
    expect(shuffleFrame("2/12", settleSteps("2/12"), zero)).toBe("2/12");
  });
  it("counts in even steps and ends exactly on the target", () => {
    expect(countFrames(0, 62, 4)).toEqual([16, 31, 47, 62]);
    expect(countFrames(80, 40, 2)).toEqual([60, 40]);
    expect(countFrames(5, 5)).toEqual([5]);
  });
  it("writes an age as mm:ss under an hour and h:mm after", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(9 * 60000 + 7000)).toBe("09:07");
    expect(clockText(75 * 60000)).toBe("1:15");
    expect(clockText(-5000)).toBe("00:00");
  });
  it("turns amber at the hurry minutes and red at the late ones", () => {
    expect(clockTone(5 * 60000, 10, 15)).toBe("live");
    expect(clockTone(10 * 60000, 10, 15)).toBe("warn");
    expect(clockTone(15 * 60000, 10, 15)).toBe("alert");
    expect(clockTone(15 * 60000)).toBeUndefined();
  });
  it("reads a Postgres time as a 12-hour face", () => {
    expect(twelveHour("13:00:00")).toEqual(["1:00", "PM"]);
    expect(twelveHour("00:30")).toEqual(["12:30", "AM"]);
    expect(twelveHour("12:05")).toEqual(["12:05", "PM"]);
  });
});
