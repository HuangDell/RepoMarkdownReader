import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const content = [
  '# Disclosure fixture',
  '',
  '<h2 id="html-heading">HTML heading</h2>',
  '',
  '## Markdown heading',
  '',
  '<details>',
  '<summary>Explanation</summary>',
  '',
  'Expanded **Markdown** with $a^2$ and a note.[^note]',
  '',
  '- First item',
  '- Second item',
  '',
  '```python',
  'print("Hello")',
  '```',
  '',
  '$$',
  '\\sqrt{x} = \\frac{1}{2}',
  '$$',
  '',
  '[Relative document](./other.md)',
  '',
  '<a href="./other.md">HTML document</a>',
  '<img src="./pixel.png" alt="Local image">',
  '',
  '<details>',
  '<summary>Nested explanation</summary>',
  '',
  'Nested content.',
  '',
  '</details>',
  '',
  '</details>',
  '',
  '<details open><summary>Initially expanded</summary><p>Visible immediately.</p></details>',
  '',
  '## Markdown heading',
  '',
  '<a href="#html-heading">HTML anchor</a>',
  '',
  '[^note]: Footnote content.',
  '',
  '<script>window.disclosureAttack = true</script>',
  '<details ontoggle="window.disclosureAttack = true"><summary onclick="window.disclosureAttack = true">Unsafe attributes</summary></details>',
  '<a href="javascript:window.disclosureAttack=true">Unsafe link</a>',
  '<a href="java&#x73;cript:window.disclosureAttack=true">Encoded unsafe link</a>',
  '<img src="data:text/html,unsafe" onerror="window.disclosureAttack = true" alt="Unsafe image">',
  '<div class="fixed" style="position:fixed;inset:0">Untrusted styling</div>',
  '<iframe src="https://example.com"></iframe>',
].join('\n');

