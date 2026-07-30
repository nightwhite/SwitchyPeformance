import type { SettingsPageProps } from '../pages/SettingsPage.tsx';
import { SettingsPage } from '../pages/SettingsPage.tsx';

export interface GeneralSettingsPageProps extends Omit<SettingsPageProps, 'section'> {
  onOpenDiagnostics(): void;
}

export function GeneralSettingsPage({ onOpenDiagnostics, ...props }: GeneralSettingsPageProps) {
  return (
    <section className="original-settings-page">
      <header className="original-page-heading">
        <p className="original-page-eyebrow">设置</p>
        <h1>通用设置</h1>
        <p>控制 Chrome 代理权限、网络监控和故障排查。</p>
      </header>
      <SettingsPage {...props} onOpenDiagnostics={onOpenDiagnostics} section="general" />
    </section>
  );
}
