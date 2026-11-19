import {
  IsString,
  IsEnum,
  IsUUID,
  IsOptional,
  IsISO8601,
  ValidateNested,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignType, CategoryTier, ConsentStatus } from '@prisma/client';

export class AudienceFiltersDto {
  @IsOptional()
  @IsArray()
  @IsEnum(CategoryTier, { each: true })
  category?: CategoryTier[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  language?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  dob_month?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(ConsentStatus, { each: true })
  consent_status?: ConsentStatus[];
}

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsEnum(CampaignType)
  type!: CampaignType;

  @IsUUID()
  template_id!: string;

  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFiltersDto)
  audience_filters?: AudienceFiltersDto;
}
