import * as vscode from "vscode";
import { DirCompareProvider } from "./provider.js";
export function activate(context) {
    const provider = new DirCompareProvider(context);
    const view = vscode.window.createTreeView("dirCompareView", { treeDataProvider: provider });
    view.onDidChangeSelection(async (e) => {
        const item = e.selection[0];
        await vscode.commands.executeCommand("setContext", "dirCompareHasBoth", !!(item?.leftUri && item?.rightUri));
        await vscode.commands.executeCommand("setContext", "dirCompareHasLeft", !!item?.leftUri);
        await vscode.commands.executeCommand("setContext", "dirCompareHasRight", !!item?.rightUri);
    });
    context.subscriptions.push(view, vscode.commands.registerCommand("dirCompare.setLeft", async () => {
        const uri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: "Select LEFT folder"
        });
        if (!uri?.[0]) {
            return;
        }
        await provider.setLeft(uri[0]);
    }), vscode.commands.registerCommand("dirCompare.setRight", async () => {
        const uri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: "Select RIGHT folder"
        });
        if (!uri?.[0]) {
            return;
        }
        await provider.setRight(uri[0]);
    }), vscode.commands.registerCommand("dirCompare.refresh", async () => provider.refresh()), vscode.commands.registerCommand("dirCompare.openDiff", async (item) => {
        if (!item.leftUri || !item.rightUri) {
            return;
        }
        await vscode.commands.executeCommand("vscode.diff", item.leftUri, item.rightUri, `${item.relPath} (Left ↔ Right)`);
    }), vscode.commands.registerCommand("dirCompare.copyLeftToRight", async (item) => {
        await provider.copy(item, "L2R");
    }), vscode.commands.registerCommand("dirCompare.copyRightToLeft", async (item) => {
        await provider.copy(item, "R2L");
    }));
}
export function deactivate() { }
