import * as vscode from 'vscode';

const HEX_COLOR_REGEX = /'#([0-9a-fA-F]{6,8})'/g;
const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  'Color.White': [1, 1, 1, 1],
  'Color.Black': [0, 0, 0, 1],
  'Color.Red': [1, 0, 0, 1],
  'Color.Green': [0, 0.5, 0, 1],
  'Color.Blue': [0, 0, 1, 1],
  'Color.Yellow': [1, 1, 0, 1],
  'Color.Orange': [1, 0.647, 0, 1],
  'Color.Pink': [1, 0.753, 0.796, 1],
  'Color.Grey': [0.5, 0.5, 0.5, 1],
  'Color.Gray': [0.5, 0.5, 0.5, 1],
  'Color.Brown': [0.647, 0.165, 0.165, 1],
  'Color.Transparent': [0, 0, 0, 0],
};

export function provideDocumentColors(
  document: vscode.TextDocument,
  _token: vscode.CancellationToken
): vscode.ColorInformation[] {
  const colors: vscode.ColorInformation[] = [];
  const text = document.getText();

  // Hex colors: '#RRGGBB' or '#AARRGGBB'
  let match: RegExpExecArray | null;
  HEX_COLOR_REGEX.lastIndex = 0;
  while ((match = HEX_COLOR_REGEX.exec(text)) !== null) {
    const hex = match[1];
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    const range = new vscode.Range(startPos, endPos);

    let r: number, g: number, b: number, a: number;
    if (hex.length === 8) {
      a = parseInt(hex.slice(0, 2), 16) / 255;
      r = parseInt(hex.slice(2, 4), 16) / 255;
      g = parseInt(hex.slice(4, 6), 16) / 255;
      b = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      a = 1;
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    }

    colors.push(new vscode.ColorInformation(range, new vscode.Color(r, g, b, a)));
  }

  // Named colors: Color.Red, Color.Blue, etc.
  for (const [name, [r, g, b, a]] of Object.entries(NAMED_COLORS)) {
    let idx = text.indexOf(name);
    while (idx !== -1) {
      const startPos = document.positionAt(idx);
      const endPos = document.positionAt(idx + name.length);
      colors.push(new vscode.ColorInformation(
        new vscode.Range(startPos, endPos),
        new vscode.Color(r, g, b, a)
      ));
      idx = text.indexOf(name, idx + name.length);
    }
  }

  return colors;
}

export function provideColorPresentations(
  color: vscode.Color,
  _context: { document: vscode.TextDocument; range: vscode.Range },
  _token: vscode.CancellationToken
): vscode.ColorPresentation[] {
  const r = Math.round(color.red * 255);
  const g = Math.round(color.green * 255);
  const b = Math.round(color.blue * 255);
  const a = Math.round(color.alpha * 255);

  const presentations: vscode.ColorPresentation[] = [];

  if (a === 255) {
    const hex = `'#${toHex(r)}${toHex(g)}${toHex(b)}'`;
    presentations.push(new vscode.ColorPresentation(hex));
  } else {
    const hex = `'#${toHex(a)}${toHex(r)}${toHex(g)}${toHex(b)}'`;
    presentations.push(new vscode.ColorPresentation(hex));
  }

  return presentations;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase();
}
