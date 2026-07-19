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
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
};

const tableScrollContainerClasses = ['relative', 'overflow-auto', 'prose-no-margin', 'my-6'];
const protectedMathDelimiterNodeTypes = new Set([
  'code',
  'inlineCode',
  'html',
  'definition',
  'link',
  'linkReference',
  'image',
  'imageReference',
  'math',
  'inlineMath',
]);

type SourceRange = { start: number; end: number };
type SourceReplacement = SourceRange & { value: string };

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

function collectProtectedMathDelimiterRanges(markdown: string) {
  const tree = unified().use(remarkParse).use(remarkMath).parse(markdown) as TreeNode;
  const ranges: SourceRange[] = [];

  const collect = (node: TreeNode) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (protectedMathDelimiterNodeTypes.has(node.type) && typeof start === 'number' && typeof end === 'number') {
      ranges.push({ start, end });
      return;
    }

    node.children?.forEach(collect);
  };

  collect(tree);
  return ranges;
}

function normalizeChatGptMathDelimiters(markdown: string) {
  const protectedRanges = collectProtectedMathDelimiterRanges(markdown);
  const replacements: SourceReplacement[] = [];

  const overlaps = (start: number, end: number, ranges: SourceRange[]) =>
    ranges.some((range) => start < range.end && end > range.start);

  const addMatches = (
    pattern: RegExp,
    format: (body: string) => string,
    accept: (body: string) => boolean = () => true,
  ) => {
    for (const match of markdown.matchAll(pattern)) {
      if (match.index === undefined) continue;

      const start = match.index;
      const end = start + match[0].length;
      const body = match[1]?.trim() ?? '';
      if (!body || !accept(body) || overlaps(start, end, protectedRanges) || overlaps(start, end, replacements)) continue;
      replacements.push({ start, end, value: format(body) });
    }
  };

  const displayMath = (body: string) => {
    const normalizedBody = body.replace(/^[ \t]*={3,}[ \t]*$/gm, '=');
    return `$$\n${normalizedBody}\n$$`;
  };
  addMatches(/^[ \t]{0,3}\\\[[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]{0,3}\\\][ \t]*$/gm, displayMath);
  addMatches(/^[ \t]{0,3}\\\[([^\r\n]+?)\\\][ \t]*$/gm, displayMath);
  addMatches(
    /^[ \t]{0,3}\[[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]{0,3}\][ \t]*$/gm,
    displayMath,
    (body) => /\\[A-Za-z]+|[_^={}]/.test(body),
  );
  addMatches(/\\\(([^\r\n]+?)\\\)/g, (body) => `$${body}$`, (body) => !body.includes('$'));

  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce((result, replacement) => `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`, markdown);
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

function hasClassName(node: TreeNode, className: string) {
  const value = node.properties?.className;
  if (Array.isArray(value)) return value.includes(className);
  return typeof value === 'string' && value.split(/\s+/).includes(className);
}

function addClassName(node: TreeNode, className: string) {
  if (hasClassName(node, className)) return;

  const value = node.properties?.className;
  const classNames = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(/\s+/).filter(Boolean)
      : [];
  node.properties = { ...node.properties, className: [...classNames, className] };
}

function isTableScrollContainer(node: TreeNode) {
  return node.tagName === 'div' && tableScrollContainerClasses.every((className) => hasClassName(node, className));
}

function rehypeEnhanceOverflowContent() {
  return (tree: TreeNode) => {
    const enhance = (node: TreeNode, insideDisplayMath = false) => {
      if (!node.children) return;

      const isDisplayMath = node.tagName === 'span' && hasClassName(node, 'katex-display');
      if (node.tagName === 'pre') addClassName(node, 'reader-code-block');
      if (isDisplayMath) addClassName(node, 'reader-math-scroll');
      if (node.tagName === 'span' && hasClassName(node, 'katex') && !insideDisplayMath) addClassName(node, 'reader-inline-math');

      const parentIsScrollContainer = isTableScrollContainer(node);
      node.children = node.children.map((child) => {
        if (child.type === 'element' && child.tagName === 'table') {
          if (parentIsScrollContainer) return child;

          return {
            type: 'element',
            tagName: 'div',
            properties: { className: [...tableScrollContainerClasses] },
            children: [child],
          };
        }

        enhance(child, insideDisplayMath || isDisplayMath);
        return child;
      });
    };

    enhance(tree);
  };
}

const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobberPrefix: '',
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
  const content = normalizeChatGptMathDelimiters(parsed.content);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeHeadingIds(metadata.headings))
    .use(rehypeRewriteLinks(repoId, repoPath))
    .use(rehypeKatex)
    .use(rehypeEnhanceOverflowContent)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(content);

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
