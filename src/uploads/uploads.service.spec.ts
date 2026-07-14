import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FileUploadStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../storage/s3.service';
import { MAX_UPLOAD_BYTES, UploadsService } from './uploads.service';

function build() {
  const s3 = {
    bucket: 'systemxstar',
    presignExpiry: 900,
    buildKey: jest.fn().mockReturnValue('uploads/invoice/abc-report.pdf'),
    presignPut: jest.fn().mockResolvedValue('https://s3/put'),
    presignGet: jest.fn().mockResolvedValue('https://s3/get'),
    headObject: jest.fn().mockResolvedValue({ exists: true, size: 1024 }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const fileUpload = {
    create: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'f_1',
        ...args.data,
        status: FileUploadStatus.PENDING,
      }),
    ),
    findUnique: jest.fn().mockResolvedValue({
      id: 'f_1',
      key: 'uploads/invoice/abc-report.pdf',
      entityType: 'Invoice',
      entityId: 'inv_1',
    }),
    update: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'f_1', ...args.data }),
    ),
    delete: jest.fn().mockResolvedValue({}),
  };
  const prisma = { fileUpload };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new UploadsService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Service,
    audit as unknown as AuditService,
  );
  return { service, s3, fileUpload, audit };
}

describe('UploadsService', () => {
  it('presign creates a PENDING record and returns a presigned PUT url', async () => {
    const { service, s3, fileUpload } = build();

    const result = await service.presign(
      {
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        entityType: 'Invoice',
        entityId: 'inv_1',
      },
      'user_1',
    );

    expect(fileUpload.create).toHaveBeenCalled();
    expect(s3.presignPut).toHaveBeenCalledWith(
      'uploads/invoice/abc-report.pdf',
      'application/pdf',
    );
    expect(result).toMatchObject({
      fileId: 'f_1',
      uploadUrl: 'https://s3/put',
      expiresIn: 900,
    });
  });

  it('presign rejects a disallowed mime type', async () => {
    const { service, fileUpload } = build();

    await expect(
      service.presign(
        { fileName: 'virus.exe', mimeType: 'application/x-msdownload' },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fileUpload.create).not.toHaveBeenCalled();
  });

  it('confirm marks the record UPLOADED with the size S3 reports', async () => {
    const { service, fileUpload, audit } = build();

    // Client claims 5 bytes; S3 HEAD (1024) wins.
    const result = await service.confirm('f_1', { size: 5 }, 'user_1');

    expect(fileUpload.update).toHaveBeenCalledWith({
      where: { id: 'f_1' },
      data: { status: FileUploadStatus.UPLOADED, size: 1024 },
    });
    expect(audit.log).toHaveBeenCalled();
    expect(result.status).toBe(FileUploadStatus.UPLOADED);
  });

  it('confirm throws when the object is missing from storage', async () => {
    const { service, s3 } = build();
    s3.headObject.mockResolvedValueOnce({ exists: false });

    await expect(service.confirm('f_1', {}, 'user_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('confirm evicts oversized objects and rejects', async () => {
    const { service, s3, fileUpload } = build();
    s3.headObject.mockResolvedValueOnce({
      exists: true,
      size: MAX_UPLOAD_BYTES + 1,
    });

    await expect(service.confirm('f_1', {}, 'user_1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(s3.deleteObject).toHaveBeenCalledWith(
      'uploads/invoice/abc-report.pdf',
    );
    expect(fileUpload.delete).toHaveBeenCalledWith({ where: { id: 'f_1' } });
    expect(fileUpload.update).not.toHaveBeenCalled();
  });
});
