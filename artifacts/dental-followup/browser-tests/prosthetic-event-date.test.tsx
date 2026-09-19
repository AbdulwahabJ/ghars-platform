import { describe, expect, it } from "vitest";
import { initialProstheticEventDate } from "@/lib/prosthetic-event-date";

describe("prosthetic event clinical date", () => {
  it("requires an explicit clinical date instead of defaulting to today", async () => {
    expect(initialProstheticEventDate()).toBe("");
  });
});