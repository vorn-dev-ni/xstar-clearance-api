import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, FileUploadStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { ListUploadsDto } from './dto/list-uploads.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UpdateUploadDto } from './dto/update-upload.dto';

/** Images + business documents. Anything else is rejected at presign. */
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reserve a storage key, persist a PENDING record, and hand back a presigned
   * PUT URL. The client uploads the bytes directly to S3, then calls `confirm`.
   */
  async presign(dto: PresignUploadDto, userId: string) {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(dto.mimeType)) {
      throw new UnprocessableEntityException(
        `File type ${dto.mimeType} is not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    const key = this.s3.buildKey(dto.entityType, dto.fileName);
    const file = await this.prisma.fileUpload.create({
      data: {
        key,
        bucket: this.s3.bucket,
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        entityType: dto.entityType,
        entityId: dto.entityId,
        documentType: dto.documentType,
        uploadedBy: userId,
      },
    });
    const uploadUrl = await this.s3.presignPut(key, dto.mimeType);
    return {
      fileId: file.id,
      key,
      uploadUrl,
      expiresIn: this.s3.presignExpiry,
    };
  }

  /** Mark an upload complete once the client has PUT the object to S3. */
  async confirm(id: string, dto: ConfirmUploadDto, userId: string) {
    const file = await this.findOrThrow(id);
    const head = await this.s3.headObject(file.key);
    if (!head.exists) {
      throw new NotFoundException(
        'File was not found in storage — upload it first',
      );
    }
    // Trust the size S3 stored, not the client's claim; evict oversized objects.
    const size = head.size ?? dto.size;
    if (size !== undefined && size > MAX_UPLOAD_BYTES) {
      await this.s3.deleteObject(file.key);
      await this.prisma.fileUpload.delete({ where: { id } });
      throw new UnprocessableEntityException(
        `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`,
      );
    }
    const updated = await this.prisma.fileUpload.update({
      where: { id },
      data: { status: FileUploadStatus.UPLOADED, size },
    });
    await this.audit.log({
      userId,
      entityType: 'FileUpload',
      entityId: id,
      action: AuditAction.CREATE,
      after: {
        key: file.key,
        entityType: file.entityType,
        entityId: file.entityId,
      },
    });

    if (
      file.entityType === 'Customer' &&
      file.entityId &&
      file.documentType === 'REPRESENTATIVE_IMAGE'
    ) {
      try {
        await this.prisma.customer.update({
          where: { id: file.entityId },
          data: { representativeImageUrl: file.key },
        });
      } catch {
        // Ignore if customer not found
      }
    } else if (file.entityType === 'User' && file.entityId) {
      try {
        await this.prisma.user.update({
          where: { id: file.entityId },
          data: { avatarUrl: file.key },
        });
      } catch {
        // Ignore if user not found
      }
    }

    return updated;
  }

  /** Presigned download URL for a stored file. */
  async getDownloadUrl(id: string) {
    const file = await this.findOrThrow(id);
    const url = await this.s3.presignGet(file.key);
    return { url, expiresIn: this.s3.presignExpiry };
  }

  /** List a record's attachments (or all uploads when no filter is given). */
  findAll(query: ListUploadsDto) {
    return this.prisma.fileUpload.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Re-tag a file's document category after upload. */
  async updateMeta(id: string, dto: UpdateUploadDto, userId: string) {
    const file = await this.findOrThrow(id);
    const updated = await this.prisma.fileUpload.update({
      where: { id },
      data: { documentType: dto.documentType },
    });
    await this.audit.log({
      userId,
      entityType: 'FileUpload',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { documentType: file.documentType },
      after: { documentType: updated.documentType },
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    const file = await this.findOrThrow(id);
    await this.s3.deleteObject(file.key);
    await this.prisma.fileUpload.delete({ where: { id } });
    await this.audit.log({
      userId,
      entityType: 'FileUpload',
      entityId: id,
      action: AuditAction.DELETE,
      before: { key: file.key },
    });
    return { id, deleted: true };
  }

  private async findOrThrow(id: string) {
    const file = await this.prisma.fileUpload.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }
}
