import * as path from 'node:path';
import { $ } from 'bun';

export interface Repository {
  owner: string;
  name: string;
}

export interface File {
  path: string;
  label?: string;
}

export interface CreateReleaseOptions {
  repo: Repository;
  tag: string;
  files: (string | File)[];
  notes: string;
}

export interface Asset {
  apiUrl: string;
  contentType: string;
  createdAt: string;
  downloadCount: number;
  id: string;
  label: string;
  name: string;
  size: number;
  state: string;
  updatedAt: string;
  url: string;
}

export interface GitHubRelease {
  url: string;
  tagName: string;
  assets: Asset[];
}

export async function createRelease(options: CreateReleaseOptions): Promise<GitHubRelease> {
  const { repo, tag, files, notes } = options;

  const createFileArg = (file: string | File): string => {
    const rel = (file: string) => path.relative(process.cwd(), file);
    if (typeof file === 'string') {
      return rel(file);
    } else {
      if (file.label) return `${rel(file.path)}#${file.label}`;
      return rel(file.path);
    }
  };

  const rawUrl = await $`gh release --repo "${repo.owner}/${repo.name}" create "${tag}" --title "[backuper] ${tag}" --notes "${notes}" ${files.map(createFileArg).join(' ')}`.text();
  const url = rawUrl.trim();
  const createdTag = url.split('/').at(-1);

  const res = await $`gh release --repo "${repo.owner}/${repo.name}" view "${createdTag}" --json assets,tagName`.json();

  return {
    url,
    tagName: res.tagName,
    assets: res.assets,
  };
}
