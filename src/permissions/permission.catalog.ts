import { UserRole } from '@prisma/client';

/**
 * The permission catalog — the single source of truth for what modules and
 * capabilities exist. A permission key is `${module}.${capability}`.
 *
 * SUPER_ADMIN is a hardcoded bypass (see PermissionsService) and is never stored
 * in the RolePermission table.
 */
export type Capability = 'view' | 'edit' | 'action';

export interface ModuleDef {
  key: string;
  label: string;
  capabilities: Capability[];
}

export const MODULES: ModuleDef[] = [
  { key: 'operation', label: 'Operation', capabilities: ['view', 'edit', 'action'] },
  { key: 'accounting', label: 'Accounting', capabilities: ['view', 'edit', 'action'] },
  { key: 'documents', label: 'Documents', capabilities: ['view', 'edit', 'action'] },
  { key: 'reports', label: 'Reports', capabilities: ['view'] },
  { key: 'settings', label: 'Settings', capabilities: ['view', 'edit'] },
  { key: 'users', label: 'Users', capabilities: ['view', 'edit'] },
  { key: 'audit', label: 'Audit', capabilities: ['view'] },
];

/** Every valid permission key, e.g. `operation.view`, `accounting.action`. */
export const ALL_PERMISSIONS: string[] = MODULES.flatMap((m) =>
  m.capabilities.map((c) => `${m.key}.${c}`),
);

/** Default grants per role (excluding SUPER_ADMIN, which bypasses). Editable later. */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Exclude<UserRole, 'SUPER_ADMIN'>,
  string[]
> = {
  ACCOUNTING: [
    'accounting.view',
    'accounting.edit',
    'accounting.action',
    'operation.view',
    'documents.view',
    'documents.edit',
    'documents.action',
    'reports.view',
    'audit.view',
  ],
  OWNER: [
    'operation.view',
    'accounting.view',
    'documents.view',
    'reports.view',
    'audit.view',
  ],
  OPERATION: [
    'operation.view',
    'operation.edit',
    'operation.action',
    'documents.view',
    'documents.edit',
  ],
};
