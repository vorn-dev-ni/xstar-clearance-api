import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from './permission.catalog';

@Injectable()
export class PermissionsService {
  /** role → Set(permission). Lazily loaded, invalidated on write. */
  private cache: Map<UserRole, Set<string>> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<Map<UserRole, Set<string>>> {
    if (this.cache) return this.cache;
    const rows = await this.prisma.rolePermission.findMany();
    const map = new Map<UserRole, Set<string>>();
    for (const r of rows) {
      const set = map.get(r.role) ?? new Set<string>();
      set.add(r.permission);
      map.set(r.role, set);
    }
    this.cache = map;
    return map;
  }

  /** SUPER_ADMIN can do anything; everyone else is checked against their grants. */
  async has(role: UserRole, permission: string): Promise<boolean> {
    if (role === UserRole.SUPER_ADMIN) return true;
    const map = await this.load();
    return map.get(role)?.has(permission) ?? false;
  }

  /** Effective permission list for a role (SUPER_ADMIN → everything). */
  async permissionsFor(role: UserRole): Promise<string[]> {
    if (role === UserRole.SUPER_ADMIN) return [...ALL_PERMISSIONS];
    const map = await this.load();
    return [...(map.get(role) ?? [])];
  }

  /** Full editable matrix (SUPER_ADMIN excluded — it is a fixed bypass). */
  async matrix(): Promise<Record<string, string[]>> {
    const map = await this.load();
    const out: Record<string, string[]> = {};
    for (const role of Object.values(UserRole)) {
      if (role === UserRole.SUPER_ADMIN) continue;
      out[role] = [...(map.get(role) ?? [])];
    }
    return out;
  }

  /** Replace all grants for a role. SUPER_ADMIN is not editable. */
  async setRolePermissions(role: UserRole, permissions: string[]): Promise<void> {
    if (role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('SUPER_ADMIN permissions cannot be edited');
    }
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) {
      throw new BadRequestException(`Unknown permissions: ${invalid.join(', ')}`);
    }
    const unique = [...new Set(permissions)];
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: unique.map((permission) => ({ role, permission })),
      }),
    ]);
    this.cache = null;
  }

  /** Drop the cache — call after external changes (e.g. seeding). */
  invalidate(): void {
    this.cache = null;
  }
}
