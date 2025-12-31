import fs from 'node:fs';
import path from 'node:path';
import { runBackup } from './src/backup';
import { runRollback } from './src/rollback';

const mode = process.argv[2];

if (mode === 'backup') {
  console.log('Starting backup process...');
  const entry = await runBackup('worldA', 'data');
  console.log('Backup process completed.');

  fs.mkdirSync(path.join('./', 'backups', entry.worldName), { recursive: true });
  fs.writeFileSync(
    path.join('./', 'backups', entry.worldName, `${entry.backupId}.json`),
    JSON.stringify(entry, null, 2)
  );
}

if (mode === 'rollback') {
  const tagName = process.argv[3];
  if (!tagName) {
    console.error('Please provide tagName. Usage: bun index.ts rollback <tagName>');
    process.exit(1);
  }

  const splitted = tagName.split('-');
  const worldName = splitted[0]!;
  if (!worldName) throw new Error('Invalid tagName format.');
  const entryPath = path.join('./', 'backups', worldName, `${splitted.slice(1).join('-')}.json`);
  
  console.log('Starting rollback process...');
  await runRollback(entryPath, './data');
  console.log('Rollback process completed.');
}
