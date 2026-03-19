import { describe, expect, it } from 'vitest';
import { QuickActionsTreeProvider } from '../src/home/quickActionsTreeView';
import { COMMANDS } from '../src/utils/constants';

describe('quick actions tree view', () => {
  it('exposes stable top-level sections and command-backed items', () => {
    const provider = new QuickActionsTreeProvider();
    const sections = provider.getChildren();

    expect(sections).toHaveLength(3);
    expect(sections.map((section: any) => section.section)).toEqual(['Run', 'Device', 'Project']);

    const runItems = provider.getChildren(sections[0] as any);
    expect(runItems.length).toBeGreaterThan(0);

    const firstRunItem = provider.getTreeItem(runItems[0] as any);
    expect(firstRunItem.label).toBe('Build, Install & Run');
    expect(firstRunItem.command).toMatchObject({
      command: COMMANDS.BUILD_AND_RUN,
      title: 'Build, Install & Run',
    });
  });
});
