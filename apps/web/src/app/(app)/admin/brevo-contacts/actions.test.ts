import { beforeEach, expect, it, vi } from "vitest";
import { contactCommandAction } from "./actions";
const m = vi.hoisted(() => ({ check: vi.fn(), close: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/repositories/brevo-account-diagnostic", () => ({ diagnoseBrevoQaAccount: vi.fn() }));
vi.mock("@/repositories/brevo-configured-contact-check", () => ({ inspectConfiguredBrevoContactAttempt: m.check }));
vi.mock("@/repositories/brevo-contact-review", () => ({ closeConfiguredBrevoContactReview: m.close }));
const id = "22222222-2222-4222-8222-222222222222";
function form(command: string, confirmation?: string) {
  const data = new FormData(); data.set("attemptId", id); data.set("command", command);
  data.set("apiKey", "untrusted"); data.set("tenantId", "untrusted");
  if (confirmation) data.set("confirmation", confirmation); return data;
}
beforeEach(() => vi.resetAllMocks());
it("rejects invalid identifiers and commands before calling repositories", async () => {
  const data = form("check"); data.set("attemptId", "-".repeat(36));
  await contactCommandAction({ message: "" }, data);
  await contactCommandAction({ message: "" }, form("sync"));
  expect(m.check).not.toHaveBeenCalled(); expect(m.close).not.toHaveBeenCalled();
});
it("accepts only the attempt ID for checks and refreshes recorded evidence", async () => {
  m.check.mockResolvedValue({ recorded: true, status: "outcome_unresolved" });
  const result = await contactCommandAction({ message: "" }, form("check"));
  expect(m.check).toHaveBeenCalledExactlyOnceWith(id);
  expect(result.message).toContain("bloquée"); expect(m.revalidate).toHaveBeenCalledWith("/admin/brevo-contacts");
});
it("passes explicit confirmation to the authenticated closure repository", async () => {
  m.close.mockResolvedValue({ closed: true });
  const result = await contactCommandAction({ message: "" }, form("close", "keep_blocked"));
  expect(m.close).toHaveBeenCalledExactlyOnceWith(id, "keep_blocked"); expect(result.message).toContain("bloquée");
});
it("does not invent a confirmation or a successful closure", async () => {
  m.close.mockResolvedValue({ closed: false });
  const result = await contactCommandAction({ message: "" }, form("close"));
  expect(m.close).toHaveBeenCalledExactlyOnceWith(id, ""); expect(result.message).toContain("n’a pas été clôturée"); expect(m.revalidate).not.toHaveBeenCalled();
});
it("redacts failed provider results", async () => {
  m.check.mockResolvedValue({ recorded: false, status: "private" });
  expect((await contactCommandAction({ message: "" }, form("check"))).message).not.toContain("private");
  expect(m.revalidate).not.toHaveBeenCalled();
});
it("redacts exceptions", async () => {
  m.check.mockRejectedValue(new Error("private"));
  expect((await contactCommandAction({ message: "" }, form("check"))).message).not.toContain("private");
});
