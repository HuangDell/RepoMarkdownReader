import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test.beforeAll(async ({ request }) => {
  await request.get('/api/repos');
  const dataDir = process.env.READER_TEST_DATA_DIR!;
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  const timestamp = new Date().toISOString();
  for (const id of ['alpha', 'beta']) {
    if (db.prepare('SELECT id FROM repositories WHERE id = ?').get(id)) continue;
    const worktree = path.join(dataDir, 'repos', id, 'worktree');
    mkdirSync(worktree, { recursive: true });
    db.prepare(`INSERT INTO repositories (id, url, owner, name, local_path, status, created_at, updated_at)
      VALUES (?, ?, 'test', ?, ?, 'local_changes', ?, ?)`).run(id, `https://github.com/test/${id}`, id, worktree, timestamp, timestamp);
    const files = id === 'alpha' ? ['README.md', 'index.md', 'guide/intro.md', 'guide/deep/topic.md'] : ['other.md'];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
      const body = `# ${file}\n\nFixture content for ${file}.\n\n[Go deep](./deep/topic.md)\n`;
      writeFileSync(path.join(worktree, file), body);
      db.prepare(`INSERT INTO documents (id, repo_id, path, title, body_text, file_hash, commit_sha, updated_at)
        VALUES (?, ?, ?, ?, ?, 'fixture', 'fixture', ?)`).run(`${id}:${file}`, id, file, file, body, timestamp);
    }
    execFileSync('git', ['init', '-b', 'main', worktree]);
    execFileSync('git', ['add', '.'], { cwd: worktree });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Fixture'], { cwd: worktree });
  }
  db.close();
});

test('single-level navigation preserves the document and shows both index files', async ({ page }) => {
  await page.goto('/docs');
  const explorer = page.getByRole('navigation', { name: 'Explorer', exact: true });
  await explorer.getByRole('button', { name: 'test/alpha', exact: true }).click();
  await expect(explorer.getByRole('button', { name: 'test/beta', exact: true })).toHaveCount(0);
  await expect(explorer.getByRole('link', { name: 'README', exact: true })).toBeVisible();
  await expect(explorer.getByRole('link', { name: 'index', exact: true })).toBeVisible();
  await explorer.getByRole('button', { name: 'guide', exact: true }).click();
  await expect(explorer.getByRole('link', { name: 'README', exact: true })).toHaveCount(0);
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL('/docs');
  await explorer.getByRole('link', { name: 'intro', exact: true }).click();
  await expect(page).toHaveURL('/docs/alpha/guide/intro.md');
  await explorer.getByRole('button', { name: 'deep', exact: true }).click();
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toBeVisible();
  await expect(page).toHaveURL('/docs/alpha/guide/intro.md');
  await expect(explorer.getByRole('link', { name: 'intro', exact: true })).toHaveCount(0);
  await explorer.getByRole('button', { name: 'Back to parent directory' }).click();
  await expect(explorer.getByRole('link', { name: 'intro', exact: true })).toHaveAttribute('data-active', 'true');
  await explorer.getByRole('button', { name: 'Back to parent directory' }).click();
  await explorer.getByRole('button', { name: 'Back to parent directory' }).click();
  await expect(explorer.getByRole('button', { name: 'test/beta', exact: true })).toBeVisible();
  await expect(explorer.getByRole('button', { name: 'Back to parent directory' })).toHaveCount(0);
  await page.reload();
  await expect(explorer.getByRole('link', { name: 'intro', exact: true })).toHaveAttribute('data-active', 'true');
  await page.getByRole('link', { name: 'Go deep', exact: true }).click();
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toHaveAttribute('data-active', 'true');
  await page.goBack();
  await expect(explorer.getByRole('link', { name: 'intro', exact: true })).toHaveAttribute('data-active', 'true');
  await page.goForward();
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toHaveAttribute('data-active', 'true');
});

