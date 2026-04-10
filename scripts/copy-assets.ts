#!/usr/bin/env tsx
/**
 * Copies non-TypeScript assets to dist/ after tsc compilation.
 * Cross-platform replacement for the Unix-only `cp` shell commands.
 * Run with: tsx scripts/copy-assets.ts
 */

import { cp, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

async function main(): Promise<void> {
  const distSchemas = join(root, 'dist', 'schemas');
  const distTemplates = join(root, 'dist', 'templates');
  const distExamples = join(root, 'dist', 'examples');

  await mkdir(distSchemas, { recursive: true });
  await mkdir(distTemplates, { recursive: true });
  await mkdir(distExamples, { recursive: true });

  // Copy JSON schemas only — skip .ts files which tsc already compiled
  await cp(join(root, 'schemas'), distSchemas, {
    recursive: true,
    filter: (src) => !src.endsWith('.ts'),
  });

  // Copy all template files (markdown + JSON examples)
  await cp(join(root, 'templates'), distTemplates, { recursive: true });

  // Copy examples so the init command can find them at runtime
  await cp(join(root, 'examples'), distExamples, { recursive: true });

  console.log('Assets copied to dist/.');
}

main().catch((err: unknown) => {
  console.error('copy-assets failed:', err);
  process.exit(1);
});
