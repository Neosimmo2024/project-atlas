import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("completed talent qualification safeguard", () => {
  it("does not offer reopening a completed qualification as a draft", () => {
    const source = readFileSync(resolve(__dirname, "../../components/people/talent-qualification-form.tsx"), "utf8");
    expect(source).toContain('const isCompleted = qualification?.state === "completed";');
    expect(source).toContain('!isCompleted ? <Button type="submit" name="action" value="draft"');
    expect(source).toContain('isCompleted ? "Enregistrer les modifications" : "Terminer la qualification"');
  });
});
