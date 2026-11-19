import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  MaxLength,
  MinLength,
  Matches,
  IsObject,
} from 'class-validator';
import { TemplateCategory, TemplateHeaderType } from '@prisma/client';

export class CreateTemplateDto {
  @IsString()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'name must be lowercase letters, digits, and underscores only',
  })
  name!: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @IsEnum(TemplateHeaderType)
  @IsOptional()
  header_type?: TemplateHeaderType;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  header_text?: string;

  @IsString()
  @IsOptional()
  header_media_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  body_text!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  footer_text?: string;

  @IsArray()
  @IsOptional()
  buttons?: Record<string, unknown>[];

  @IsObject()
  @IsOptional()
  variable_samples?: Record<string, string>;

  @IsObject()
  @IsOptional()
  variable_schema?: Record<string, any>;
}
