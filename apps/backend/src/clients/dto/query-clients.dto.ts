import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CategoryTier, ConsentStatus, AccountStatus } from '@prisma/client';

export class QueryClientsDto {
  @IsOptional()
  @IsString()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['q'] as string) || (obj['search'] as string);
  })
  q?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CategoryTier)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const val = obj['categoryTier'] || obj['category'];
    return Array.isArray(val) ? val[0] : val;
  })
  categoryTier?: CategoryTier;

  @IsOptional()
  category?: CategoryTier | CategoryTier[];

  @IsOptional()
  @IsEnum(ConsentStatus)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const val = obj['communicationConsent'] || obj['consentStatus'] || obj['consent'];
    return Array.isArray(val) ? val[0] : val;
  })
  communicationConsent?: ConsentStatus;

  @IsOptional()
  @IsEnum(ConsentStatus)
  consentStatus?: ConsentStatus;

  @IsOptional()
  consent?: ConsentStatus | ConsentStatus[];

  @IsOptional()
  @IsEnum(AccountStatus)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['accountStatus'] as AccountStatus) || (obj['status'] as AccountStatus);
  })
  accountStatus?: AccountStatus;

  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @IsOptional()
  @IsString()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const val = obj['preferredLanguage'] || obj['language'];
    return Array.isArray(val) ? val[0] : val;
  })
  preferredLanguage?: string;

  @IsOptional()
  language?: string | string[];

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  dob_month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  include_deleted?: boolean = false;
}
