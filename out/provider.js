import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
export class DirCompareItem extends vscode.TreeItem {
    relPath;
    status;
    leftUri;
    rightUri;
    constructor(relPath, status, leftUri, rightUri) {
        super(relPath, vscode.TreeItemCollapsibleState.None);
        this.relPath = relPath;
        this.status = status;
        this.leftUri = leftUri;
        this.rightUri = rightUri;
        this.contextValue = "dirCompareItem";
        this.description = status;
        this.iconPath = iconFor(status);
        this.tooltip = tooltipFor(status, leftUri, rightUri);
        if (leftUri && rightUri) {
            this.command = {
                command: "dirCompare.openDiff",
                title: "Open Diff",
                arguments: [this]
            };
        }
    }
}
export class DirCompareProvider {
    context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    left;
    right;
    items = [];
    constructor(context) {
        this.context = context;
        const leftPath = context.globalState.get("dirCompare.left");
        const rightPath = context.globalState.get("dirCompare.right");
        this.left = leftPath ? vscode.Uri.file(leftPath) : undefined;
        this.right = rightPath ? vscode.Uri.file(rightPath) : undefined;
        void this.refresh();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        return this.items;
    }
    async setLeft(uri) {
        this.left = uri;
        await this.context.globalState.update("dirCompare.left", uri.fsPath);
        await this.refresh();
    }
    async setRight(uri) {
        this.right = uri;
        await this.context.globalState.update("dirCompare.right", uri.fsPath);
        await this.refresh();
    }
    async refresh() {
        this.items = await buildCompareItems(this.left, this.right);
        await vscode.commands.executeCommand("setContext", "dirCompareReady", true);
        this._onDidChangeTreeData.fire();
    }
    async copy(item, dir) {
        if (!this.left || !this.right) {
            return;
        }
        const src = dir === "L2R" ? item.leftUri : item.rightUri;
        const dst = dir === "L2R" ? item.rightUri : item.leftUri;
        if (!src) {
            void vscode.window.showWarningMessage("Source does not exist for this side.");
            return;
        }
        const dstUri = dst ?? vscode.Uri.file(path.join((dir === "L2R" ? this.right : this.left).fsPath, item.relPath));
        await ensureParentDir(dstUri.fsPath);
        await fs.copyFile(src.fsPath, dstUri.fsPath);
        void vscode.window.showInformationMessage(`Copied ${item.relPath} ${dir === "L2R" ? "Left -> Right" : "Right -> Left"}`);
        await this.refresh();
    }
}
function iconFor(status) {
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
function tooltipFor(status, left, right) {
    const l = left ? left.fsPath : "(missing)";
    const r = right ? right.fsPath : "(missing)";
    return `${status}\nLeft: ${l}\nRight: ${r}`;
}
async function ensureParentDir(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}
async function buildCompareItems(left, right) {
    if (!left && !right) {
        return [];
    }
    const leftMap = left ? await scanFiles(left.fsPath) : new Map();
    const rightMap = right ? await scanFiles(right.fsPath) : new Map();
    const all = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const relPaths = [...all].sort((a, b) => a.localeCompare(b));
    const items = [];
    for (const rel of relPaths) {
        const lPath = left ? path.join(left.fsPath, rel) : undefined;
        const rPath = right ? path.join(right.fsPath, rel) : undefined;
        const lHash = leftMap.get(rel);
        const rHash = rightMap.get(rel);
        const status = lHash && rHash ? (lHash === rHash ? "same" : "different") : lHash ? "left-only" : "right-only";
        const leftUri = lHash && lPath ? vscode.Uri.file(lPath) : undefined;
        const rightUri = rHash && rPath ? vscode.Uri.file(rPath) : undefined;
        const item = new DirCompareItem(rel, status, leftUri, rightUri);
        item.resourceUri = leftUri ?? rightUri;
        items.push(item);
    }
    return items;
}
async function scanFiles(root) {
    const out = new Map();
    async function walk(dir) {
        const ents = await fs.readdir(dir, { withFileTypes: true });
        for (const e of ents) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                await walk(full);
            }
            else if (e.isFile()) {
                const rel = path.relative(root, full).split(path.sep).join(path.posix.sep);
                out.set(rel, await fastFileSignature(full));
            }
        }
    }
    await walk(root);
    return out;
}
async function fastFileSignature(filePath) {
    const st = await fs.stat(filePath);
    const size = st.size;
    const mtime = st.mtimeMs;
    if (size <= 1024 * 1024) {
        const buf = await fs.readFile(filePath);
        const h = createHash("sha1").update(buf).digest("hex");
        return `S:${size}|M:${mtime}|H:${h}`;
    }
    const fd = await fs.open(filePath, "r");
    try {
        const head = Buffer.alloc(64 * 1024);
        const tail = Buffer.alloc(64 * 1024);
        await fd.read(head, 0, head.length, 0);
        const tailPos = Math.max(0, size - tail.length);
        await fd.read(tail, 0, tail.length, tailPos);
        const h = createHash("sha1").update(head).update(tail).digest("hex");
        return `S:${size}|H2:${h}`;
    }
    finally {
        await fd.close();
    }
}
