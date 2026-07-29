import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClearancePlanDto {
  @ApiProperty({
    description:
      'Linked Shipment (ClearanceJob) id — the Bill of Loading source',
  })
  @IsString()
  @IsNotEmpty()
  clearanceJobId!: string;

  @ApiProperty({ description: 'Container number' })
  @IsString()
  @IsNotEmpty()
  container!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consignee?: string;

  @ApiPropertyOptional({ example: "40'" })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seal?: string;

  @ApiPropertyOptional({
    description: 'Commodity (the sheet\'s "COMMUNITY" column)',
  })
  @IsOptional()
  @IsString()
  commodity?: string;

  @ApiPropertyOptional({ example: 'TEC' })
  @IsOptional()
  @IsString()
  port?: string;

  @ApiPropertyOptional({ example: '2026-05-02' })
  @IsOptional()
  @IsISO8601()
  clearanceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
