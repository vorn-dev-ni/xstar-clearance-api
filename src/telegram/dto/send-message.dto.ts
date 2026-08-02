import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Hello from the API' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}
