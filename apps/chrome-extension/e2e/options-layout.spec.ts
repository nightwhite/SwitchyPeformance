import { expect, test } from './extension-fixture.ts';

test('loads the MV3 options page with Chinese navigation and a usable workspace width', async ({
  extension
}) => {
  const page = await extension.openOptions('#/overview');

  await expect(page.getByRole('heading', { name: '代理路由状态' })).toBeVisible();
  await expect(page.getByRole('button', { name: '配置同步' })).toBeVisible();
  await expect(page.locator('.options-app')).toHaveCSS('min-width', '760px');
});

test('renders the popup between the intended 360 and 420 pixel width bounds', async ({
  extension
}) => {
  const page = await extension.openPopup({ height: 900, width: 380 });

  await expect(page.getByText('当前模式')).toBeVisible();
  const box = await page.locator('.popup-shell').boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(360);
  expect(box?.width).toBeLessThanOrEqual(420);
});
