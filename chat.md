Below is a minimal, working VS Code extension scaffold that gives you a Meld-like directory compare:

* A single Tree View showing the union of relative paths
* Per-item status: same, different, left-only, right-only
* Click to open file diff (uses built-in `vscode.diff`)
* Context menu actions to copy Left -> Right or Right -> Left (creates parent dirs)

### 1) Create the extension project

```bash
mkdir vscode-dir-compare
cd vscode-dir-compare
npm init -y
npm i --save-dev typescript @types/node @types/vscode esbuild
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "types": ["node", "vscode"]
  },
  "exclude": ["node_modules"]
}
```

Add build scripts to `package.json`:

```json
{
  "name": "vscode-dir-compare",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./out/extension.js",
  "scripts": {
    "build": "tsc -p .",
    "watch": "tsc -p . -w"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/vscode": "^1.92.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.6.0"
  }
}
```

### 2) `package.json` (extension manifest)

Replace your `package.json` with this manifest content (keep your deps/scripts as needed):

```json
{
  "name": "vscode-dir-compare",
  "displayName": "Directory Compare (Meld-like)",
  "description": "Compare two directories, diff files, and copy left/right.",
  "version": "0.0.1",
  "publisher": "local",
  "engines": { "vscode": "^1.92.0" },
  "categories": ["Other"],
  "activationEvents": [
    "onView:dirCompareView",
    "onCommand:dirCompare.setLeft",
    "onCommand:dirCompare.setRight",
    "onCommand:dirCompare.refresh"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "dirCompare",
          "title": "Dir Compare",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "dirCompare": [
        {
          "id": "dirCompareView",
          "name": "Compare"
        }
      ]
    },
    "commands": [
      { "command": "dirCompare.setLeft", "title": "Dir Compare: Set Left Folder" },
      { "command": "dirCompare.setRight", "title": "Dir Compare: Set Right Folder" },
      { "command": "dirCompare.refresh", "title": "Dir Compare: Refresh" },
      { "command": "dirCompare.openDiff", "title": "Dir Compare: Open Diff" },
      { "command": "dirCompare.copyLeftToRight", "title": "Dir Compare: Copy Left -> Right" },
      { "command": "dirCompare.copyRightToLeft", "title": "Dir Compare: Copy Right -> Left" }
    ],
    "menus": {
      "view/title": [
        { "command": "dirCompare.setLeft", "when": "view == dirCompareView", "group": "navigation" },
        { "command": "dirCompare.setRight", "when": "view == dirCompareView", "group": "navigation" },
        { "command": "dirCompare.refresh", "when": "view == dirCompareView", "group": "navigation" }
      ],
      "view/item/context": [
        {
          "command": "dirCompare.openDiff",
          "when": "view == dirCompareView && viewItem == dirCompareItem && dirCompareHasBoth == true",
          "group": "navigation"
        },
        {
          "command": "dirCompare.copyLeftToRight",
          "when": "view == dirCompareView && viewItem == dirCompareItem && dirCompareHasLeft == true",
          "group": "inline"
        },
        {
          "command": "dirCompare.copyRightToLeft",
          "when": "view == dirCompareView && viewItem == dirCompareItem && dirCompareHasRight == true",
          "group": "inline"
        }
      ]
    }
  }
}
```

Create `media/icon.svg` (any simple icon). Example:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="4" width="8" height="16" rx="1"/>
  <rect x="13" y="4" width="8" height="16" rx="1"/>
</svg>
```

### 3) Source code

Create `src/extension.ts`:

```ts
import * as vscode from "vscode";
import { DirCompareProvider, DirCompareItem } from "./provider.js";

