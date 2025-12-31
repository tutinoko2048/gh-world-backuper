import type { GitHubRelease } from './release';

export interface BackupEntry {
  worldName: string;
  backupId: string;
  release: GitHubRelease;
  checksum: string;
}
