import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('splash screen loads and redirects to login', async ({ page }) => {
    await page.goto('/');
    // The splash screen animates then navigates to /login
    await expect(page).toHaveURL(/\/(login)?$/, { timeout: 10_000 });
  });

  test('login page renders expected form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('invalid credentials show error message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'notauser@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Expect an error message to appear (toast or inline)
    await expect(
      page.locator('[data-sonner-toast], .error, [role="alert"]')
    ).toBeVisible({ timeout: 8_000 });
  });

  test('unauthenticated access to /admin redirects', async ({ page }) => {
    await page.goto('/admin');
    // Should redirect to /login or /unauthorized
    await expect(page).toHaveURL(/\/(login|unauthorized)/, { timeout: 8_000 });
  });

  test('unauthenticated access to /engineer redirects', async ({ page }) => {
    await page.goto('/engineer');
    await expect(page).toHaveURL(/\/(login|unauthorized)/, { timeout: 8_000 });
  });
});
