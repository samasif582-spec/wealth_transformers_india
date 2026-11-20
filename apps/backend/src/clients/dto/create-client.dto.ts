import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CategoryTier, ConsentStatus, AccountStatus } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['fullName'] as string) || (obj['name'] as string) || '';
  })
  fullName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['whatsappNumber'] as string) || (obj['phone'] as string) || '';
  })
  whatsappNumber!: string;

  // Aliases for compatibility
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsEnum(CategoryTier)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['categoryTier'] as CategoryTier) || (obj['category'] as CategoryTier) || CategoryTier.RETAIL;
  })
  categoryTier?: CategoryTier = CategoryTier.RETAIL;

  @IsOptional()
  @IsEnum(CategoryTier)
  category?: CategoryTier;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['preferredLanguage'] as string) || (obj['language'] as string) || 'en';
  })
  preferredLanguage?: string = 'en';

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(ConsentStatus)
  communicationConsent?: ConsentStatus = ConsentStatus.PENDING;

  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus = AccountStatus.ACTIVE;

  @IsOptional()
  @IsDateString()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    return (obj['dateOfBirth'] as string) || (obj['dob'] as string);
  })
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
