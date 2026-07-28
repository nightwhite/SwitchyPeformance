# Temporary Global Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in this existing worktree. Do not use subagents because this repository explicitly forbids them.

**Goal:** Add session-only, expiring, globally scoped temporary routing rules without changing the saved proxy configuration.

**Architecture:** A small repository stores serializable V1/V2 temporary rules in `chrome.storage.session`. A pure service validates, removes expired or invalid entries, overlays active rules ahead of persistent auto-switch rules, and returns the next alarm time. The background injects that overlay only at compile/explain time, so `chrome.storage.local` configuration remains untouched.

**Tech Stack:** TypeScript, React, Chrome MV3 `storage.session` and `alarms`, existing Rust/WASM PAC compiler.

---

### Task 1: Model and overlay

**Files:**

- Create: `apps/chrome-extension/src/runtime/temporary-rule-repository.ts`
- Create: `apps/chrome-extension/src/runtime/temporary-rule-service.ts`
- Test: `apps/chrome-extension/src/runtime/temporary-rule-service.test.ts`

- [x] **Step 1: Write failing tests for active, expired, and persistent rules.**

```ts
it('overlays newest live temporary V2 rules ahead of persistent rules', () => {
  const merged = overlayTemporaryRules(v2Document(), [liveRule('new'), liveRule('old')], 1_000);
  expect(autoProfile(merged).rules.map((rule) => rule.id)).toEqual([
    'new',
    'old',
    'persistent-rule'
  ]);
  expect(autoProfile(v2Document()).rules.map((rule) => rule.id)).toEqual(['persistent-rule']);
});

it('excludes expired and no-longer-routable temporary rules', () => {
  expect(
    activeTemporaryRules(
      [expiredRule(), invalidTargetRule(), liveRule('live')],
      v2Document(),
      1_000
    )
  ).toMatchObject([{ id: 'live' }]);
});
```

- [x] **Step 2: Run the new test file and verify it fails because the service does not exist.**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/temporary-rule-service.test.ts`

Expected: FAIL with a module-not-found or missing-export error.

- [x] **Step 3: Implement the minimum serializable repository and pure overlay service.**

```ts
export interface TemporaryRuleRepository {
  load(): Promise<readonly TemporaryRule[]>;
  replace(rules: readonly TemporaryRule[]): Promise<void>;
}

export function overlayTemporaryRules(
  document: ConfigurationDocument,
  rules: readonly TemporaryRule[],
  now: number
): ConfigurationDocument;
```

Rules must carry schema version, automatic-profile id, normal rule payload, creation time, expiry time, and `scope: 'global'`. V1 rules use V1 conditions and targets; V2 rules use V2 conditions and profile targets. Do not insert system-proxy targets into any PAC route.

- [x] **Step 4: Run the test file and verify it passes.**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/temporary-rule-service.test.ts`

Expected: PASS.

### Task 2: Session lifecycle and background integration

**Files:**

- Modify: `apps/chrome-extension/src/runtime/chrome-repositories.ts`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Create: `apps/chrome-extension/src/runtime/temporary-routing-document.ts`
- Create: `apps/chrome-extension/src/runtime/temporary-rule-lifecycle.ts`
- Test: `apps/chrome-extension/src/runtime/messages.test.ts`

- [x] **Step 1: Write failing message tests for add, remove, and clear commands.**

```ts
expect(
  isBackgroundRequest({
    type: 'temporary-rule.remove',
    ruleId: 'temporary-1'
  })
).toBe(true);

expect(
  isBackgroundRequest({
    type: 'temporary-rule.add',
    expiresAt: 0
  })
).toBe(false);
```

- [x] **Step 2: Run the message test and verify it fails.**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/messages.test.ts`

Expected: FAIL because temporary-rule commands are not recognized.

- [x] **Step 3: Add the commands and apply rules only in memory.**

```ts
type TemporaryRuleCommand =
  | { type: 'temporary-rule.add'; input: TemporarySiteRuleInput }
  | { type: 'temporary-rule.remove'; ruleId: string }
  | { type: 'temporary-rule.clear' };
```

Create a Chrome session repository under a distinct `switchypeformance.temporary-rules.v1` key. On add/remove/clear, update session storage, call `service.reapplyCurrent()`, and return a snapshot that contains the active temporary rule list. The apply closure and `route.explain` must call `overlayTemporaryRules` before invoking the WASM compiler or explainer. Use `chrome.alarms` to schedule the earliest expiry and only reapply when pruning changed the collection.

- [x] **Step 4: Run message and service tests.**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/messages.test.ts apps/chrome-extension/src/runtime/temporary-rule-service.test.ts`

Expected: PASS.

### Task 3: Popup controls and management page

**Files:**

- Create: `apps/chrome-extension/src/ui/components/temporary-rule-form.ts`
- Create: `apps/chrome-extension/src/ui/pages/TemporaryRulesPage.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/style.css`
- Modify: `apps/chrome-extension/src/ui/options-routes.ts`
- Modify: `apps/chrome-extension/src/ui/pages/V2OptionsApp.tsx`
- Modify: `apps/chrome-extension/entrypoints/options/OptionsApp.tsx`
- Test: `apps/chrome-extension/src/ui/components/temporary-rule-form.test.ts`

- [x] **Step 1: Write failing pure form tests for duration selection.**

```ts
expect(expiryFromDuration(1_000, '30m')).toBe(1_801_000);
expect(temporaryDurationLabel('1h')).toBe('1 小时');
```

- [x] **Step 2: Run the test and verify it fails.**

Run: `pnpm vitest run apps/chrome-extension/src/ui/components/temporary-rule-form.test.ts`

Expected: FAIL because the duration helpers do not exist.

- [x] **Step 3: Implement transparent temporary controls.**

The popup adds a second command named `临时加入自动切换` with 5-minute, 30-minute, and 1-hour duration choices. Its notice must state `临时全局规则，会影响所有普通窗口标签页，到期后自动移除。` The settings page must list active temporary rules with target, profile, expiration countdown, and remove/clear controls. Both V1 and V2 option shells expose the same page.

- [x] **Step 4: Run UI helper tests and build the extension.**

Run: `pnpm vitest run apps/chrome-extension/src/ui/components/temporary-rule-form.test.ts && pnpm build`

Expected: PASS.

### Task 4: Full verification and commit

- [x] **Step 1: Run all tests, type checks, formatting, and production build.**

Run: `pnpm test`

Run: `pnpm check:ts`

Run: `pnpm format:check`

Run: `pnpm build`

Expected: all commands pass.

- [x] **Step 2: Commit the feature.**

```bash
git add apps/chrome-extension docs
git commit -m "feat: manage expiring global temporary rules"
```

**Execution record (2026-07-29):** Temporary rules only write to `chrome.storage.session`; permanent configuration remains in `chrome.storage.local`. The apply and route-explain paths overlay rules only in memory. Startup, messages, and the expiry alarm re-schedule the nearest expiration. The popup provides 5-minute, 30-minute, and 1-hour choices; both V1 and V2 shells show and remove active rules. Re-adding the same automatic profile and condition replaces the old temporary rule. Verification passed: 52 Vitest files / 174 tests, `cargo test --workspace`, `cargo fmt --check`, `pnpm check:ts`, `pnpm format:check`, and `pnpm build`. The current browser automation policy blocks `chrome-extension://` pages, so installed Chrome UI verification remains an explicit M6 check rather than a false completion claim.