export function activate(context: vscode.ExtensionContext) {
  const provider = new DirCompareProvider(context);
  const view = vscode.window.createTreeView("dirCompareView", { treeDataProvider: provider });

  context.subscriptions.push(
    view,
    vscode.commands.registerCommand("dirCompare.setLeft", async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: "Select LEFT folder"
      });
      if (!uri?.[0]) return;
      await provider.setLeft(uri[0]);
    }),
    vscode.commands.registerCommand("dirCompare.setRight", async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: "Select RIGHT folder"
      });
      if (!uri?.[0]) return;
      await provider.setRight(uri[0]);
    }),
    vscode.commands.registerCommand("dirCompare.refresh", async () => provider.refresh()),

    vscode.commands.registerCommand("dirCompare.openDiff", async (item: DirCompareItem) => {
      if (!item.leftUri || !item.rightUri) return;
      await vscode.commands.executeCommand(
        "vscode.diff",
        item.leftUri,
        item.rightUri,
        `${item.relPath} (Left ↔ Right)`
      );
    }),

    vscode.commands.registerCommand("dirCompare.copyLeftToRight", async (item: DirCompareItem) => {
      await provider.copy(item, "L2R");
    }),
    vscode.commands.registerCommand("dirCompare.copyRightToLeft", async (item: DirCompareItem) => {
      await provider.copy(item, "R2L");
    })
  );
}

export function deactivate() {}
```

Create `src/provider.ts`:

```ts
import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";

type Side = "L2R" | "R2L";

type Status = "same" | "different" | "left-only" | "right-only" | "unknown";

export class DirCompareItem extends vscode.TreeItem {
  constructor(
    public readonly relPath: string,
    public readonly status: Status,
    public readonly leftUri?: vscode.Uri,
    public readonly rightUri?: vscode.Uri
  ) {
    super(relPath, vscode.TreeItemCollapsibleState.None);

    this.contextValue = "dirCompareItem";

    // Context keys for menus
    this.description = status;

    const hasLeft = !!leftUri;
    const hasRight = !!rightUri;

    // These become "when" context via TreeItem properties
    // by setting them on the tree item's command arguments, we also set view item context via setContext below in refresh()
    // Icon + tooltip
    this.iconPath = iconFor(status);
    this.tooltip = tooltipFor(status, leftUri, rightUri);

    if (hasLeft && hasRight) {
      this.command = {
        command: "dirCompare.openDiff",
        title: "Open Diff",
        arguments: [this]
      };
    }
  }
}

export class DirCompareProvider implements vscode.TreeDataProvider<DirCompareItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DirCompareItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private left?: vscode.Uri;
  private right?: vscode.Uri;

  private items: DirCompareItem[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.left = context.globalState.get<string>("dirCompare.left")
      ? vscode.Uri.file(context.globalState.get<string>("dirCompare.left")!)
      : undefined;
    this.right = context.globalState.get<string>("dirCompare.right")
      ? vscode.Uri.file(context.globalState.get<string>("dirCompare.right")!)
      : undefined;

    void this.refresh();
  }

  getTreeItem(element: DirCompareItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<DirCompareItem[]> {
    return this.items;
  }

  async setLeft(uri: vscode.Uri) {
    this.left = uri;
    await this.context.globalState.update("dirCompare.left", uri.fsPath);
    await this.refresh();
  }

  async setRight(uri: vscode.Uri) {
    this.right = uri;
    await this.context.globalState.update("dirCompare.right", uri.fsPath);
    await this.refresh();
  }

  async refresh() {
    this.items = await buildCompareItems(this.left, this.right);

    // Set global context for menu enablement
    // Per-item contexts are handled by contextValue plus our custom keys on the tree view via setContext on selection changes (simple approach below)
    await vscode.commands.executeCommand("setContext", "dirCompareReady", true);

    this._onDidChangeTreeData.fire();

    // For per-item "when" clauses, we use setContext on selection change
    // This keeps the manifest simple.
    // If you want per-item enablement without selection, you can split contextValues into multiple types instead.
  }

  async copy(item: DirCompareItem, dir: Side) {
    if (!this.left || !this.right) return;

    const src = dir === "L2R" ? item.leftUri : item.rightUri;
    const dst = dir === "L2R" ? item.rightUri : item.leftUri;

    if (!src) {
      vscode.window.showWarningMessage("Source does not exist for this side.");
      return;
    }

    // If destination Uri is missing (right-only/left-only), create it from base + relPath
    const dstUri =
      dst ??
      vscode.Uri.file(
        path.join((dir === "L2R" ? this.right : this.left).fsPath, item.relPath)
      );

    await ensureParentDir(dstUri.fsPath);
    await fs.copyFile(src.fsPath, dstUri.fsPath);

    vscode.window.showInformationMessage(
      `Copied ${item.relPath} ${dir === "L2R" ? "Left -> Right" : "Right -> Left"}`
    );
    await this.refresh();
  }
}

