import { test, expect } from '@playwright/test';

test.describe('Offline page', () => {
  test('renders with a retry button', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.locator('h1')).toContainText('offline', { ignoreCase: true });
    await expect(page.locator('button')).toContainText(/try again/i);
  });
});
