#!/usr/bin/env node
// Builds the deploy folder from the committed app/ and runs the suite on exactly that folder (R6, R14).
//
//   node scripts/build_deploy.mjs --out <deploy dir> --api <https url> --session-file <file>
//   node scripts/build_deploy.mjs --verify <deploy dir>
//
// Build: refuses on any uncommitted or untracked change in the repo; copies app/ as committed at HEAD
// into <deploy dir> (outside every git repo); stamps the full sha into the two __BUILD_SHA__ places;
// writes config.js from --api and the session file (never printed); keeps <deploy dir>/media/;
// runs the Playwright suite against the folder with EXPECT_SHA=<sha>; writes gate.json
// { sha, folderHash, result, at, summary }. Exit 0 only when the suite passed.
// Verify: exit 0 only when gate.json says pass for the current HEAD, the tree is clean and the folder
// hash still matches (the deploy script runs this right before `railway up`).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '.s03e04-deploy';
const PLACEHOLDER = '__BUILD_SHA__';
const NOT_SHIPPED = new Set(['gate.json', MARKER, '.railwayignore']);

function fail(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
}
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function cleanTree() {
  const dirty = git('status', '--porcelain', '--untracked-files=all');
  if (dirty) fail(`the repo has uncommitted or untracked changes:\n${dirty}`);
}

function headSha() {
  const sha = git('rev-parse', 'HEAD');
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`HEAD is not a full sha: ${sha}`);
  return sha;
}

function insideGit(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'true';
}

function walk(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) fail(`a link in the deploy folder: ${full}`);
      return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
    })
    .sort();
}

// sha256 over "path\0sha256(file)\n" for every file that ships (all but gate.json and the marker).
function folderHash(out) {
  const h = createHash('sha256');
  for (const rel of walk(out)) {
    if (NOT_SHIPPED.has(rel)) continue;
    h.update(`${rel}\0${createHash('sha256').update(fs.readFileSync(path.join(out, rel))).digest('hex')}\n`);
  }
  return h.digest('hex');
}

function verify(out) {
  cleanTree();
  const sha = headSha();
  const gateFile = path.join(out, 'gate.json');
  if (!fs.existsSync(gateFile)) fail('no gate.json: run the build first');
  const gate = JSON.parse(fs.readFileSync(gateFile, 'utf8'));
  if (gate.result !== 'pass') fail(`gate.json says ${gate.result} (${gate.summary})`);
  if (gate.sha !== sha) fail(`gate.json is for ${gate.sha}, HEAD is ${sha}`);
  const now = folderHash(out);
  if (gate.folderHash !== now) fail(`the deploy folder changed after the gate (${gate.folderHash.slice(0, 12)} -> ${now.slice(0, 12)})`);
  console.log(`OK gate pass for ${sha}, folder ${now.slice(0, 12)}, ${gate.at}`);
}

function build(out, api, sessionFile) {
  if (!out || !api || !sessionFile) fail('usage: --out <dir> --api <https url> --session-file <file>');
  let apiUrl;
  try {
    apiUrl = new URL(api);
  } catch {
    fail('--api is not a URL');
  }
  if (apiUrl.protocol !== 'https:') fail('--api must be https');
  const session = fs.readFileSync(sessionFile, 'utf8').trim();
  if (!/^[A-Za-z0-9._~-]+$/.test(session)) fail('the session file holds characters a session does not have');

  cleanTree();
  const sha = headSha();

  out = path.resolve(out);
  if (out === repo || out.startsWith(repo + path.sep)) fail('the deploy folder is inside the repo');
  if (fs.existsSync(out)) {
    if (!fs.existsSync(path.join(out, MARKER))) fail(`${out} exists and is not a deploy folder made by this script`);
  } else {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, MARKER), 'made by scripts/build_deploy.mjs\n');
  }
  if (insideGit(out)) fail('the deploy folder is inside a git repo');

  // Clear the last build, keep media/ (the recordings) and the marker.
  for (const e of fs.readdirSync(out)) {
    if (e === 'media' || e === MARKER) continue;
    fs.rmSync(path.join(out, e), { recursive: true, force: true });
  }

  // app/ exactly as committed at HEAD.
  const files = git('ls-tree', '-r', '--name-only', 'HEAD', 'app').split('\n').filter(Boolean);
  for (const f of files) {
    const rel = f.slice('app/'.length);
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, execFileSync('git', ['-C', repo, 'show', `HEAD:${f}`]));
  }

  const indexFile = path.join(out, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8');
  const places = html.split(PLACEHOLDER).length - 1;
  if (places !== 2) fail(`index.html has ${places} build placeholders, expected 2 (meta and footer)`);
  fs.writeFileSync(indexFile, html.replaceAll(PLACEHOLDER, sha));

  fs.writeFileSync(
    path.join(out, 'config.js'),
    `// Written by scripts/build_deploy.mjs for build ${sha}.\nexport const API = '${apiUrl.href.replace(/\/$/, '')}';\nexport const SESSION = '${session}';\n`,
  );
  fs.writeFileSync(path.join(out, '.railwayignore'), `gate.json\n${MARKER}\n`);

  const hash = folderHash(out);
  console.log(`built ${sha} into ${out} (${walk(out).length} files, folder ${hash.slice(0, 12)}); running the suite on it`);

  const cli = path.join(repo, 'node_modules', 'playwright', 'cli.js');
  const run = spawnSync(process.execPath, [cli, 'test', '--reporter=list'], {
    cwd: repo,
    env: { ...process.env, BOARD_DIR: out, EXPECT_SHA: sha, BOARD_URL: '' },
    encoding: 'utf8',
  });
  const text = `${run.stdout}${run.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
  process.stdout.write(text);
  const counts = ['passed', 'failed', 'skipped', 'flaky']
    .map((k) => text.match(new RegExp(`(\\d+) ${k}`))?.[0])
    .filter(Boolean)
    .join(', ');
  const pass = run.status === 0 && !/\d+ (failed|flaky)/.test(text) && /\d+ passed/.test(text);
  if (folderHash(out) !== hash) fail('the deploy folder changed while the suite ran');
  const gate = { sha, folderHash: hash, result: pass ? 'pass' : 'fail', at: new Date().toISOString(), summary: counts || `exit ${run.status}` };
  fs.writeFileSync(path.join(out, 'gate.json'), JSON.stringify(gate, null, 2) + '\n');
  if (!pass) fail(`the suite did not pass on build ${sha} (${gate.summary}); gate.json says fail`);
  console.log(`GATE PASS ${sha} (${gate.summary})`);
}

if (process.argv.includes('--verify')) verify(path.resolve(arg('--verify')));
else build(arg('--out'), arg('--api'), arg('--session-file'));
