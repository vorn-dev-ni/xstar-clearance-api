import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['operation.view', 'operation.edit'],
    description: 'The full set of permission keys granted to this role',
  })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
