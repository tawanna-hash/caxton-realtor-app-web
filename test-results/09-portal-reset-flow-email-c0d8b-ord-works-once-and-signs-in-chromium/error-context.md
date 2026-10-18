# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-portal-reset-flow.spec.ts >> emailed reset link sets a new password, works once, and signs in
- Location: tests/e2e/09-portal-reset-flow.spec.ts:13:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /set new password/i })
    - locator resolved to <button class="w-full rounded-full bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">Set new password</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="block text-[11px] text-gray-400">Notify me when it launches</span> from <div role="dialog" aria-modal="true" aria-label="Choose your publication" class="fixed inset-0 z-[70] bg-white flex flex-col">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="block text-[11px] text-gray-400">Notify me when it launches</span> from <div role="dialog" aria-modal="true" aria-label="Choose your publication" class="fixed inset-0 z-[70] bg-white flex flex-col">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    56 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <span class="block text-[11px] text-gray-400">Notify me when it launches</span> from <div role="dialog" aria-modal="true" aria-label="Choose your publication" class="fixed inset-0 z-[70] bg-white flex flex-col">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog "Choose your publication" [ref=e2]:
    - generic [ref=e4]:
      - paragraph [ref=e5]: Welcome to
      - heading "Realty News Now" [level=1] [ref=e6]
      - paragraph [ref=e7]:
        - text: Choose the market you cover. You can switch any time
        - text: from the title bar at the top.
      - list [ref=e8]:
        - listitem [ref=e9]:
          - button "RL RealtyLine Austin Tap to start in this market" [ref=e10]:
            - generic [ref=e11]: RL
            - generic [ref=e12]:
              - generic [ref=e13]: RealtyLine Austin
              - generic [ref=e14]: Tap to start in this market
            - img [ref=e15]
        - listitem [ref=e17]:
          - button "NS Newsline San Antonio Tap to start in this market" [ref=e18]:
            - generic [ref=e19]: NS
            - generic [ref=e20]:
              - generic [ref=e21]: Newsline San Antonio
              - generic [ref=e22]: Tap to start in this market
            - img [ref=e23]
      - paragraph [ref=e25]: Coming soon
      - list [ref=e26]:
        - listitem [ref=e27]:
          - button "RH RealtyLine Houston Notify me when it launches" [ref=e28]:
            - generic [ref=e29]: RH
            - generic [ref=e30]:
              - generic [ref=e31]: RealtyLine Houston
              - generic [ref=e32]: Notify me when it launches
        - listitem [ref=e33]:
          - button "RD RealtyLine Dallas/Ft. Worth Notify me when it launches" [ref=e34]:
            - generic [ref=e35]: RD
            - generic [ref=e36]:
              - generic [ref=e37]: RealtyLine Dallas/Ft. Worth
              - generic [ref=e38]: Notify me when it launches
  - generic [ref=e40]:
    - complementary [ref=e41]:
      - link "RealtyLine" [ref=e42] [cursor=pointer]:
        - /url: /portal
        - img "RealtyLine" [ref=e43]
      - generic [ref=e44]:
        - navigation
    - main [ref=e45]:
      - generic [ref=e47]: Dashboard
      - generic [ref=e48]:
        - generic [ref=e51]:
          - img "RealtyLine" [ref=e52]
          - generic [ref=e53]:
            - heading "Choose a new password" [level=1] [ref=e54]
            - paragraph [ref=e55]: Use at least 10 characters. You will sign in with it right after.
            - generic [ref=e56]:
              - generic [ref=e57]:
                - generic [ref=e58]: New password
                - textbox "New password" [ref=e59]: ResetTest-Passw0rd!
              - generic [ref=e60]:
                - generic [ref=e61]: Confirm new password
                - textbox "Confirm new password" [active] [ref=e62]: ResetTest-Passw0rd!
              - button "Set new password" [ref=e63]
        - paragraph [ref=e64]: Session-only access. Closing your browser signs you out.
  - alert [ref=e65]
```

# Test source

```ts
  1  | // tests/e2e/09-portal-reset-flow.spec.ts
  2  | //
  3  | // Real emailed-link reset in the browser. RESET_TOKENS is JSON of
  4  | // { "<project name>": "<token from the email>" }; the new password is set to
  5  | // PORTAL_PASSWORD so the regression suite stays repeatable.
  6  | 
  7  | import { test, expect } from '@playwright/test';
  8  | 
  9  | const PASSWORD = process.env.PORTAL_PASSWORD ?? '';
  10 | const EMAIL = process.env.PORTAL_EMAIL ?? '';
  11 | const TOKENS: Record<string, string> = JSON.parse(process.env.RESET_TOKENS ?? '{}');
  12 | 
  13 | test('emailed reset link sets a new password, works once, and signs in', async ({ page }, info) => {
  14 |   const token = TOKENS[info.project.name];
  15 |   test.skip(!token || !PASSWORD, 'no reset token for this project');
  16 | 
  17 |   await page.goto(`/portal/reset?token=${encodeURIComponent(token)}`);
  18 |   await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible();
  19 |   await expect(page.locator('div.fixed img[alt]').first()).toBeVisible();
  20 |   await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  21 |   await page.getByLabel('Confirm new password', { exact: true }).fill(PASSWORD);
> 22 |   await page.getByRole('button', { name: /set new password/i }).click();
     |                                                                 ^ Error: locator.click: Test timeout of 30000ms exceeded.
  23 |   await expect(page.getByText(/your password has been updated/i)).toBeVisible();
  24 | 
  25 |   // Same link again must fail.
  26 |   await page.goto(`/portal/reset?token=${encodeURIComponent(token)}`);
  27 |   await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  28 |   await page.getByLabel('Confirm new password', { exact: true }).fill(PASSWORD);
  29 |   await page.getByRole('button', { name: /set new password/i }).click();
  30 |   await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  31 | 
  32 |   // And the new password signs in.
  33 |   await page.goto('/portal/login');
  34 |   await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  35 |   await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  36 |   await page.getByRole('button', { name: /^sign in$/i }).click();
  37 |   await page.waitForURL((u) => !u.pathname.startsWith('/portal/login'), { timeout: 15_000 });
  38 | });
  39 | 
```