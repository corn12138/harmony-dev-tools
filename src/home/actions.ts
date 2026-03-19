import { COMMANDS } from '../utils/constants';

export type HarmonyActionSection = 'Run' | 'Device' | 'Project';

export interface HarmonyActionDefinition {
  id: string;
  section: HarmonyActionSection;
  label: string;
  description: string;
  tooltip: string;
  icon: string;
  command: string;
}

export const HARMONY_ACTION_SECTIONS: HarmonyActionSection[] = ['Run', 'Device', 'Project'];

export const HARMONY_ACTIONS: HarmonyActionDefinition[] = [
  {
    id: 'build-and-run',
    section: 'Run',
    label: 'Build, Install & Run',
    description: 'One click on the active device',
    tooltip: 'Build the current HarmonyOS app, install it on the active device, and launch it.',
    icon: 'rocket',
    command: COMMANDS.BUILD_AND_RUN,
  },
  {
    id: 'debug-app',
    section: 'Run',
    label: 'Debug App',
    description: 'Launch with the HarmonyOS debugger',
    tooltip: 'Start a HarmonyOS debug session for the current workspace.',
    icon: 'debug-alt',
    command: COMMANDS.DEBUG_APP,
  },
  {
    id: 'build-hap',
    section: 'Run',
    label: 'Build HAP',
    description: 'Create the deployable package',
    tooltip: 'Build the current HarmonyOS project into a HAP package.',
    icon: 'play',
    command: COMMANDS.BUILD_HAP,
  },
  {
    id: 'select-device',
    section: 'Device',
    label: 'Select Active Device',
    description: 'Run, mirror, logs, and screenshot use this target',
    tooltip: 'Choose the default device used by run, mirror, logs, screenshot, and inspector actions.',
    icon: 'device-mobile',
    command: COMMANDS.SELECT_DEVICE,
  },
  {
    id: 'open-mirror',
    section: 'Device',
    label: 'Open Device Mirror',
    description: 'Live screen and input control',
    tooltip: 'Open the live device mirror and send touch, swipe, and key input.',
    icon: 'device-mobile',
    command: COMMANDS.DEVICE_MIRROR,
  },
  {
    id: 'inspect-ui',
    section: 'Device',
    label: 'Inspect Running UI',
    description: 'Tree, screenshot, and source jump',
    tooltip: 'Dump the running UI tree, preview the screen, and jump back to ArkTS source.',
    icon: 'inspect',
    command: COMMANDS.UI_INSPECTOR,
  },
  {
    id: 'view-logs',
    section: 'Device',
    label: 'Open Device Logs',
    description: 'Stream hilog from the active device',
    tooltip: 'Start a hilog stream for the selected HarmonyOS device.',
    icon: 'output',
    command: COMMANDS.VIEW_LOGS,
  },
  {
    id: 'take-screenshot',
    section: 'Device',
    label: 'Capture Device Screenshot',
    description: 'Save a PNG from the active device',
    tooltip: 'Capture a screenshot from the active device and open the saved image.',
    icon: 'device-camera',
    command: COMMANDS.TAKE_SCREENSHOT,
  },
  {
    id: 'launch-emulator',
    section: 'Device',
    label: 'Start Emulator',
    description: 'Boot a configured DevEco emulator',
    tooltip: 'Launch a configured DevEco Studio emulator and wait for it to appear in HDC.',
    icon: 'vm',
    command: COMMANDS.LAUNCH_EMULATOR,
  },
  {
    id: 'preview-component',
    section: 'Project',
    label: 'Preview ArkUI Component',
    description: 'Open the simplified component preview',
    tooltip: 'Preview the current ArkUI component inside VS Code.',
    icon: 'open-preview',
    command: COMMANDS.PREVIEW_COMPONENT,
  },
  {
    id: 'migrate-build-profile',
    section: 'Project',
    label: 'Upgrade Legacy build-profile',
    description: 'Migrate old products to current fields',
    tooltip: 'Upgrade legacy build-profile.json5 fields to current HarmonyOS conventions.',
    icon: 'sync',
    command: COMMANDS.MIGRATE_BUILD_PROFILE,
  },
  {
    id: 'check-environment',
    section: 'Project',
    label: 'Check SDK / HDC Environment',
    description: 'Verify SDK, HDC, CLT, and paths',
    tooltip: 'Run environment checks for the HarmonyOS SDK, HDC, and command-line tools.',
    icon: 'checklist',
    command: COMMANDS.CHECK_ENVIRONMENT,
  },
  {
    id: 'open-docs',
    section: 'Project',
    label: 'Open HarmonyOS Docs',
    description: 'Jump to official docs and release notes',
    tooltip: 'Open the HarmonyOS docs search with quick links to official documentation.',
    icon: 'book',
    command: COMMANDS.OPEN_DOCS,
  },
];

export function getHarmonyActionsForSection(section: HarmonyActionSection): HarmonyActionDefinition[] {
  return HARMONY_ACTIONS.filter((action) => action.section === section);
}
