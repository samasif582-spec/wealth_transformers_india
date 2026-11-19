import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ConsentStatus, ConsentSource } from '@prisma/client';

export class RecordConsentDto {
  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @IsEnum(ConsentStatus)
  @IsNotEmpty()
  status!: ConsentStatus;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceReference?: string;

  @IsOptional()
  @IsEnum(ConsentSource)
  source?: ConsentSource = ConsentSource.MANUAL_ENTRY;
}
