const userAgent = process.env.npm_config_user_agent || '';

if (/\bbun\//.test(userAgent)) {
    process.exit(0);
}

const detectedPackageManager = userAgent.split(' ')[0] || 'unknown';

console.error(`
Ghost now uses Bun for dependency installation.

Detected package manager: ${detectedPackageManager}

Use one of these instead:
  bun install

Common command replacements:
  yarn setup   -> bun run setup
  yarn dev     -> bun run dev
  yarn test    -> bun run test
  yarn lint    -> bun run lint
`);

process.exit(1);
