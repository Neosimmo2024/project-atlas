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

  it("keeps Pipeline filters responsive without moving horizontal scroll to the whole page", () => {
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const filters = readFileSync(join(process.cwd(), "src/components/recruitment-pipeline/pipeline-filters.tsx"), "utf8");

    expect(styles).toContain(".pipeline-filters");
    expect(styles).toContain(".pipeline-filter-primary");
    expect(styles).toContain(".pipeline-filter-advanced[hidden]");
    expect(styles).toContain(".pipeline-filter-actions");
    expect(filters).toContain("aria-expanded={advancedOpen}");
    expect(filters).toContain("id=\"pipeline-advanced-filters\"");
    expect(styles).toContain("overscroll-behavior-x: contain");
    expect(styles).not.toContain("repeat(6, minmax(130px, 0.8fr)) auto auto auto");
  });

  it("keeps the Atlas shell compact on mobile with a closeable overlay menu", () => {
    const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(shell).toContain("aria-controls=\"atlas-sidebar\"");
    expect(shell).toContain("aria-expanded={menuOpen}");
    expect(shell).toContain("Fermer le menu");
    expect(styles).toContain(".mobile-shell-bar");
    expect(styles).toContain(".shell-backdrop");
    expect(styles).toContain(".sidebar.sidebar-open");
    expect(styles).toContain("transform: translateX(-105%)");
    expect(styles).toContain("visibility: hidden");
    expect(styles).toContain("visibility: visible");
  });

  it("renders Pipeline list as cards on mobile instead of forcing a wide table", () => {
    const component = readFileSync(join(process.cwd(), "src/components/recruitment-pipeline/pipeline-page-client.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(component).toContain("pipeline-list-cards");
    expect(component).toContain("pipeline-list-card");
    expect(styles).toContain(".pipeline-table { display: none; }");
    expect(styles).toContain(".pipeline-list-cards { display: grid; gap: 12px; }");
  });

  it("keeps mobile Kanban focused on the first phase that actually has cards", () => {
    const component = readFileSync(join(process.cwd(), "src/components/recruitment-pipeline/pipeline-page-client.tsx"), "utf8");
    const e2e = readFileSync(join(process.cwd(), "e2e/recruitment-pipeline-ui.e2e.spec.ts"), "utf8");

    expect(component).toContain("boardRef");
    expect(component).toContain("window.matchMedia(\"(max-width: 760px)\")");
    expect(component).toContain("firstPopulatedColumn");
    expect(component).toContain("data-has-cards");
    expect(component).toContain("data-stage");
    expect(component).toContain("board?.scrollTo");
    expect(component).toContain("window.addEventListener(\"resize\", scrollToFirstPopulatedColumn)");
    expect(component).toContain("mobileQuery.addEventListener(\"change\", scrollToFirstPopulatedColumn)");
    expect(e2e).toContain("expectMobileKanbanCards");
    expect(e2e).toContain("visibleCards === 1");
    expect(e2e).toContain("pipeline-column[data-has-cards='false']");
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
