import fs from 'node:fs';
import path from 'node:path';
import { createRelease } from './release';
import { zipDirectory, calculateChecksum, formatDate } from './utils';
import type { BackupEntry } from './types';

const backupTmpDir = '.backup';

export async function runBackup(
  worldName: string,
  targetPath: string,
  notes = 'automated release.'
): Promise<BackupEntry> {
  const backupId = formatDate(new Date());

  fs.mkdirSync(backupTmpDir, { recursive: true });
  const archivePath = path.join(backupTmpDir, `${worldName}-${backupId}.zip`);

  console.log('Creating archive...');
  await zipDirectory(targetPath, archivePath);

  console.log('Calculating checksum...');
  const checksum = await calculateChecksum(archivePath);
  console.log(`Checksum (SHA256): ${checksum}`);

  console.log('Creating GitHub Release...');
  const release = await createRelease({
    repo: { owner: 'tutinoko2048', name: 'gh-backup-test' },
    tag: `${worldName}-${backupId}`,
    notes: `${notes}\n\nSHA256: \`${checksum}\``,
    files: [archivePath],
  });

  console.log('Release created at:', release.url);
  console.log('Tag Name:', release.tagName);

  fs.unlinkSync(archivePath);
  console.log('Temporary archive deleted.');

  return { worldName, backupId, release, checksum };
}
