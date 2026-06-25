# GitHub Markdown Reader - Requirements Draft

Last updated: 2026-06-24

## Background

This project is intended to be a self-hosted web service for reading and managing Markdown documents stored in GitHub repositories. The first deployment target is a Raspberry Pi, so the system should stay lightweight, easy to operate, and friendly to ARM/Linux deployment.

The product should feel closer to a personal blog or knowledge base than a raw Git repository browser: documents should be easy to browse, search, read on desktop/mobile, annotate, and eventually edit back into Git.

## Current Requirements

### Visual And Reading Experience

- Target a documentation/blog reading experience similar to https://labuladong.online/zh/algo/home/.
- Desktop layout should support:
  - Top navigation bar.
  - Left repository/document navigation sidebar.
  - Center Markdown article content.
  - Right in-page table of contents.
  - Floating assistant/note/action entry points when useful.
- Mobile layout should collapse navigation and table of contents into drawers or sheets.
- The reading surface should prioritize long-form technical content, code blocks, formulas, headings, and internal links.

### Markdown Reading

- Render Markdown documents from cloned GitHub repositories.
- Support desktop and mobile reading layouts.
- Support mathematical formulas in Markdown, including inline and block formulas.
- Preserve common GitHub Flavored Markdown behavior where practical, including tables, code blocks, task lists, images, and relative links.
- Render should be safe: sanitize untrusted HTML and avoid arbitrary script execution from repository content.

### Repository Management

- Support multiple GitHub repositories.
- Allow adding a repository by entering a GitHub clone URL.
- After adding a repository, the service should clone it into local storage automatically.
- Periodically pull configured repositories to keep local content up to date.
- Support deleting a repository from the service.
- Deleting a repository should distinguish between:
  - Removing the repository from the service registry only.
  - Removing both the registry entry and local cloned files.

### Online Editing And Git Writeback

- Support online Markdown editing.
- Support commit and push after editing.
- Editing should show a preview before committing.
- The system needs GitHub authentication or server-side Git credentials for private repositories and push operations.
- Conflict handling is required when the remote repository changed after the local copy was loaded.
- The first implementation can assume a single trusted admin user.

Potential authentication approaches:

- Personal deployment MVP: store a fine-grained GitHub personal access token or SSH key on the Raspberry Pi, scoped to selected repositories.
- More robust later version: integrate GitHub OAuth or GitHub App authentication, so access can be granted per user or per installation.

### Hand Notes / Draft Notes

- Support temporary notes that do not modify original Markdown files.
- Notes should be displayed like side comments next to the document.
- Notes should be saved locally, not committed by default.
- Notes should be associated with at least repository, branch/ref, document path, and optional line/heading/anchor information.
- Future option: promote selected notes into Markdown edits and commit them.

### Raspberry Pi Deployment

- Prefer a single deployable service with minimal dependencies.
- Docker Compose should be supported if the runtime stack allows it.
- Local persistent storage is required for cloned repositories, metadata, notes, credentials, and logs.
- SQLite is likely sufficient for the first version.
- Avoid mandatory heavyweight services unless a later requirement justifies them.

## Open Source Project Survey

No surveyed project appears to match the full requirement set directly, especially the combination of multi-repository GitHub ingestion, blog-like Markdown rendering, online Git writeback, and side-note drafts. Several projects are useful references or partial building blocks.

### Gollum

- URL: https://github.com/gollum/gollum
- License: MIT.
- Type: Git-backed wiki.
- Relevant capabilities:
  - A wiki is a Git repository containing human-editable markup files.
  - Supports Markdown and other markup formats.
  - Provides a built-in web editing interface.
  - Supports math rendering through KaTeX or MathJax.
  - Can run locally and view/edit cloned GitHub or GitLab wiki repositories.
- Fit:
  - Strong reference for "Git repository as editable wiki".
  - Useful if the product can be wiki-shaped.
  - Less suitable as a direct base if we need arbitrary multi-repository blog/document browsing, custom side-note drafts, and repository management UX.

### Wiki.js