test.beforeAll(async ({ request }) => {
  await request.get('/api/repos');
  const dataDir = process.env.READER_TEST_DATA_DIR!;
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  if (db.prepare("SELECT id FROM repositories WHERE id = 'disclosures'").get()) {
    db.close();
    return;
  }
  const worktree = path.join(dataDir, 'repos', 'disclosures', 'worktree');
  mkdirSync(worktree, { recursive: true });
  writeFileSync(path.join(worktree, 'README.md'), content);
  writeFileSync(path.join(worktree, 'other.md'), '# Other document\n');
  writeFileSync(path.join(worktree, 'pixel.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64',
  ));
  execFileSync('git', ['init', '-b', 'main', worktree]);
  execFileSync('git', ['add', '.'], { cwd: worktree });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Disclosure fixture'], { cwd: worktree });
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO repositories (id, url, owner, name, local_path, status, created_at, updated_at)
    VALUES ('disclosures', 'https://github.com/test/disclosures', 'test', 'disclosures', ?, 'local_changes', ?, ?)`)
    .run(worktree, timestamp, timestamp);
  for (const file of ['README.md', 'other.md']) {
    db.prepare(`INSERT INTO documents (id, repo_id, path, title, body_text, file_hash, commit_sha, updated_at)
      VALUES (?, 'disclosures', ?, ?, ?, 'fixture', 'fixture', ?)`)
      .run(`disclosures:${file}`, file, file, file === 'README.md' ? content : '# Other document', timestamp);
  }
  db.close();
});

for (const mobile of [false, true]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`reader disclosures: ${mobile ? 'mobile' : 'desktop'}, ${theme}`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await page.goto('/docs/disclosures/README.md');
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      const prose = page.locator('.prose');
      const summary = prose.locator('summary', { hasText: /^Explanation$/ });
      const outer = prose.locator('details').filter({ has: page.locator('summary', { hasText: /^Explanation$/ }) });
      await expect(outer).not.toHaveAttribute('open');
      await expect(prose.getByText('Visible immediately.')).toBeVisible();
      await expect(prose.getByText('Expanded', { exact: false }).first()).toBeHidden();
      await summary.click();
      await expect(outer).toHaveAttribute('open');
      await expect(outer.locator('strong')).toHaveText('Markdown');
      await expect(outer.locator('li').first()).toHaveText('First item');
      await expect(outer.locator('pre code')).toContainText('print("Hello")');
      await expect(outer.locator('pre.shiki')).toHaveCount(1);
      await expect(outer.locator('.katex')).toHaveCount(2);
      await expect(outer.locator('.katex-display svg')).not.toHaveCount(0);
      await expect(outer.getByRole('link', { name: 'Relative document', exact: true })).toHaveAttribute('href', '/docs/disclosures/other.md');
      await expect(outer.getByRole('link', { name: 'HTML document', exact: true })).toHaveAttribute('href', '/docs/disclosures/other.md');
      await expect(outer.getByAltText('Local image')).toHaveAttribute('src', '/api/repos/disclosures/raw?path=pixel.png');
      await expect(outer.getByText('Nested content.', { exact: true })).toBeHidden();
      await outer.locator('summary', { hasText: 'Nested explanation' }).click();
      await expect(outer.getByText('Nested content.', { exact: true })).toBeVisible();
      await summary.focus();
      await summary.press('Enter');
      await expect(outer).not.toHaveAttribute('open');
      await summary.press('Space');
      await expect(outer).toHaveAttribute('open');
      expect(await summary.evaluate((element) => getComputedStyle(element).display)).toBe('list-item');
      expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(prose.locator('h2').filter({ hasText: /^Markdown heading$/ })).toHaveCount(2);
      await expect(prose.locator('h2#markdown-heading')).toHaveText('Markdown heading');
      await expect(prose.locator('h2#markdown-heading-1')).toHaveText('Markdown heading');
      await expect(prose.getByRole('link', { name: 'HTML anchor', exact: true })).toHaveAttribute('href', '#user-content-html-heading');
      const footnote = prose.locator('a[data-footnote-ref]');
      const target = await footnote.getAttribute('href');
      await expect(prose.locator(target!)).toContainText('Footnote content.');
      await expect(prose.locator('script, iframe, [onclick], [onerror], [ontoggle]')).toHaveCount(0);
      await expect(prose.getByText('Unsafe link', { exact: true })).not.toHaveAttribute('href');
      await expect(prose.getByText('Encoded unsafe link', { exact: true })).not.toHaveAttribute('href');
      await expect(prose.getByAltText('Unsafe image')).not.toHaveAttribute('src');
      await expect(prose.getByText('Untrusted styling', { exact: true })).not.toHaveAttribute('style');
      await expect(prose.getByText('Untrusted styling', { exact: true })).not.toHaveAttribute('class');
      expect(await page.evaluate(() => 'disclosureAttack' in window)).toBe(false);
      await page.screenshot({ path: test.info().outputPath('disclosures.png'), fullPage: true });
    });
  }
}

test('editor preview uses the same safe disclosure renderer', async ({ page, request }) => {
  await page.goto('/repos/disclosures/edit?path=README.md');
  const preview = page.locator('article.prose');
  const summary = preview.locator('summary', { hasText: /^Explanation$/ });
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(preview.locator('strong')).toHaveText('Markdown');
  await expect(preview.locator('.katex')).toHaveCount(2);
  await expect(preview.locator('script, iframe, [onclick], [onerror], [ontoggle]')).toHaveCount(0);
  await expect(preview.getByText('Visible immediately.')).toBeVisible();
  const response = await request.post('/api/repos/disclosures/files', { data: { path: 'README.md', content } });
  expect(response.ok()).toBe(true);
  const { rendered } = await response.json();
  expect(rendered.toc.map((entry: { url: string }) => entry.url)).toEqual([
    '#disclosure-fixture', '#markdown-heading', '#markdown-heading-1',
  ]);
  expect(await page.evaluate(() => 'disclosureAttack' in window)).toBe(false);
});
