import { watch } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorker } from './local-runner.js';

it('kills a child ignoring SIGTERM and allows the next invocation to finish', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'papert-worker-'));
  const launcher = join(directory, 'worker');
  await writeFile(launcher, '#!/bin/sh\nexec "$PAPERT_TEST_NODE" "$2"\n', {
    mode: 0o700,
  });
  await writeFile(
    join(directory, 'hung.cjs'),
    `
    const { writeFileSync } = require('node:fs');
    process.on('SIGTERM', () => writeFileSync('term', ''));
    writeFileSync('ready', '');
    setInterval(() => {}, 1000);
  `,
  );
  await writeFile(join(directory, 'done.cjs'), '');
  let ready!: () => void;
  let terminated!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const signaled = new Promise<void>((resolve) => {
    terminated = resolve;
  });
  const watcher = watch(directory, (_event, file) => {
    if (file === 'ready') {
      ready();
    }
    if (file === 'term') {
      terminated();
    }
  });
  vi.useFakeTimers();

  try {
    const pending = runWorker(
      launcher,
      'hung.cjs',
      directory,
      { ...process.env, PAPERT_TEST_NODE: process.execPath },
      '',
      500,
    );
    await started;

    await vi.advanceTimersByTimeAsync(500);
    await signaled;
    await vi.advanceTimersByTimeAsync(1000);
    const hung = await pending;
    const next = await runWorker(
      launcher,
      'done.cjs',
      directory,
      { ...process.env, PAPERT_TEST_NODE: process.execPath },
      '',
      1000,
    );

    expect(hung).toBe(false);
    expect(next).toBe(true);
  } finally {
    vi.useRealTimers();
    watcher.close();
    await rm(directory, { recursive: true, force: true });
  }
});
