import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("task card contextual navigation", () => {
  it("preserves the current Atlas page as the return target when a task is opened", () => {
    const taskCard = source("src/components/tasks/task-card.tsx");

    expect(taskCard).toContain("window.location.pathname");
    expect(taskCard).toContain("window.location.search");
    expect(taskCard).toContain("returnTo=");
  });
});
