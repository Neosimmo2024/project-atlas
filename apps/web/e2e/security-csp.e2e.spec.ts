import { expect, test } from "@playwright/test";

test("production CSP authorizes framework scripts, blocks injected inline scripts and renews its nonce", async ({ page }) => {
  const response = await page.goto("/login");
  const policy = response!.headers()["content-security-policy"];
  const scriptPolicy = policy.split(";").find((part) => part.trim().startsWith("script-src"))!;
  expect(scriptPolicy).not.toContain("'unsafe-inline'");
  expect(scriptPolicy).not.toContain("'unsafe-eval'");
  const nonce = scriptPolicy.match(/'nonce-([^']+)'/)![1];
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Afficher le mot de passe", exact: true }).click();
  await expect(page.locator("#login-password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Masquer le mot de passe", exact: true }).click();
  await expect(page.locator("#login-password")).toHaveAttribute("type", "password");
  const scripts = await page.locator("script").evaluateAll((nodes) => nodes.map((node) => ({ nonce: (node as HTMLScriptElement).nonce, type: (node as HTMLScriptElement).type })));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((script) => !script.type || script.type === "text/javascript").every((script) => script.nonce === nonce)).toBe(true);
  const next = await page.reload();
  expect(next!.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);

  // Inject into the HTTP document: DevTools evaluate/createElement is not a
  // parser-inserted injection and inherits strict-dynamic script trust.
  await page.route("**/login", async (route) => {
    const original = await route.fetch();
    const html = await original.text();
    expect(html).toContain("</head>");
    await route.fulfill({
      response: original,
      body: html.replace("</head>", '<script>window.__cspInjectionRan = true;</script></head>'),
    });
  });
  const violation = page.waitForEvent("console", {
    predicate: (message) => /inline/i.test(message.text()) && /Content Security Policy/i.test(message.text()),
  });
  await page.reload();
  expect((await violation).type()).toBe("error");
  expect(await page.evaluate(() => "__cspInjectionRan" in window)).toBe(false);
});
