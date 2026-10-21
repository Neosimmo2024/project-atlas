import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("person linked task count", () => {
  it("shows the total linked task count while keeping only two cards visible", () => {
    const personPage = source("src/app/(app)/people/[id]/page.tsx");

    expect(personPage).toContain("const visibleTasks = tasks.tasks.slice(0, 2)");
    expect(personPage).toContain('tasks.total === 0 ? "Aucune tâche"');
    expect(personPage).toContain("tasks.total > visibleTasks.length");
  });
});
