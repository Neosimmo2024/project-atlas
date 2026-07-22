import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("pipeline page source", () => {
  it("does not return a 404 when the authenticated session has no active tenant", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(app)/pipeline/page.tsx"), "utf8");

    expect(source).not.toContain("notFound");
    expect(source).toContain("Aucun tenant actif");
    expect(source).toContain("Votre session est valide");
  });

  it("keeps pipeline card metadata separated and dialogs usable while scrolling", () => {
    const component = readFileSync(join(process.cwd(), "src/components/recruitment-pipeline/pipeline-page-client.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(component).toContain("pipeline-card-meta");
    expect(component).toContain("pipeline-meta-label");
    expect(component).toContain("Responsable");
    expect(component).toContain("Prochaine action");
    expect(component).toContain("Dernière activité");
    expect(component).not.toContain(">Action {formatPipelineDate");
    expect(component).toContain("pipeline-dialog-actions");
    expect(styles).toContain(".pipeline-dialog-actions");
    expect(styles).toContain("position: sticky");
    expect(styles).toContain(".pipeline-card-actions .button");
  });

  it("keeps visible Pipeline French labels encoded as UTF-8", () => {
    const component = readFileSync(join(process.cwd(), "src/components/recruitment-pipeline/pipeline-page-client.tsx"), "utf8");
    const page = readFileSync(join(process.cwd(), "src/app/(app)/pipeline/page.tsx"), "utf8");
    const options = readFileSync(join(process.cwd(), "src/features/recruitment-pipeline/options.ts"), "utf8");
    const visibleText = `${component}\n${page}\n${options}`;

    expect(visibleText).toContain("Données de pipeline incohérentes");
    expect(visibleText).toContain("Signature programmée");
    expect(visibleText).toContain("Préférence de contact mise à jour.");
    expect(visibleText).toContain("Détection");
    expect(visibleText).toContain("Négociation");
    expect(visibleText).not.toMatch(/Ã|Â|â€™|â€“/);
  });
});