- URL: https://js.wiki/
- Git storage docs: https://docs.requarks.io/storage/git
- Type: Self-hosted wiki / knowledge base.
- Relevant capabilities:
  - Has Git-backed storage that can synchronize with a remote Git repository.
  - Supports bidirectional sync and scheduled sync.
  - Supports GitHub authentication flows/configuration.
- Important limitation:
  - The Git storage docs state that a Git repository must be dedicated to Wiki.js, and using only a subfolder or submodules is not supported there.
- Fit:
  - Strong reference for admin UX, page editing, authentication, and Git sync.
  - Less aligned with reading arbitrary existing GitHub repositories as-is, especially multiple repos with their own structure.

### Gitea / Forgejo

- Gitea URL: https://about.gitea.com/
- Repository mirror docs: https://docs.gitea.com/usage/repo-mirror
- Markdown docs: https://docs.gitea.com/usage/markdown
- External renderer docs: https://docs.gitea.com/administration/external-renderers
- Type: Self-hosted Git forge.
- Relevant capabilities:
  - Supports repository pull mirroring from external sources.
  - Supports push mirroring to GitHub using a token.
  - Renders Markdown with GitHub-like behavior and math expressions.
  - Can be self-hosted and run on small Linux machines.
- Fit:
  - Strong option if the main goal becomes self-hosted Git management.
  - It already solves many Git, repository, credential, mirror, and web editing problems.
  - It is not blog/document-reader-first, and side-note drafts would require customization or a companion app.

### MkDocs / Material For MkDocs

- MkDocs URL: https://www.mkdocs.org/
- Material math docs: https://squidfunk.github.io/mkdocs-material/reference/math/
- Type: Static documentation site generator.
- Relevant capabilities:
  - Converts Markdown into static documentation websites.
  - Material for MkDocs supports strong documentation UX and math rendering.
- Fit:
  - Good reference for Markdown rendering, navigation, search, and responsive reading UX.
  - Not a direct fit for online editing, multi-repository management, periodic Git pulls, or draft notes unless wrapped by a custom service.

### Docusaurus

- URL: https://docusaurus.io/
- Math docs: https://docusaurus.io/docs/markdown-features/math-equations
- Type: Static documentation/blog generator.
- Relevant capabilities:
  - Supports docs and blog layouts.
  - Supports math equations with KaTeX through remark/rehype plugins.
  - Good responsive reading experience.
- Fit:
  - Useful reference for blog/document UI and Markdown pipeline.
  - Not enough by itself because Git clone/pull, editing, pushing, and side-note drafts need custom backend work.

### docsify

- URL: https://docsify.js.org/
- Repository: https://github.com/docsifyjs/docsify
- Type: Client-side documentation site generator.
- Relevant capabilities:
  - Renders Markdown into a documentation site in the browser.
  - Very lightweight compared with full static build systems.
- Fit:
  - Useful reference for lightweight Markdown browsing.
  - Not enough for repository management, authenticated editing, Git writeback, or local side-note persistence.

## Initial Product Direction

The most realistic direction is to build a small custom service and reuse proven libraries for the hard parts:

- Git operations: use the system `git` binary or a mature library, with explicit locking per repository.
- Markdown rendering: use a mature Markdown pipeline such as `remark`/`rehype` with `remark-gfm`, `remark-math`, and `rehype-katex`, or `markdown-it` with equivalent plugins.
- Editor: use CodeMirror or Monaco with Markdown preview.
- Storage: use SQLite for repository registry, document metadata, notes, sync status, and credentials metadata.
- Deployment: package as a Docker image or simple Node/Python service runnable on Raspberry Pi.

This keeps the product aligned with the desired workflow instead of forcing the requirements into a wiki or Git forge.

## Recommended Secondary Development Base

The preferred direction is not to fork a full Git forge or wiki. Instead, use an open-source documentation UI/framework as the frontend base and build a small custom backend around Git operations.

Recommended frontend bases:

