export function pacSourceStatusId(profileId: string): string {
  return `pac:${profileId}`;
}

export function ruleListSourceStatusId(sourceId: string): string {
  return `rule-list:${sourceId}`;
}
