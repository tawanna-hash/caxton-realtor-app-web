# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 08-portal-regression.spec.ts >> signed-in partner can open every portal page without errors
- Location: tests/e2e/08-portal-regression.spec.ts:73:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "/realtynewsnow.app/portal?_rsc=nMvQSHuvObbFnQMl due to access control checks.",
+   "/realtynewsnow.app/portal/orders?_rsc=NBQVT_3gsDNKZphR due to access control checks.",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - link "RealtyLine" [ref=e5]:
        - /url: /portal
        - img "RealtyLine" [ref=e6]
      - navigation [ref=e8]:
        - link "Overview" [ref=e9]:
          - /url: /portal
          - img [ref=e10]
          - text: Overview
        - link "Orders" [ref=e15]:
          - /url: /portal/orders
          - img [ref=e16]
          - text: Orders
        - link "Files" [ref=e19]:
          - /url: /portal/files
          - img [ref=e20]
          - text: Files
        - link "My Content" [ref=e22]:
          - /url: /portal/content
          - img [ref=e24]
          - text: My Content
        - link "Forms" [ref=e29]:
          - /url: /portal/forms
          - img [ref=e30]
          - text: Forms
        - link "Account" [ref=e33]:
          - /url: /portal/account
          - img [ref=e34]
          - text: Account
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Z
          - generic [ref=e40]:
            - generic [ref=e41]: ZZ Regression Test (delete me)
            - generic [ref=e42]: tawanna@myrealtyline.com
        - button "Sign out" [ref=e44]
    - main [ref=e45]:
      - generic [ref=e46]:
        - generic [ref=e47]: My Content
        - generic [ref=e49]:
          - textbox "Search the portal" [ref=e50]:
            - /placeholder: Search anything here...
          - img
      - generic [ref=e51]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - link "← My Content" [ref=e56]:
              - /url: /portal/content
            - generic [ref=e57]:
              - heading "Event images" [level=2] [ref=e58]
              - paragraph [ref=e59]: Photos tagged to you appear here automatically, organized in monthly folders. Click a photo to open the full size.
          - generic [ref=e60]: No event photos tagged to you yet.
        - paragraph [ref=e61]: Session-only access. Closing your browser signs you out.
  - alert [ref=e62]
```

# Test source

```ts
  1  | // tests/e2e/08-portal-regression.spec.ts
  2  | //
  3  | // Partner portal regression. Needs a test partner: PORTAL_EMAIL + PORTAL_PASSWORD.
  4  | // Skipped when they are not set. Writes nothing except the session cookie.
  5  | 
  6  | import { test, expect, type Page } from '@playwright/test';
  7  | 
  8  | const EMAIL = process.env.PORTAL_EMAIL ?? '';
  9  | const PASSWORD = process.env.PORTAL_PASSWORD ?? '';
  10 | const PAGES = [
  11 |   '/portal',
  12 |   '/portal/account',
  13 |   '/portal/orders',
  14 |   '/portal/files',
  15 |   '/portal/forms',
  16 |   '/portal/content',
  17 |   '/portal/content/issues',
  18 |   '/portal/content/articles',
  19 |   '/portal/content/events',
  20 | ];
  21 | const ERROR_TEXT = /application error|something went wrong|internal server error|this page could not be found/i;
  22 | 
  23 | async function signIn(page: Page) {
  24 |   await page.goto('/portal/login');
  25 |   await page.waitForLoadState('networkidle');
  26 |   await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  27 |   await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  28 |   await page.getByRole('button', { name: /^sign in$/i }).click();
  29 |   await page.waitForURL((u) => !u.pathname.startsWith('/portal/login'), { timeout: 15_000 });
  30 | }
  31 | 
  32 | test('login page renders with forgot-password link', async ({ page }) => {
  33 |   await page.goto('/portal/login');
  34 |   await page.waitForLoadState('networkidle');
  35 |   await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  36 |   await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  37 |   await expect(page.getByRole('button', { name: /forgot your password/i })).toBeVisible();
  38 | });
  39 | 
  40 | test('forgot password shows a generic confirmation for an unknown email', async ({ page }) => {
  41 |   await page.goto('/portal/login');
  42 |   await page.waitForLoadState('networkidle');
  43 |   await page.getByRole('button', { name: /forgot your password/i }).click();
  44 |   await page.getByLabel('Email', { exact: true }).fill('nobody-regression@example.com');
  45 |   await page.getByRole('button', { name: /send reset link/i }).click();
  46 |   await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
  47 |   await page.getByRole('button', { name: /back to sign in/i }).click();
  48 |   await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  49 | });
  50 | 
  51 | test('wrong password is rejected', async ({ page }) => {
  52 |   test.skip(!EMAIL, 'PORTAL_EMAIL not set');
  53 |   await page.goto('/portal/login');
  54 |   await page.waitForLoadState('networkidle');
  55 |   await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  56 |   await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
  57 |   await page.getByRole('button', { name: /^sign in$/i }).click();
  58 |   await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
  59 |   expect(page.url()).toContain('/portal/login');
  60 | });
  61 | 
  62 | test('reset page rejects a bad token and a missing token', async ({ page }) => {
  63 |   await page.goto('/portal/reset?token=not-a-real-token-value');
  64 |   await page.waitForLoadState('networkidle');
  65 |   await page.getByLabel('New password', { exact: true }).fill('SomethingLong123');
  66 |   await page.getByLabel('Confirm new password', { exact: true }).fill('SomethingLong123');
  67 |   await page.getByRole('button', { name: /set new password/i }).click();
  68 |   await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  69 |   await page.goto('/portal/reset');
  70 |   await expect(page.getByText(/missing its token/i)).toBeVisible();
  71 | });
  72 | 
  73 | test('signed-in partner can open every portal page without errors', async ({ page }) => {
  74 |   test.skip(!EMAIL || !PASSWORD, 'portal test credentials not set');
  75 |   const pageErrors: string[] = [];
  76 |   page.on('pageerror', (e) => pageErrors.push(e.message));
  77 |   await signIn(page);
  78 |   for (const path of PAGES) {
  79 |     const res = await page.goto(path);
  80 |     expect(res?.status(), path).toBeLessThan(400);
  81 |     expect(new URL(page.url()).pathname, `${path} bounced to login`).not.toMatch(/^\/portal\/login/);
  82 |     await expect(page.locator('body'), path).not.toContainText(ERROR_TEXT);
  83 |   }
> 84 |   expect(pageErrors).toEqual([]);
     |                      ^ Error: expect(received).toEqual(expected) // deep equality
  85 | });
  86 | 
```