import { readFileSync } from 'node:fs';
import path from 'node:path';

// Not import.meta.url-based: esbuild bundles src/index.js to a single CJS
// file for the Docker build (see package.json's "build" script), and
// import.meta.url is empty in that output, which crashed the app on boot.
// process.cwd() works for both `node src/index.js` (dev) and the bundled
// `node dist/index.cjs` (prod), since both run from the project root.
const SKILLS_DIR = path.join(process.cwd(), 'src', 'skills');

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Loads a SKILL.md and splits it into its frontmatter (name/description) and
 * instruction body. This is the same file format Claude Code reads for
 * skills — here we read it ourselves so a plain API call can follow it too.
 */
export function loadSkill(skillName) {
  const filePath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  const raw = readFileSync(filePath, 'utf-8');

  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`Skill "${skillName}" is missing frontmatter`);
  }

  const [, frontmatter, body] = match;
  const meta = Object.fromEntries(
    frontmatter
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      })
  );

  return { name: meta.name, description: meta.description, instructions: body.trim() };
}
