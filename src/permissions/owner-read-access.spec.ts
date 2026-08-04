import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_ROLE_PERMISSIONS } from './permission.catalog';

/**
 * Guardrail for the view-only OWNER role.
 *
 * OWNER is a strictly read-only, business-owner login. The RBAC model is
 * coarse-grained: every feature reuses the same `<module>.view` keys, so as long
 * as feature controllers gate their reads with a `.view` OWNER holds, OWNER keeps
 * full visibility into every feature — old and new.
 *
 * This test walks every feature controller's source and asserts that no HTTP GET
 * handler is gated by a permission OWNER lacks (e.g. `.edit`/`.action`). It fails
 * the moment a future feature accidentally hides a read behind a write permission,
 * which is the one thing that would silently make OWNER "stale".
 *
 * It is a static source scan on purpose: it needs no DI wiring and cannot be
 * fooled by import-time side effects.
 */

/** Permissions the OWNER role holds by default (source of truth). */
const OWNER_PERMISSIONS = new Set(DEFAULT_ROLE_PERMISSIONS.OWNER);

/**
 * Controllers intentionally NOT readable by OWNER (infra, auth, or the
 * deliberately-restricted Settings/Users/Roles admin surfaces). If you add a
 * controller here, you are asserting OWNER should NOT see it.
 */
const EXCLUDED_CONTROLLERS = new Set([
  'app', // root/health-ish, no perms
  'auth', // login/refresh
  'health', // liveness
  'telegram', // internal webhook
  'permissions', // roles.manage — SUPER_ADMIN only
  'users', // users.view — intentionally hidden from OWNER
  'settings', // settings.edit — intentionally hidden from OWNER
]);

const SRC_ROOT = join(__dirname, '..');
const PERMISSION_RE = /@RequirePermission\(\s*['"]([^'"]+)['"]\s*\)/;

interface ControllerFile {
  name: string; // basename without `.controller.ts`
  path: string;
  lines: string[];
}

function findControllers(dir: string): ControllerFile[] {
  const out: ControllerFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...findControllers(full));
    } else if (
      entry.name.endsWith('.controller.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      out.push({
        name: entry.name.replace('.controller.ts', ''),
        path: full,
        lines: readFileSync(full, 'utf8').split('\n'),
      });
    }
  }
  return out;
}

/** The class-level `@RequirePermission`, i.e. the one just above `export class`. */
function classPermission(lines: string[]): string | undefined {
  const classIdx = lines.findIndex((l) => /export class \w+Controller/.test(l));
  if (classIdx < 0) return undefined;
  // Walk up over the contiguous decorator block above the class declaration.
  for (let i = classIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('@')) break; // left the decorator block
    const m = trimmed.match(PERMISSION_RE);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * The contiguous decorator block a handler line belongs to (all lines that start
 * with `@`, scanning up and down from `idx`).
 */
function decoratorBlock(lines: string[], idx: number): string[] {
  const block: string[] = [];
  for (let i = idx; i >= 0 && lines[i].trim().startsWith('@'); i--) {
    block.unshift(lines[i]);
  }
  for (
    let i = idx + 1;
    i < lines.length && lines[i].trim().startsWith('@');
    i++
  ) {
    block.push(lines[i]);
  }
  return block;
}

/** Effective permission for every `@Get(...)` handler in the file. */
function getHandlerPermissions(
  lines: string[],
  classPerm: string | undefined,
): { line: number; permission: string | undefined }[] {
  const result: { line: number; permission: string | undefined }[] = [];
  lines.forEach((line, idx) => {
    if (!/^\s*@Get\(/.test(line)) return;
    const block = decoratorBlock(lines, idx);
    const methodPerm = block
      .map((l) => l.match(PERMISSION_RE)?.[1])
      .find((p): p is string => Boolean(p));
    result.push({ line: idx + 1, permission: methodPerm ?? classPerm });
  });
  return result;
}

describe('OWNER read-access invariant', () => {
  const controllers = findControllers(SRC_ROOT).filter(
    (c) => !EXCLUDED_CONTROLLERS.has(c.name),
  );

  it('discovers feature controllers to check (guards against a vacuous pass)', () => {
    expect(controllers.length).toBeGreaterThan(10);
  });

  it.each(controllers.map((c) => [c.name, c] as const))(
    'every GET in %s is readable by the view-only OWNER',
    (_name, controller) => {
      const classPerm = classPermission(controller.lines);
      const gets = getHandlerPermissions(controller.lines, classPerm);
      // Every feature controller checked here should expose at least one read.
      expect(gets.length).toBeGreaterThan(0);

      for (const { line, permission } of gets) {
        // `undefined` = open to any authenticated user (OWNER included).
        // Otherwise OWNER must hold the gating permission.
        const readable =
          permission === undefined || OWNER_PERMISSIONS.has(permission);
        expect({
          controller: controller.path,
          line,
          gatingPermission: permission ?? '(open)',
          readable,
        }).toEqual(expect.objectContaining({ readable: true }));
      }
    },
  );
});
