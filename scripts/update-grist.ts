// @ts-check
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

interface GristRecord {
  require: Record<string, string>;
  fields: Record<string, string | number>;
}

function calculateDirSize(dirPath: string): number {
  const output = execFileSync('du', ['-sb', dirPath], { encoding: 'utf-8' });
  return parseInt(output.split('\t')[0], 10);
}

async function queryVersions(pkg: string, gristApiKey: string): Promise<string[]> {
  const filter = JSON.stringify({ Package: [pkg] });
  const encodedFilter = encodeURIComponent(filter);
  const url =
    `https://apiref.getgrist.com/api/docs/rLWNJRqqXWRQ4u9ws1efSY/tables/Docs/records` +
    `?filter=${encodedFilter}&sort=-Version%3AnaturalSort&limit=0&hidden=false`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${gristApiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Grist query error: ${response.status} ${response.statusText}\n${error}`
    );
  }

  const data = (await response.json()) as {
    records: Array<{ fields: { Version: string } }>;
  };

  return data.records.map((record) => record.fields.Version);
}

async function generateVersionsJson(_pkg: string, versions: string[]): Promise<void> {
  const versionObjects = versions.map((v) => ({ v }));
  const content = { versions: versionObjects };

  const filePath = path.join(process.cwd(), 'out', 'versions.json');
  await fs.writeFile(filePath, JSON.stringify(content, null, 2) + '\n');
  console.log(`Generated ${filePath}`);
}

async function main() {
  const pkg = process.env.PACKAGE;
  const version = process.env.VERSION;
  const gristApiKey = process.env.GRIST_API_KEY;
  const runId = process.env.RUN_ID;

  if (!pkg || !version || !gristApiKey || !runId) {
    throw new Error(
      'Missing required environment variables: PACKAGE, VERSION, GRIST_API_KEY, RUN_ID'
    );
  }

  // Calculate dist folder size
  const distPath = path.join(process.cwd(), 'dist');
  const sizeBytes = calculateDirSize(distPath);
  console.log(`Dist folder size: ${sizeBytes} bytes`);

  // Prepare the Grist record
  const record: GristRecord = {
    require: {
      Package: pkg,
      Version: version,
    },
    fields: {
      Published_at: new Date().toISOString(),
      Size_bytes: sizeBytes,
      Run_ID: runId,
    },
  };

  // Make the API call
  const response = await fetch(
    'https://apiref.getgrist.com/api/docs/rLWNJRqqXWRQ4u9ws1efSY/tables/Docs/records',
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${gristApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [record] }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Grist API error: ${response.status} ${response.statusText}\n${error}`
    );
  }

  const result = await response.json();
  console.log('Successfully updated Grist:', result);

  // Query all versions and generate versions.json
  const versions = await queryVersions(pkg, gristApiKey);
  await generateVersionsJson(pkg, versions);
}

await main()