test('folder operations use the current directory and preserve navigation', async ({ page }) => {
  await page.goto('/docs/alpha/guide/intro.md');
  const explorer = page.getByRole('navigation', { name: 'Explorer', exact: true });
  await explorer.getByRole('button', { name: 'Create subfolder in current directory' }).click();
  await expect(explorer.getByRole('button', { name: 'Back to parent directory' })).toBeDisabled();
  await explorer.getByRole('textbox', { name: 'New folder name' }).fill('created');
  await explorer.getByRole('button', { name: 'Save', exact: true }).click();
  await explorer.getByRole('button', { name: 'created', exact: true }).click();
  await expect(explorer.getByText('This folder is empty.')).toBeVisible();
  await explorer.getByRole('button', { name: 'Rename created', exact: true }).click();
  await explorer.getByRole('textbox', { name: 'Rename folder' }).fill('renamed');
  await explorer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(explorer.getByRole('button', { name: 'Rename renamed', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await explorer.getByRole('button', { name: 'Upload Markdown files to renamed', exact: true }).click();
  await (await chooser).setFiles({ name: 'uploaded.md', mimeType: 'text/markdown', buffer: Buffer.from('# Uploaded\n') });
  await expect(explorer.getByRole('link', { name: /uploaded/ })).toHaveAttribute('href', '/docs/alpha/guide/renamed/uploaded.md');
  await expect(page).toHaveURL('/docs/alpha/guide/intro.md');
  await explorer.getByRole('button', { name: 'Create subfolder in current directory' }).click();
  await explorer.getByRole('textbox', { name: 'New folder name' }).fill('../invalid');
  await explorer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(explorer.getByRole('alert')).toBeVisible();
  await explorer.getByRole('textbox', { name: 'New folder name' }).press('Escape');
  await expect(explorer.getByRole('button', { name: 'Back to parent directory' })).toBeEnabled();
  await explorer.getByRole('button', { name: 'Back to parent directory' }).click();
  const uploads: string[] = [];
  page.on('request', (request) => { if (request.url().endsWith('/uploads')) uploads.push(request.url()); });
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['# Dropped'], 'dropped.md', { type: 'text/markdown' }));
    return data;
  });
  await explorer.getByRole('button', { name: 'renamed', exact: true }).dispatchEvent('drop', { dataTransfer: transfer });
  await expect(explorer.getByRole('status')).toHaveCount(0);
  await explorer.getByRole('button', { name: 'renamed', exact: true }).click();
  await expect(explorer.getByRole('link', { name: /dropped/ })).toHaveAttribute('href', '/docs/alpha/guide/renamed/dropped.md');
  expect(uploads).toHaveLength(1);
  await transfer.dispose();
});

test('mobile drawer supports directory navigation and closes on file selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/alpha/guide/intro.md');
  await page.getByRole('button', { name: 'Open Sidebar' }).click();
  const explorer = page.getByRole('navigation', { name: 'Explorer', exact: true });
  await explorer.getByRole('button', { name: 'deep', exact: true }).click();
  await expect(explorer).toBeVisible();
  await expect(page).toHaveURL('/docs/alpha/guide/intro.md');
  await explorer.getByRole('link', { name: 'topic', exact: true }).click();
  await expect(explorer).not.toBeVisible();
  await expect(page).toHaveURL('/docs/alpha/guide/deep/topic.md');
});

test('desktop collapse, resizing, keyboard navigation and mobile state share one location', async ({ page }) => {
  await page.goto('/docs/alpha/guide/intro.md');
  const explorer = page.getByRole('navigation', { name: 'Explorer', exact: true });
  await explorer.getByRole('button', { name: 'deep', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle Explorer' }).click();
  await page.getByRole('button', { name: 'Expand Explorer' }).click();
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toBeVisible();
  const sidebar = page.locator('#nd-sidebar');
  const before = await sidebar.boundingBox();
  await page.getByRole('separator', { name: 'Resize Explorer' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before!.width);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open Sidebar' }).click();
  await expect(explorer.getByRole('link', { name: 'topic', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-explorer.png') });
});
