import type { DirectProfileV2, SystemProfileV2 } from '@switchypeformance/contracts';

interface BuiltinProfilePageProps {
  profile: DirectProfileV2 | SystemProfileV2;
}

export function BuiltinProfilePage({ profile }: BuiltinProfilePageProps) {
  const direct = profile.kind === 'direct';
  return (
    <section className="original-page-panel original-builtin-profile-page">
      <p className="panel-kicker">内置配置</p>
      <h2>{direct ? '直连模式' : '系统代理模式'}</h2>
      <p>
        {direct
          ? '所有网页请求将直接连接，不匹配任何手动代理配置。'
          : 'Chrome 会使用操作系统当前提供的代理设置。'}
      </p>
      <p className="original-builtin-profile-note">
        这是内置配置，不能删除。需要切换时可在浏览器工具栏弹窗中直接选择。
      </p>
    </section>
  );
}
