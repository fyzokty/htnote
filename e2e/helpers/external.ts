import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function readExternalOpens(): Promise<{ kind: string; target: string }[]> {
  const path = process.env.HTNOTE_EXTERNAL_OPEN_LOG;
  assert.ok(path, "E2E must supply HTNOTE_EXTERNAL_OPEN_LOG");
  const contents = await readFile(path, "utf8");
  return contents.split("\n").filter(Boolean).map((line: string) => JSON.parse(line));
}

export async function waitForExternalOpen(kind: string, target: string): Promise<void> {
  await browser.waitUntil(async () => (await readExternalOpens()).some((row) => row.kind === kind && row.target === target), {
    timeout: 10000,
    timeoutMsg: `Missing external log entry: ${kind} ${target}; verify driver/app environment inheritance`,
  });
}
