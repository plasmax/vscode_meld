# VSCode Meld

The VSIX is produced by GitHub Actions and uploaded as a workflow artifact (`vsix-package`).

## Optional Codex job

The workflow includes an optional `codex-job` that runs only when:
- you manually dispatch the workflow with `use_codex: true`, and
- `OPENAI_API_KEY` is configured as a repository secret.

This keeps the default build path usable without API credits.
