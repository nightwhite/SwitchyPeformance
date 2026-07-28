import type { AutoDetectProfileV2 } from '@switchypeformance/contracts';

interface AutoDetectProfileEditorProps {
  profile: AutoDetectProfileV2;
}

export function AutoDetectProfileEditor({ profile }: AutoDetectProfileEditorProps) {
  return (
    <section className="page-panel advanced-profile-editor auto-detect-profile-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">自动检测</p>
          <h2>{profile.name}</h2>
        </div>
        <span className="signal-dot" />
      </div>
      <p className="inline-notice">Chrome 自动发现代理不需要额外参数。</p>
    </section>
  );
}
