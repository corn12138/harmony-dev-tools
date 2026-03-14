import * as vscode from 'vscode';
import { getResourceIndexer } from './resourceIndexer';

const RESOURCE_REF_REGEX = /\$r\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export class ResourceDefinitionProvider implements vscode.DefinitionProvider {
  private indexer = getResourceIndexer();

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Definition | undefined> {
    await this.indexer.ensureInitialized();

    const range = document.getWordRangeAtPosition(position, /\$r\s*\(\s*['"][^'"]+['"]\s*\)/);
    if (!range) return undefined;

    const text = document.getText(range);
    const match = text.match(/\$r\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (!match) return undefined;

    const resourceKey = match[1];
    const entry = this.indexer.get(resourceKey);
    if (!entry) return undefined;

    return new vscode.Location(entry.fileUri, new vscode.Position(0, 0));
  }
}

export class ResourceDiagnosticProvider implements vscode.Disposable {
  private indexer = getResourceIndexer();
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('arkts-resources');
    this.disposables.push(this.diagnosticCollection);
    void this.indexer.ensureInitialized().then(() => this.revalidateOpenDocuments());

    // Validate on file change
    const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'arkts') {
        void this.validate(doc);
      }
    });
    const onOpen = vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'arkts') {
        void this.validate(doc);
      }
    });
    this.disposables.push(onSave, onOpen);

    // Re-validate when resource index updates
    const onIndexUpdate = this.indexer.onDidUpdate(() => {
      this.revalidateOpenDocuments();
    });
    this.disposables.push(onIndexUpdate);
  }

  async validate(document: vscode.TextDocument): Promise<void> {
    await this.indexer.ensureInitialized();

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    RESOURCE_REF_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RESOURCE_REF_REGEX.exec(text)) !== null) {
      const resourceKey = match[1];

      // Skip system resources ($r('sys.xxx'))
      if (resourceKey.startsWith('sys.')) continue;

      if (!this.indexer.has(resourceKey)) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);
        diagnostics.push(new vscode.Diagnostic(
          range,
          `Resource "${resourceKey}" not found in resources/`,
          vscode.DiagnosticSeverity.Warning
        ));
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private revalidateOpenDocuments(): void {
    vscode.workspace.textDocuments
      .filter((d) => d.languageId === 'arkts')
      .forEach((d) => void this.validate(d));
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
