import { describe, expect, it } from "vitest";

import { appName } from "./app-info";

describe("appName", () => {
  it("returns the application name", () => {
    expect(appName()).toBe("Collab Docs");
  });
});
