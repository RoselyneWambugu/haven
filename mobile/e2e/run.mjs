// Runs every browser flow against a web export. Usage: npm run web:build && npm run e2e [webroot] [outdir]
import { spawnSync } from 'node:child_process'

const root = process.argv[2] ?? 'dist'
const out = process.argv[3] ?? 'e2e-out'
let failed = 0
for (const flow of ['onboarding', 'chat', 'forum', 'book', 'help', 'me', 'portal', 'admin', 'analytics', 'config', 'team', 'feedback', 'landing', 'concern', 'spaces', 'groups']) {
  console.log(`\n== ${flow}`)
  const r = spawnSync('node', [`e2e/flow-${flow}.mjs`, root, `${out}/${flow}`], { stdio: 'inherit' })
  if (r.status !== 0) failed++
}
console.log(failed ? `\n${failed} flow(s) failed` : '\nall flows passed')
process.exit(failed ? 1 : 0)
