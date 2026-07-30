import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';

/**
 * Release every in-stock unit in a B/L group — optionally narrowed to a single
 * container — in one action ("container released"). At least one of
 * `blNumber` / `clearanceJobId` is required to target the group.
 */
export class BatchReleaseDto {
  @ApiPropertyOptional({ example: 'EGLV147502172359' })
  @IsOptional()
  @IsString()
  blNumber?: string;

  @ApiPropertyOptional({ description: 'Shipment (clearance job) id' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({
    example: 'TIIU5273173',
    description: 'Limit the release to one container / truck',
  })
  @IsOptional()
  @IsString()
  containerTruckNumber?: string;

  @ApiProperty({ description: 'Released with duty paid (settles suspension)' })
  @IsBoolean()
  dutyPaid!: boolean;

  @ApiPropertyOptional({ description: 'Release declaration (SAD / IM4)' })
  @IsOptional()
  @IsString()
  sadId?: string;

  @ApiPropertyOptional({ example: '2026-07-30' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
