import {
  isSourceRequestHeader,
  type PacSource,
  type SourceRequestHeader
} from '@switchypeformance/contracts';

export interface SourceDraft {
  headersText: string;
  kind: PacSource['kind'];
  refreshEnabled: boolean;
  refreshMinutes: number;
  text: string;
  url: string;
}

export function sourceDraftFrom(source: PacSource): SourceDraft {
  if (source.kind === 'inline') {
    return {
      kind: 'inline',
      text: source.text,
      url: '',
      headersText: '',
      refreshEnabled: false,
      refreshMinutes: 60
    };
  }
  return {
    kind: 'url',
    text: '',
    url: source.url,
    headersText: source.headers.map((header) => `${header.name}: ${header.value}`).join('\n'),
    refreshEnabled: source.refresh.enabled,
    refreshMinutes: source.refresh.refreshMinutes
  };
}

export function sourceFromDraft(draft: SourceDraft): PacSource {
  if (draft.kind === 'inline') {
    return { kind: 'inline', text: draft.text };
  }
  if (!Number.isInteger(draft.refreshMinutes) || draft.refreshMinutes < 1) {
    throw new Error('刷新间隔无效');
  }
  return {
    kind: 'url',
    url: draft.url,
    headers: parseHeaders(draft.headersText),
    refresh: {
      enabled: draft.refreshEnabled,
      refreshMinutes: draft.refreshMinutes
    }
  };
}

function parseHeaders(value: string): readonly SourceRequestHeader[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator < 1) {
        throw new Error('自定义请求头必须使用“名称: 内容”格式');
      }
      const header = {
        name: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim()
      };
      if (!isSourceRequestHeader(header)) {
        throw new Error('自定义请求头无效');
      }
      return header;
    });
}
