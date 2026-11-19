import {
  IsString,
  IsUUID,
  IsEnum,
  Length,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ConsentSource } from '@prisma/client';

export * from './record-consent.dto';
export * from './inbound-optout.dto';

export class OptInDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsEnum(ConsentSource)
  source?: ConsentSource = ConsentSource.MANUAL_ENTRY;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceReference?: string;
}

export class OptOutDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsEnum(ConsentSource)
  source?: ConsentSource = ConsentSource.MANUAL_ENTRY;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceReference?: string;
}

export class ExportConsentDto {
  @IsOptional()
  @IsEnum(ConsentSource)
  source?: ConsentSource;
}
