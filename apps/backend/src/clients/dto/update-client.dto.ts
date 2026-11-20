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
import { CategoryTier, ConsentStatus, AccountStatus } from '@prisma/client';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsEnum(CategoryTier)
  categoryTier?: CategoryTier;

  @IsOptional()
  @IsEnum(CategoryTier)
  category?: CategoryTier;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(ConsentStatus)
  communicationConsent?: ConsentStatus;

  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
