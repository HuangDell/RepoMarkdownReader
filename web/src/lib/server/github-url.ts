import 'server-only';
import crypto from 'node:crypto';

export interface ParsedGitHubUrl {
  owner: string;
  name: string;
  cloneUrl: string;
  repoId: string;
}

export function parseGitHubUrl(rawUrl: string): ParsedGitHubUrl {
  const input = rawUrl.trim();
  let owner = '';
  let name = '';

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
      throw new Error('Only GitHub HTTPS URLs are supported.');
    }

    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    owner = parts[0] ?? '';
    name = (parts[1] ?? '').replace(/\.git$/i, '');
  } catch (error) {
    if (input.startsWith('git@github.com:')) {
      throw new Error('SSH URLs are not supported in the MVP. Use the HTTPS clone URL.');
    }

    throw error instanceof Error ? error : new Error('Invalid GitHub URL.');
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error('Invalid GitHub owner or repository name.');
  }

  const cloneUrl = `https://github.com/${owner}/${name}.git`;
  const hash = crypto.createHash('sha1').update(`${owner}/${name}`.toLowerCase()).digest('hex').slice(0, 8);
  const repoId = `${owner.toLowerCase()}-${name.toLowerCase()}-${hash}`.replace(/[^a-z0-9-]/g, '-');

  return { owner, name, cloneUrl, repoId };
}
