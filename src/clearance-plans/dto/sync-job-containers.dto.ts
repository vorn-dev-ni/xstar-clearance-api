import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { ContainerDto } from './container.dto';

/** Body for PUT /clearance-plans/by-job/:jobId — replaces a job's container set. */
export class SyncJobContainersDto {
  @ApiProperty({ type: [ContainerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContainerDto)
  containers!: ContainerDto[];
}
