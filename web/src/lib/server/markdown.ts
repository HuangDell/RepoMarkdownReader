import 'server-only';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { Schema } from 'hast-util-sanitize';
import { displayNameFromPath, hrefForDoc, isMarkdownPath, rawHref, resolveRelativeRepoPath } from './paths';

export interface MarkdownHeading {
  title: string;
  anchor: string;
  depth: number;
  position: number;
}

export interface MarkdownMetadata {
  title: string;
  description: string;
  bodyText: string;
  fileHash: string;
  headings: MarkdownHeading[];
}

export interface RenderedMarkdown extends MarkdownMetadata {
  html: string;
  toc: { title: string; url: string; depth: number }[];
}

type TreeNode = {
  type: string;
  tagName?: string;
  value?: string;
  depth?: number;
  properties?: Record<string, unknown>;
  children?: TreeNode[];
};

function textContent(node: TreeNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(textContent).join('');
}

function createSlugger() {
  const seen = new Map<string, number>();

  return (input: string) => {
    const base =
      input
        .trim()
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function collectMarkdownHeadings(markdown: string) {
  const tree = unified().use(remarkParse).parse(markdown) as TreeNode;
  const slug = createSlugger();
  const headings: MarkdownHeading[] = [];

  visit(tree, 'heading', (node: TreeNode) => {
    const title = textContent(node).trim();
    if (!title) return;

    headings.push({
      title,
      anchor: slug(title),
      depth: node.depth ?? 2,
      position: headings.length,
    });
  });

  return headings;
}

export function extractMarkdownMetadata(repoPath: string, raw: string): MarkdownMetadata {
  const parsed = matter(raw);
  const content = parsed.content.trim();
  const headings = collectMarkdownHeadings(content);
  const titleValue = parsed.data.title;
  const descriptionValue = parsed.data.description;
  const title = typeof titleValue === 'string' && titleValue.trim() ? titleValue.trim() : headings[0]?.title ?? displayNameFromPath(repoPath);
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : '';

  return {
    title,
    description,
    bodyText: content,
    fileHash: crypto.createHash('sha256').update(raw).digest('hex'),
    headings,
  };
}

function rehypeHeadingIds(headings: MarkdownHeading[]) {
  let index = 0;

  return () => (tree: TreeNode) => {
    visit(tree, 'element', (node: TreeNode) => {
      if (!/^h[1-6]$/.test(node.tagName ?? '')) return;

      const heading = headings[index];
      index += 1;

      if (!heading) return;
      node.properties = { ...node.properties, id: heading.anchor };
    });
  };
}

function isExternalUrl(value: string) {
  return /^(https?:|mailto:|tel:|#)/i.test(value);
}

function rehypeRewriteLinks(repoId: string, currentPath: string) {
  return () => (tree: TreeNode) => {
    visit(tree, 'element', (node: TreeNode) => {
      if (!node.properties) return;

      if (node.tagName === 'a' && typeof node.properties.href === 'string') {
        const href = node.properties.href;
        if (!isExternalUrl(href)) {
          const { path, suffix } = resolveRelativeRepoPath(currentPath, href);
          node.properties.href = isMarkdownPath(path) ? `${hrefForDoc(repoId, path)}${suffix}` : `${rawHref(repoId, path)}${suffix}`;
        }
      }

      if (node.tagName === 'img' && typeof node.properties.src === 'string') {
        const src = node.properties.src;
        if (!isExternalUrl(src) && !src.startsWith('data:')) {
          const { path } = resolveRelativeRepoPath(currentPath, src);
          node.properties.src = rawHref(repoId, path);
        }
      }
    });
  };
}

const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'math',
    'semantics',
    'annotation',
    'mrow',
    'mi',
    'mn',
    'mo',
    'msup',
    'msub',
    'msubsup',
    'mfrac',
    'msqrt',
    'mroot',
    'mtext',
    'mspace',
    'mtable',
    'mtr',
    'mtd',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...((defaultSchema.attributes?.['*'] as string[]) ?? []),
      'className',
      'aria-hidden',
      'style',
    ],
    a: [...((defaultSchema.attributes?.a as string[]) ?? []), 'href', 'target', 'rel'],
    img: [...((defaultSchema.attributes?.img as string[]) ?? []), 'src', 'alt', 'title', 'width', 'height'],
    code: [...((defaultSchema.attributes?.code as string[]) ?? []), 'className'],
    span: [...((defaultSchema.attributes?.span as string[]) ?? []), 'className', 'style'],
    div: [...((defaultSchema.attributes?.div as string[]) ?? []), 'className', 'style'],
    h1: [...((defaultSchema.attributes?.h1 as string[]) ?? []), 'id'],
    h2: [...((defaultSchema.attributes?.h2 as string[]) ?? []), 'id'],
    h3: [...((defaultSchema.attributes?.h3 as string[]) ?? []), 'id'],
    h4: [...((defaultSchema.attributes?.h4 as string[]) ?? []), 'id'],
    h5: [...((defaultSchema.attributes?.h5 as string[]) ?? []), 'id'],
    h6: [...((defaultSchema.attributes?.h6 as string[]) ?? []), 'id'],
  },
};

export async function renderMarkdown(repoId: string, repoPath: string, raw: string): Promise<RenderedMarkdown> {
  const metadata = extractMarkdownMetadata(repoPath, raw);
  const parsed = matter(raw);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeHeadingIds(metadata.headings))
    .use(rehypeRewriteLinks(repoId, repoPath))
    .use(rehypeKatex)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(parsed.content);

  return {
    ...metadata,
    html: String(file),
    toc: metadata.headings.map((heading) => ({
      title: heading.title,
      url: `#${heading.anchor}`,
      depth: heading.depth,
    })),
  };
}
