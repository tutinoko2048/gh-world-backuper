import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import { pipeline } from 'node:stream/promises';
import * as unzip from 'unzip-stream';
import { Writable } from 'node:stream';
import { calculateChecksum } from './utils';
import type { BackupEntry } from './types';

const rollbackTmpDir = '.rollback';

export async function runRollback(backupEntryPath: string, restorePath: string) {
  // Ensure rollback directory exists
  fs.mkdirSync(rollbackTmpDir, { recursive: true });

  const data: BackupEntry = await Bun.file(backupEntryPath).json();
  const asset = data.release.assets[0];
  if (!asset) throw new Error(`No asset found in the release: ${data.release.url}`);

  const token = (await $`gh auth token `.quiet()).text();

  console.log('Downloading asset...', asset.apiUrl);
  const res = await fetch(asset.apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/octet-stream',
    },
  });
  if (!res.ok || !res.body) throw new Error(`Failed to download asset: ${res.status} ${res.statusText}`);

  const tempName = path.join(rollbackTmpDir, `${data.release.tagName}.zip`);
  const file = fs.createWriteStream(tempName);
  await pipeline(res.body, file);

  // checksum verification
  console.log('Verifying checksum...');
  if (data.checksum) {
    const calculated = await calculateChecksum(tempName);
    if (calculated !== data.checksum) {
      throw new Error(`Checksum mismatch! Expected: ${data.checksum}, Actual: ${calculated}`);
    }
    console.log('Checksum verified.');
  } else {
    console.warn('No checksum found in backup entry. Skipping verification.');
  }

  const lockPath = path.join(rollbackTmpDir, '.lock');
  try {
    // Acquire lock
    try {
      fs.closeSync(fs.openSync(lockPath, 'wx'));
      console.log('Lock acquired.');
    } catch (e: any) {
      if (e.code === 'EEXIST') {
        throw new Error('Rollback is already in progress (lock file exists).');
      }
      throw e;
    }

    const stagingPath = path.join(rollbackTmpDir, 'extract');
    // Clean staging directory if exists
    if (fs.existsSync(stagingPath)) {
      fs.rmSync(stagingPath, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingPath, { recursive: true });

    console.log('Extracting archive to staging area...');
    const writeStream = new Writable({
      objectMode: true,
      write: (entry: unzip.Entry, _, cb) => {
        const processEntry = async () => {
          // console.log('Restoring:', entry.path);
          const filePath = path.join(stagingPath, entry.path);

          if (entry.type === 'Directory') {
            fs.mkdirSync(filePath, { recursive: true });
            entry.autodrain();
            return;
          }

          fs.mkdirSync(path.dirname(filePath), { recursive: true });

          await pipeline(entry, fs.createWriteStream(filePath));
        };

        processEntry()
          .then(() => cb())
          .catch(cb);
      },
    });

    await pipeline(fs.createReadStream(tempName), unzip.Parse(), writeStream);

    console.log('Staging completed. Starting atomic switch...');

    // Atomic Switch Logic
    const oldPath = `${restorePath}.old`;

    // 1. Backup current data to .old
    if (fs.existsSync(restorePath)) {
      console.log(`Backing up current data to ${oldPath}...`);
      if (fs.existsSync(oldPath)) {
        fs.rmSync(oldPath, { recursive: true, force: true });
      }
      fs.renameSync(restorePath, oldPath);
    }

    // 2. Move staging to current
    try {
      console.log(`Switching staging to ${restorePath}...`);
      // Ensure parent directory exists
      const parentDir = path.dirname(restorePath);
      if (parentDir && parentDir !== '.' && !fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.renameSync(stagingPath, restorePath);
      console.log('Atomic switch successful.');
    } catch (err) {
      console.error('Switch failed! Rolling back...');
      // Restore from .old if switch failed
      if (fs.existsSync(oldPath)) {
        if (fs.existsSync(restorePath)) {
          fs.rmSync(restorePath, { recursive: true, force: true });
        }
        fs.renameSync(oldPath, restorePath);
        console.log('Rollback successful.');
      }
      throw err;
    }

    // 3. Cleanup .old
    if (fs.existsSync(oldPath)) {
      console.log('Cleaning up old backup...');
      fs.rmSync(oldPath, { recursive: true, force: true });
    }

    console.log('Restoration completed.');

    fs.unlinkSync(tempName);
    console.log('Temporary files cleaned up.');
  } finally {
    // Release lock
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      console.log('Lock released.');
    }
  }
}
