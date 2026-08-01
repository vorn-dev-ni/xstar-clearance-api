import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * One container row shared by a Shipment (ClearanceJob) and its Clearance Plan.
 * `id` is present for existing rows (update) and absent for new ones (create).
 */
export class ContainerDto {
  @ApiPropertyOptional({ description: 'Existing ClearancePlan id (update)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Container / truck number' })
  @IsString()
  @IsNotEmpty()
  container!: string;

  @ApiPropertyOptional({ description: "The container's Bill of Loading" })
  @IsOptional()
  @IsString()
  blNumber?: string;

  @ApiPropertyOptional({ description: 'Size / Volume', example: "40'" })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Container / Truck type' })
  @IsOptional()
  @IsString()
  containerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commodity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seal?: string;

  @ApiPropertyOptional({ example: 'TEC' })
  @IsOptional()
  @IsString()
  port?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consignee?: string;

  @ApiPropertyOptional({ example: '2026-05-02' })
  @IsOptional()
  @IsISO8601()
  clearanceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
