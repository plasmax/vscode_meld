# VSCode Meld

VSCode Meld is a lightweight VS Code extension that provides a Meld-like folder comparison workflow using native VS Code UI.

## Features

- Compare two folders in a single tree view (union of relative file paths).
- Status per path:
  - `same`
  - `different`
  - `left-only`
  - `right-only`
- Click an item with both sides present to open a built-in VS Code diff.
- Copy files directly from left to right or right to left from the item context menu.
- Remembers previously selected left/right folders via extension global state.

## Commands

- **Dir Compare: Set Left Folder** (`dirCompare.setLeft`)
- **Dir Compare: Set Right Folder** (`dirCompare.setRight`)
- **Dir Compare: Refresh** (`dirCompare.refresh`)
- **Dir Compare: Open Diff** (`dirCompare.openDiff`)
- **Dir Compare: Copy Left -> Right** (`dirCompare.copyLeftToRight`)
- **Dir Compare: Copy Right -> Left** (`dirCompare.copyRightToLeft`)

## Usage

1. Open the extension in VS Code and run `npm run build`.
2. Press `F5` to launch an Extension Development Host.
3. In the new VS Code window, open the **Dir Compare** activity bar view.
4. Use the toolbar actions:
   - **Set Left Folder**
   - **Set Right Folder**
5. Browse the file list:
   - Click an item with both sides present to open a diff.
   - Right-click an item to copy one side to the other.
6. Use **Refresh** after external file changes.

## Development

```bash
npm install
npm run build
```

For iterative development:

```bash
npm run watch
```
