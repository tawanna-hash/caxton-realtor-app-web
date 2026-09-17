#!/usr/bin/env node
// Requires the "Ripley10" development code before a commit touching the Get
// Paid module (payment links, statements, recurring payments, sales
// transactions, invoices, Stripe payouts, and the shared invoice-lifecycle
// library) can go through.
//
// This is a git-level gate only — it protects against unreviewed CODE
// CHANGES to money-handling logic, not normal day-to-day product usage.
// Nothing in the running app prompts admins for this code; viewing invoices,
// taking payments, sending statements, etc. all work with zero friction.
//
// How to satisfy the gate when you're intentionally changing Get Paid code:
//   GETPAID_DEV_CODE=Ripley10 git commit -m "..."
// or export it once for your shell session:
//   export GETPAID_DEV_CODE=Ripley10
// or, on an interactive terminal with no env var set, the hook prompts you
// for the code directly.
//
// Escape hatch: `git commit --no-verify` skips all hooks including this one
// (use deliberately, not habitually — this hook exists to make Get Paid
// code changes a deliberate action).
//
// Run manually:  node scripts/check-getpaid-dev-code.mjs
// Run in pre-commit: wired into .husky/pre-commit

import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const DEV_CODE = process.env.GETPAID_UNLOCK_CODE || 'Ripley10';

// Path prefixes that make up the Get Paid module's code surface (mirrors the
// page/route layout of payment links, statements, recurring payments, sales
// transactions, invoices, and Stripe payouts, plus the shared lifecycle lib
// they all depend on).
const GETPAID_PATH_PATTERNS = [
  /^app\/admin\/getpaid\//,
  /^app\/admin\/ar\//,
  /^app\/api\/admin\/invoices\//,
  /^app\/api\/admin\/invoices$/,
  /^app\/api\/admin\/invoice-payments/,
  /^app\/api\/admin\/recurring-invoices/,
  /^app\/api\/admin\/sales-receipts/,
  /^app\/api\/portal\/invoices/,
  /^app\/api\/admin\/advertisers\/\[id\]\/send-statement/,
  /^app\/api\/admin\/advertisers\/\[id\]\/statement-history/,
  /^lib\/server\/invoice-lifecycle\.ts$/,
  /^lib\/server\/recurring-invoices\.ts$/,
  /^lib\/server\/partner-statement\.ts$/,
  /^lib\/server\/invoice-payments\.ts$/,
  /^lib\/server\/stripe-payment-ledger-sync\.ts$/,
  /^lib\/invoices\.ts$/,
];

function getStagedFiles() {
  // Deliberately omit --diff-filter: additions, edits, deletes, and renames
  // of Get Paid files all count — removing or renaming money-handling code
  // is exactly as consequential as adding to it.
  const output = execSync('git diff --cached --name-only', {
    encoding: 'utf8',
  });
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function matchesGetPaid(path) {
  return GETPAID_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function promptForCode() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question('Enter the Get Paid development code to commit: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const staged = getStagedFiles();
  const touchedGetPaidFiles = staged.filter(matchesGetPaid);

  if (touchedGetPaidFiles.length === 0) {
    // Nothing in this commit touches Get Paid code — nothing to gate.
    process.exit(0);
  }

  console.error('This commit changes Get Paid module files:');
  for (const file of touchedGetPaidFiles) {
    console.error(`  - ${file}`);
  }

  let submitted = process.env.GETPAID_DEV_CODE;
  if (!submitted) {
    if (!process.stdin.isTTY) {
      console.error(
        '\nNo GETPAID_DEV_CODE env var set and no interactive terminal available.\n' +
          'Set it before committing, e.g.:\n' +
          '  GETPAID_DEV_CODE=Ripley10 git commit -m "..."\n',
      );
      process.exit(1);
    }
    submitted = await promptForCode();
  }

  if (submitted !== DEV_CODE) {
    console.error('\nIncorrect development code. Commit blocked.');
    process.exit(1);
  }

  console.error('Development code accepted — proceeding with commit.');
  process.exit(0);
}

main().catch((error) => {
  console.error('check-getpaid-dev-code.mjs failed:', error);
  process.exit(1);
});
