import { expect, test } from "@playwright/test";

test("production CSP authorizes framework scripts, blocks injected inline scripts and renews its nonce", async ({ page }) => {
  const response = await page.goto("/login");
  const policy = response!.headers()["content-security-policy"];
  const scriptPolicy = policy.split(";").find((part) => part.trim().startsWith("script-src"))!;
  expect(scriptPolicy).not.toContain("'unsafe-inline'");
  expect(scriptPolicy).not.toContain("'unsafe-eval'");
  const nonce = scriptPolicy.match(/'nonce-([^']+)'/)![1];
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
  const scripts = await page.locator("script").evaluateAll((nodes) => nodes.map((node) => ({ nonce: (node as HTMLScriptElement).nonce, type: (node as HTMLScriptElement).type })));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((script) => !script.type || script.type === "text/javascript").every((script) => script.nonce === nonce)).toBe(true);
  const blocked = await page.evaluate(async () => {
    return await new Promise<boolean>((resolve) => {
      const marker = "data-csp-injection-ran";
      document.addEventListener("securitypolicyviolation", (event) => {
        if (event.violatedDirective.startsWith("script-src")) resolve(!document.documentElement.hasAttribute(marker));
      });
      const script = document.createElement("script");
      script.textContent = `document.documentElement.setAttribute('${marker}', 'yes')`;
      document.body.appendChild(script);
      setTimeout(() => resolve(false), 3000);
    });
  });
  expect(blocked).toBe(true);
  const next = await page.reload();
  expect(next!.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);
});