- Fumadocs + Next.js: best fit if the service needs a polished docs UI, React customization, API routes, authentication, online editing, and server-side Git operations in one stack.
- Nextra + Next.js: also a good fit for a docs/blog UI with MDX, but slightly less composable than Fumadocs for building a custom product shell.
- VitePress: very close to the desired reading layout and very lightweight, but better for static docs than a dynamic repository-management web service.
- Docusaurus: mature and feature-rich for docs/blogs, but heavier and still primarily static-site oriented.

Projects not recommended as the main fork target:

- Gitea / Forgejo: excellent Git management, but the product UX would feel like a Git forge rather than a personal Markdown reader.
- Wiki.js: good wiki/admin features, but Git storage is more opinionated and less aligned with reading arbitrary multiple GitHub repositories as-is.
- Gollum: simple Git-backed wiki, useful as reference, but too wiki-shaped for the desired polished docs/blog experience.

Difficulty estimate:

- Static reader only: low to medium.
- Multi-repository clone/pull plus Markdown rendering: medium.
- Online edit, commit, push, credentials, and conflict handling: medium to high.
- Side-note drafts aligned with document anchors/lines across file changes: medium to high.
- A polished labuladong-like desktop/mobile UI: medium, mostly frontend detail work.

Overall, the project is feasible. The hard part is not rendering Markdown; the hard part is making Git writeback, repository sync, authentication, conflicts, and notes reliable.

## Suggested MVP Scope

1. Single-user local deployment.
2. Add/list/remove GitHub repositories.
3. Clone repository on add.
4. Periodic `git pull` with visible sync status.
5. Browse Markdown files by repository and path.
6. Render Markdown, formulas, code blocks, images, and relative links.
7. Responsive desktop/mobile document viewer.
8. Local side notes attached to documents.
9. Manual edit, preview, commit, and push for one repository.
10. Basic conflict detection and error reporting.

## Open Questions

- Should the service only support GitHub, or should generic Git URLs be supported from the start?
- Should notes attach to line numbers, headings, selected text ranges, or all three?
- Is the first version single-user only, or should multiple user accounts be planned immediately?
- Should online editing push directly to the default branch, or create a branch/PR workflow?
- Are private repositories required in the first version?
- Should repository deletion remove local cloned data by default?
- Is full-text search needed in the MVP?
- Should rendering support only Markdown, or also MDX, notebooks, or other formats later?

## Security Notes

- Repository Markdown must be treated as untrusted input.
- HTML in Markdown should be sanitized or disabled.
- Git credentials must be encrypted at rest or stored in a restricted file with clear operational guidance.
- Push credentials should be scoped narrowly, ideally per repository.
- Avoid exposing repository management and editing endpoints without authentication.
- Pull/push operations should be serialized per repository to avoid corrupting the working tree.

## Candidate Architecture

### Backend

- Repository registry API.
- Git worker for clone, pull, status, commit, push.
- Markdown file scanner and metadata indexer.
- Render API for Markdown to sanitized HTML.
- Notes API backed by SQLite.
- Auth middleware for admin-only operations.

### Frontend

- Repository selector.
- Document tree / navigation sidebar.
- Markdown reader with responsive layout.
- Side-note panel on desktop.
- Notes drawer or bottom sheet on mobile.
- Markdown editor with live preview.
- Sync and commit status indicators.

### Local Data Layout

Example:

```text
data/
  repos/
    <repo-id>/
      worktree/
  app.db
  logs/
```

## References

- Gollum: https://github.com/gollum/gollum
- Wiki.js Git storage: https://docs.requarks.io/storage/git
- Gitea repository mirror: https://docs.gitea.com/usage/repo-mirror
- Gitea Markdown rendering: https://docs.gitea.com/usage/markdown
- Gitea external renderers: https://docs.gitea.com/administration/external-renderers
- MkDocs: https://www.mkdocs.org/
- Material for MkDocs math: https://squidfunk.github.io/mkdocs-material/reference/math/
- Docusaurus math equations: https://docusaurus.io/docs/markdown-features/math-equations
- docsify: https://docsify.js.org/
