import fs from 'node:fs';
import crypto from 'node:crypto';
import archiver from 'archiver';

export async function zipDirectory(targetPath: string, archiveFilePath: string): Promise<{ size: number }> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(archiveFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });
    archive.pipe(out);
    out.on('close', () => resolve({ size: archive.pointer() }));
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn(err);
      else reject(err);
    });
    archive.on('error', (err) => reject(err));
    archive.directory(targetPath, false);
    archive.finalize();
  });
}

export function formatDate(date: Date): string {
  const YY = String(date.getFullYear()).slice(2);
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${YY}${MM}${DD}-${HH}${mm}${ss}`;
}

export async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
