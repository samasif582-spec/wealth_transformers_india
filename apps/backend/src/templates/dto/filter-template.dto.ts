import { IsEnum, IsOptional, IsString, IsNumberString } from 'class-validator';
import { TemplateCategory, TemplateStatus } from '@prisma/client';

export class FilterTemplateDto {
  @IsEnum(TemplateCategory)
  @IsOptional()
  category?: TemplateCategory;

  @IsEnum(TemplateStatus)
  @IsOptional()
  status?: TemplateStatus;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsNumberString()
  @IsOptional()
  page?: string;

  @IsNumberString()
  @IsOptional()
  limit?: string;
}
