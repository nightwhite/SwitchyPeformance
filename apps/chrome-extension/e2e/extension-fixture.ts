import { access, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Worker
} from '@playwright/test';

const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');

export interface ChromeExtensionHarness {
  context: BrowserContext;
  extensionId: string;
  openActionPopup(): Promise<ChromeActionPopup>;
  openOptions(hash?: string): Promise<Page>;
  openPopup(viewport?: { height: number; width: number }): Promise<Page>;
  restart(): Promise<void>;
  sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse>;
  worker: Worker;
}

export interface ChromeActionPopup {
  evaluate<T>(expression: string): Promise<T>;
}

export const test = base.extend<{ extension: ChromeExtensionHarness }>({
  extension: async ({}, use) => {
    await access(extensionPath);
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'switchypeformance-e2e-'));
    let context = await launchExtensionContext(userDataDirectory);

    try {
      let worker = await extensionWorker(context);
      let extensionId = new URL(worker.url()).host;
      let origin = `chrome-extension://${extensionId}`;
      let commandPage = await openCommandPage(context, origin);
      await use({
        get context() {
          return context;
        },
        get extensionId() {
          return extensionId;
        },
        async openActionPopup() {
          const triggerId = 'e2e-open-action-popup';
          await commandPage.evaluate((id) => {
            const existing = document.getElementById(id);
            if (existing) {
              existing.remove();
            }
            const button = document.createElement('button');
            button.id = id;
            button.addEventListener('click', () => {
              void chrome.action.openPopup();
            });
            document.body.append(button);
          }, triggerId);
          await commandPage.locator(`#${triggerId}`).click();
          const browser = context.browser();
          if (!browser) {
            throw new Error('无法连接到 Chrome 浏览器调试会话');
          }
          const session = await browser.newBrowserCDPSession();
          const targetId = await waitForActionPopupTarget(session, `${origin}/popup.html`);
          const attached = await session.send('Target.attachToTarget', {
            flatten: false,
            targetId
          });
          return new ChromeActionPopupSession(session, attached.sessionId);
        },
        async openOptions(hash = '#/overview') {
          const page = await context.newPage();
          await page.goto(`${origin}/options.html${hash}`);
          return page;
        },
        async openPopup(viewport = { height: 900, width: 420 }) {
          const page = await context.newPage();
          await page.setViewportSize(viewport);
          await page.goto(`${origin}/popup.html`);
          return page;
        },
        async restart() {
          await context.close();
          context = await launchExtensionContext(userDataDirectory);
          worker = await extensionWorker(context);
          extensionId = new URL(worker.url()).host;
          origin = `chrome-extension://${extensionId}`;
          commandPage = await openCommandPage(context, origin);
        },
        async sendMessage<TResponse = unknown>(message: unknown) {
          return commandPage.evaluate(
            async (request) => chrome.runtime.sendMessage(request) as Promise<TResponse>,
            message
          );
        },
        get worker() {
          return worker;
        }
      });
    } finally {
      await context.close();
      await rm(userDataDirectory, { force: true, recursive: true });
    }
  }
});

function launchExtensionContext(userDataDirectory: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDirectory, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    channel: 'chromium',
    headless: true
  });
}

async function extensionWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers()[0];
  if (existing) {
    return existing;
  }
  return context.waitForEvent('serviceworker');
}

async function openCommandPage(context: BrowserContext, origin: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${origin}/options.html#/overview`);
  return page;
}

async function waitForActionPopupTarget(session: CDPSession, expectedUrl: string): Promise<string> {
  const timeoutAt = Date.now() + 10_000;

  while (Date.now() < timeoutAt) {
    const targets = await session.send('Target.getTargets');
    const popup = targets.targetInfos.find((target) => target.url.startsWith(expectedUrl));
    if (popup) {
      return popup.targetId;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Chrome 工具栏弹窗没有在 10 秒内打开');
}

class ChromeActionPopupSession implements ChromeActionPopup {
  private nextMessageId = 1;

  constructor(
    private readonly session: CDPSession,
    private readonly targetSessionId: string
  ) {}

  async evaluate<T>(expression: string): Promise<T> {
    const id = this.nextMessageId++;
    const response = new Promise<T>((resolve, reject) => {
      const receive = (event: { message: string; sessionId: string }) => {
        const message = JSON.parse(event.message) as {
          error?: { message: string };
          id?: number;
          result?: {
            exceptionDetails?: {
              exception?: { description?: string; value?: string };
              text: string;
            };
            result?: { value?: T };
          };
        };
        if (event.sessionId !== this.targetSessionId || message.id !== id) {
          return;
        }
        this.session.off('Target.receivedMessageFromTarget', receive);
        if (message.error) {
          reject(new Error(message.error.message));
          return;
        }
        if (message.result?.exceptionDetails) {
          const exception = message.result.exceptionDetails;
          reject(
            new Error(
              exception.exception?.description ?? exception.exception?.value ?? exception.text
            )
          );
          return;
        }
        resolve(message.result?.result?.value as T);
      };
      this.session.on('Target.receivedMessageFromTarget', receive);
    });

    await this.session.send('Target.sendMessageToTarget', {
      message: JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { awaitPromise: true, expression, returnByValue: true }
      }),
      sessionId: this.targetSessionId
    });
    return response;
  }
}

export { expect };
