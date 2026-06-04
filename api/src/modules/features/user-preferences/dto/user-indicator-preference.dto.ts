// src/modules/features/indicators/dto/user-indicator-preference.dto.ts
import { IsBoolean, IsOptional, IsUUID, IsObject } from 'class-validator';

export class CreateUserIndicatorPreferenceDto {
  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @IsObject()
  @IsOptional()
  displayPreferences?: {
    icon?: string;
    color?: string;
  };
}

export class UpdateUserIndicatorPreferenceDto {
  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @IsObject()
  @IsOptional()
  displayPreferences?: {
    icon?: string;
    color?: string;
  };
}