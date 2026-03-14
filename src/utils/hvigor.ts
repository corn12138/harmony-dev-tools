export interface HvigorCommandOptions {
  task: string;
  module?: string;
  platform?: NodeJS.Platform;
}

export function getHvigorExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'hvigorw.bat' : './hvigorw';
}

export function buildHvigorCommand(options: HvigorCommandOptions): string {
  const platform = options.platform ?? process.platform;
  const executable = getHvigorExecutable(platform);
  const modulePart = options.module ? `:${options.module}:` : '';
  const command = `${executable} ${modulePart}${options.task} --no-daemon`;

  if (platform === 'win32') {
    return command;
  }

  return `chmod +x ./hvigorw 2>/dev/null && ${command}`;
}
