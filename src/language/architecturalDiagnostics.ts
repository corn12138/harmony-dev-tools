import * as vscode from 'vscode';
import { DIAG_CODES, type RawDiagnostic } from './diagnosticProvider';

/**
 * Harness Engineering: Architectural Guardrails
 * These mechanical linters enforce safe boundaries for AI Agents writing code.
 */

export function checkPageIsolation(lines: string[], filePath: string): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  if (!normalizedPath.includes('/pages/')) {
    return diags;
  }

  lines.forEach((line, i) => {
    // Check if a page imports another page
    const trimmed = line.trim();
    if (trimmed.startsWith('import ') && trimmed.includes('/pages/')) {
        diags.push({
          line: i,
          colStart: line.indexOf('/pages/'),
          colEnd: line.indexOf('/pages/') + 7,
          message: 'Harness Architecture Constraint: Pages cannot import other pages directly. Use router or Navigation component to ensure decoupling.',
          severity: vscode.DiagnosticSeverity.Error,
          code: DIAG_CODES.ARCH_PAGE_ISOLATION,
        });
    }
  });
  return diags;
}

export function checkComponentPurity(lines: string[], text: string, filePath: string): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  if (!normalizedPath.includes('/components/')) {
    return diags;
  }

  // Component Purity: cannot use @Entry
  lines.forEach((line, i) => {
    const entryIndex = line.indexOf('@Entry');
    if (entryIndex !== -1) {
      diags.push({
        line: i,
        colStart: entryIndex,
        colEnd: entryIndex + '@Entry'.length,
        message: 'Harness Architecture Constraint: The @Entry decorator is strictly forbidden in the components/ directory. UI components must be reusable, not entry points.',
        severity: vscode.DiagnosticSeverity.Error,
        code: DIAG_CODES.ARCH_COMPONENT_PURITY,
      });
    }
  });
  
  return diags;
}

export function checkRouterInComponent(lines: string[], filePath: string): RawDiagnostic[] {
  const diags: RawDiagnostic[] = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  if (!normalizedPath.includes('/components/')) {
    return diags;
  }

  lines.forEach((line, i) => {
    if (line.includes('@ohos.router') || line.includes('@system.router')) {
      const importIndex = line.indexOf('@ohos.router') !== -1 ? line.indexOf('@ohos.router') : line.indexOf('@system.router');
      diags.push({
        line: i,
        colStart: importIndex,
        colEnd: importIndex + 12, // approx
        message: 'Harness Architecture Constraint: Components should not import the router directly. Pass navigation callbacks from the Page to keep the Component pure and decouple logic.',
        severity: vscode.DiagnosticSeverity.Error,
        code: DIAG_CODES.ARCH_ROUTER_IN_COMPONENT,
      });
    }
  });

  return diags;
}
