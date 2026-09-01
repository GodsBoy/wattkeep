import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distributionRoot = resolve(repositoryRoot, 'dist')

const readRepositoryFile = (relativePath) => readFileSync(resolve(repositoryRoot, relativePath), 'utf8')

const assetFileForUrl = (assetUrl) => {
  const relativeAssetPath = assetUrl.replace(/^\/wattkeep\//, '')
  return resolve(distributionRoot, relativeAssetPath)
}

test('GitHub Pages build emits a self-contained /wattkeep/ site', () => {
  const indexPath = resolve(distributionRoot, 'index.html')
  assert.ok(existsSync(indexPath), 'run npm run build:pages before npm run test:pages')

  const indexHtml = readFileSync(indexPath, 'utf8')
  const scriptUrls = [...indexHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1])
  const stylesheetUrls = [...indexHtml.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((match) => match[1])

  assert.ok(scriptUrls.length > 0, 'index.html should reference a JavaScript asset')
  assert.ok(stylesheetUrls.length > 0, 'index.html should reference a stylesheet asset')

  for (const assetUrl of [...scriptUrls, ...stylesheetUrls]) {
    assert.match(assetUrl, /^\/wattkeep\/assets\/[^/]+\.(?:js|css)$/)
    assert.ok(existsSync(assetFileForUrl(assetUrl)), `missing built asset for ${assetUrl}`)
  }

  const appSource = scriptUrls
    .map((scriptUrl) => readFileSync(assetFileForUrl(scriptUrl), 'utf8'))
    .join('\n')
  assert.match(appSource, /WattKeep home/, 'compiled app should include the home link label')
  assert.match(appSource, /[`"']\/wattkeep\/[`"']/, 'compiled app should include the Pages home href')

  const workflow = readRepositoryFile('.github/workflows/pages.yml')
  const triggerStart = workflow.indexOf('on:\n')
  const permissionsStart = workflow.indexOf('\npermissions:', triggerStart)
  assert.ok(triggerStart >= 0 && permissionsStart > triggerStart, 'workflow should declare its trigger before permissions')
  assert.equal(workflow.slice(triggerStart + 'on:\n'.length, permissionsStart).trim(), 'workflow_dispatch:')
  const buildJobStart = workflow.indexOf('\n  build:\n')
  const deployJobStart = workflow.indexOf('\n  deploy:\n', buildJobStart)
  assert.ok(buildJobStart >= 0 && deployJobStart > buildJobStart, 'workflow should define separate build and deploy jobs')
  const buildJob = workflow.slice(buildJobStart, deployJobStart)
  assert.match(buildJob, /^\s{4}if: github\.ref\s*==\s*["']refs\/heads\/main["']\s*$/m)

  const buildStepIndex = buildJob.indexOf('run: npm run build:pages')
  const testStepIndex = buildJob.indexOf('run: npm run test:pages')
  assert.ok(buildStepIndex >= 0, 'workflow should build the Pages bundle')
  assert.ok(testStepIndex > buildStepIndex, 'workflow should run the Pages contract test after the build')
  assert.match(buildJob, /uses: actions\/upload-pages-artifact@v4\s*\n\s+with:\s*\n\s+path: dist/m)
})
