// src/modules/features/event-types/dto/event-type.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateEventTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsString() @IsNotEmpty() @MaxLength(120) label: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateEventTypeDto extends PartialType(CreateEventTypeDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
