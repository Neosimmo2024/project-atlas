import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = join(process.cwd(), "src/components/relationships/relationship-form.tsx");

describe("RelationshipForm source safeguards", () => {
  it("guards against double submit and keeps the success navigation explicit", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const submittingRef = useRef(false);");
    expect(source).toContain("if (submittingRef.current) return;");
    expect(source).toContain("submittingRef.current = true;");
    expect(source).toContain("Relation créée. Redirection en cours...");
    expect(source).toContain("relationshipCreated=1");
    expect(source).not.toContain("confirmDuplicate");
  });
});
