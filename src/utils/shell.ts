export function quoteShellArg(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    const escaped = value.replace(/["%^&|<>!]/g, '^$&');
    return `"${escaped}"`;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}
