import type { AutoDetectProfileV2 } from '@switchypeformance/contracts';

export function AutoDetectProfilePage({ profile }: { profile: AutoDetectProfileV2 }) {
  return (
    <section className="original-page-panel original-advanced-profile-page">
      <p className="panel-kicker">自动检测</p>
      <h2>自动检测代理</h2>
      <p>
        Chrome 会通过系统的自动代理发现机制查找配置。这个模式没有独立的服务器地址或规则参数。
      </p>
      <p className="original-auto-detect-help">
        如果网络没有提供自动代理脚本，Chrome 会保持直接连接；不会把 localhost 或局域网请求改送到代理。
      </p>
    </section>
  );
}
