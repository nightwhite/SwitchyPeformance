import { describe, expect, it } from 'vitest';

import { toUserFacingMessage } from './error-message.ts';

describe('toUserFacingMessage', () => {
  it('translates browser parsing errors into Chinese guidance', () => {
    expect(toUserFacingMessage(new TypeError('Invalid URL'))).toBe('请输入有效的网址');
    expect(toUserFacingMessage(new SyntaxError('Unexpected token'))).toBe(
      '配置文件不是有效的 JSON'
    );
  });

  it('keeps Chinese errors and hides unknown English implementation details', () => {
    expect(toUserFacingMessage(new Error('代理不存在'))).toBe('代理不存在');
    expect(toUserFacingMessage(new Error('配置 JSON 无效'))).toBe('配置 JSON 无效');
    expect(toUserFacingMessage(new Error('Unexpected browser failure'))).toBe(
      '操作失败，请查看排查日志。'
    );
  });
});