function iconFor(status: Status): vscode.ThemeIcon {
  switch (status) {
    case "same":
      return new vscode.ThemeIcon("check");
    case "different":
      return new vscode.ThemeIcon("diff");
    case "left-only":
    case "right-only":
      return new vscode.ThemeIcon("warning");
    default:
      return new vscode.ThemeIcon("question");
  }
}

function tooltipFor(status: Status, left?: vscode.Uri, right?: vscode.Uri): string {
  const l = left ? left.fsPath : "(missing)";
  const r = right ? right.fsPath : "(missing)";
  return `${status}\nLeft: ${l}\nRight: ${r}`;
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function buildCompareItems(left?: vscode.Uri, right?: vscode.Uri): Promise<DirCompareItem[]> {
  if (!left && !right) return [];

  const leftMap = left ? await scanFiles(left.fsPath) : new Map<string, string>();
  const rightMap = right ? await scanFiles(right.fsPath) : new Map<string, string>();

  const all = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
  const relPaths = [...all].sort((a, b) => a.localeCompare(b));

  const items: DirCompareItem[] = [];
  for (const rel of relPaths) {
    const lPath = left ? path.join(left.fsPath, rel) : undefined;
    const rPath = right ? path.join(right.fsPath, rel) : undefined;

    const lHash = leftMap.get(rel);
    const rHash = rightMap.get(rel);

    const status: Status =
      lHash && rHash ? (lHash === rHash ? "same" : "different") : lHash ? "left-only" : "right-only";

    const leftUri = lHash && lPath ? vscode.Uri.file(lPath) : undefined;
    const rightUri = rHash && rPath ? vscode.Uri.file(rPath) : undefined;

    const item = new DirCompareItem(rel, status, leftUri, rightUri);

    // Enable context menu items with simple context keys.
    // These keys are evaluated on selection, but that's usually fine for copy operations.
    item.resourceUri = leftUri ?? rightUri;

    items.push(item);
  }

  return items;
}

async function scanFiles(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  async function walk(dir: string) {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join(path.posix.sep);
        out.set(rel, await fastFileSignature(full));
      }
    }
  }

  await walk(root);
  return out;
}

// Fast signature: size + mtime + small-content hash for small files
async function fastFileSignature(filePath: string): Promise<string> {
  const st = await fs.stat(filePath);
  const size = st.size;
  const mtime = st.mtimeMs;

  if (size <= 1024 * 1024) {
    const buf = await fs.readFile(filePath);
    const h = createHash("sha1").update(buf).digest("hex");
    return `S:${size}|M:${mtime}|H:${h}`;
  }

  // For large files: hash first+last 64KB plus size
  const fd = await fs.open(filePath, "r");
  try {
    const head = Buffer.alloc(64 * 1024);
    const tail = Buffer.alloc(64 * 1024);

    await fd.read(head, 0, head.length, 0);
    const tailPos = Math.max(0, size - tail.length);
    await fd.read(tail, 0, tail.length, tailPos);

    const h = createHash("sha1").update(head).update(tail).digest("hex");
    return `S:${size}|H2:${h}`;
  } finally {
    await fd.close();
  }
}
```

Add `src/provider.js` imports note: TS with `module: NodeNext` expects explicit `.js` in imports, as shown.

### 4) Fix the context menu `when` keys (simple selection-based)

In `refresh()` we did only a global key. To make the per-item `when` keys work, add this to `activate()` after creating the view:

```ts
view.onDidChangeSelection(async (e) => {
  const item = e.selection[0];
  await vscode.commands.executeCommand("setContext", "dirCompareHasBoth", !!(item?.leftUri && item?.rightUri));
  await vscode.commands.executeCommand("setContext", "dirCompareHasLeft", !!item?.leftUri);
  await vscode.commands.executeCommand("setContext", "dirCompareHasRight", !!item?.rightUri);
});
```

### 5) Run it

* Open this folder in VS Code
* Run `npm run build`
* Press `F5` to launch Extension Development Host
* In the new window, open the “Dir Compare” activity bar icon
* Set Left, set Right, then use the tree:

  * Click a file to diff
  * Right-click to copy left/right

If you want a true two-pane UI (left tree and right tree side by side), the next step is a Webview view with a custom React UI, but the above is the simplest “Meld-like” workflow while still using VS Code’s native diff and file ops.
