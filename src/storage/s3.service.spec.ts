import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';

/** Minimal ConfigService stub returning the S3 env values. */
function makeConfig() {
  const values: Record<string, unknown> = {
    AWS_REGION: 'ap-southeast-1',
    AWS_S3_BUCKET: 'systemxstar',
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    S3_PRESIGN_EXPIRY: 900,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('S3Service.buildKey', () => {
  const service = new S3Service(makeConfig() as never);

  it('namespaces by lowercased entity type and keeps a unique prefix', () => {
    const key = service.buildKey('Invoice', 'report.pdf');
    expect(key).toMatch(/^uploads\/invoice\/[0-9a-f-]{36}-report\.pdf$/);
  });

  it('falls back to misc when no entity type is given', () => {
    const key = service.buildKey(undefined, 'file.png');
    expect(key.startsWith('uploads/misc/')).toBe(true);
  });

  it('sanitizes hostile filenames so they cannot escape the prefix', () => {
    const key = service.buildKey('Patent', '../../etc/passwd');
    // Slashes in the filename are stripped, so the key keeps exactly three
    // segments (uploads / patent / <uuid>-<name>) and can't traverse.
    expect(key.split('/')).toHaveLength(3);
    expect(key.startsWith('uploads/patent/')).toBe(true);
  });

  it('exposes bucket and presign expiry from config', () => {
    expect(service.bucket).toBe('systemxstar');
    expect(service.presignExpiry).toBe(900);
  });
});
