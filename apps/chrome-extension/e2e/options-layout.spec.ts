import { expect, test } from './extension-fixture.ts';
import { automaticProxyDocument } from './proxy-test-support.ts';

test('loads the original-style options page with Chinese navigation and a usable workspace width', async ({
  extension
}) => {
  const page = await extension.openOptions('#/profile/direct');

  await expect(page.getByRole('navigation', { name: '原版配置导航' })).toBeVisible();
  await expect(page.getByRole('button', { name: '内置配置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '自动切换' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '直连' })).toBeVisible();
  await expect(page.locator('.original-options-app')).toHaveCSS('min-width', '760px');
});

test('renders the popup between the intended 360 and 420 pixel width bounds', async ({
  extension
}) => {
  const page = await extension.openPopup({ height: 900, width: 380 });

  await expect(page.getByRole('region', { name: '代理配置菜单' })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: /^直连/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开设置' })).toBeVisible();
  const box = await page.locator('.popup-shell').boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(360);
  expect(box?.width).toBeLessThanOrEqual(420);
});

test('edits the automatic profile selected from the configuration list without a second selector', async ({
  extension
}) => {
  const page = await extension.openOptions('#/profile/auto-switch');

  await expect(page.getByRole('heading', { level: 1, name: '自动切换' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '自动切换配置' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '添加规则' })).toBeVisible();
});

test('opens a newly created configuration in the configuration workspace', async ({
  extension
}) => {
  const page = await extension.openOptions('#!/new-profile');
  const dialog = page.getByRole('dialog', { name: '新建配置' });

  await expect(dialog).toBeVisible();
  await dialog.getByLabel('配置名称').fill('测试自动切换');
  await dialog.getByRole('button', { name: '创建配置' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '测试自动切换' })).toBeVisible();
  await expect(page).toHaveURL(/#!\/profile\//);
  await expect(page.getByRole('button', { name: '应用' })).toBeEnabled();
});

test('creates a first fixed proxy and its proxy server from the new-configuration flow', async ({
  extension
}) => {
  const page = await extension.openOptions('#!/new-profile');
  const dialog = page.getByRole('dialog', { name: '新建配置' });

  await dialog.getByLabel('配置类型').selectOption('fixed-proxy');
  await dialog.getByLabel('配置名称').fill('本地 SOCKS5');
  await dialog.getByLabel('代理地址').fill('127.0.0.1');
  await dialog.getByLabel('代理端口').fill('1080');
  await dialog.getByRole('button', { name: '创建配置' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '本地 SOCKS5' })).toBeVisible();
  await page.getByRole('button', { name: '应用' }).click();
  await expect(extension.sendMessage({ type: 'state.get' })).resolves.toMatchObject({
    ok: true,
    state: {
      configuration: {
        profiles: expect.arrayContaining([
          expect.objectContaining({ kind: 'fixed-proxy', name: '本地 SOCKS5' })
        ]),
        proxyServers: expect.arrayContaining([
          expect.objectContaining({ host: '127.0.0.1', name: '本地 SOCKS5', port: 1080 })
        ])
      }
    }
  });
});

test('replaces references before deleting a proxy configuration from its workspace', async ({
  extension
}) => {
  await expect(
    extension.sendMessage({
      document: automaticProxyDocument(8080),
      type: 'configuration.replace'
    })
  ).resolves.toMatchObject({ ok: true });

  const page = await extension.openOptions('#/profile/work');
  await page.getByRole('button', { name: '删除 测试代理' }).click();

  const dialog = page.getByRole('dialog', { name: '删除配置' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('替代配置').selectOption('direct');
  await dialog.getByRole('button', { name: '替换并删除' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '直连' })).toBeVisible();
  await page.getByRole('button', { name: '应用' }).click();
  await expect(extension.sendMessage({ type: 'state.get' })).resolves.toMatchObject({
    ok: true,
    state: {
      configuration: {
        profiles: expect.not.arrayContaining([expect.objectContaining({ id: 'work' })])
      }
    }
  });
});

test('deletes a referenced proxy server together with its dependent proxy configuration', async ({
  extension
}) => {
  await expect(
    extension.sendMessage({
      document: automaticProxyDocument(8080),
      type: 'configuration.replace'
    })
  ).resolves.toMatchObject({ ok: true });

  const page = await extension.openOptions('#/profile/work');
  await page.getByRole('button', { name: '删除 本地 HTTP 代理' }).click();

  const dialog = page.getByRole('dialog', { name: '删除代理服务器' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '删除关联配置' }).click();
  await dialog.getByLabel('被替换为').selectOption('direct');
  await dialog.getByRole('button', { name: '删除配置和服务器' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '内置配置' })).toBeVisible();
  await page.getByRole('button', { name: '应用' }).click();
  await expect(extension.sendMessage({ type: 'state.get' })).resolves.toMatchObject({
    ok: true,
    state: {
      configuration: {
        profiles: expect.not.arrayContaining([expect.objectContaining({ id: 'work' })]),
        proxyServers: []
      }
    }
  });
});
