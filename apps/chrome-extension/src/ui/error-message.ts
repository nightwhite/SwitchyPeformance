const CHINESE_CHARACTER = /[\u3400-\u9fff]/;

export function toUserFacingMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';

  if (message.includes('Invalid URL')) {
    return '请输入有效的网址';
  }
  if (cause instanceof SyntaxError || message.includes('Unexpected token')) {
    return '配置文件不是有效的 JSON';
  }
  if (CHINESE_CHARACTER.test(message)) {
    return message;
  }
  return '操作失败，请查看排查日志。';
}
