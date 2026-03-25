export function shouldUseBatchShell(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}
