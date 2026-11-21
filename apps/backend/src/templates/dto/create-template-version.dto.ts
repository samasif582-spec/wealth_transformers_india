import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsArray,
} from 'class-validator';
import { TemplateHeaderType } from '@prisma/client';

export class CreateTemplateVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  body_text!: string;

  @IsOptional()
  @IsEnum(TemplateHeaderType)
  header_type?: TemplateHeaderType;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  header_text?: string;

  @IsOptional()
  @IsString()
  header_media_id?: string;

  @IsOptional()
  @IsString()
  header_media_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  footer_text?: string;

  @IsOptional()
  @IsObject()
  variable_samples?: Record<string, string>;

  @IsOptional()
  @IsObject()
  variable_schema?: Record<string, any>;

  @IsOptional()
  @IsArray()
  buttons?: Record<string, unknown>[];
}
