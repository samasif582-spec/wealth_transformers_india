import { IsOptional, IsString, IsArray, IsEmail, IsNotEmpty } from 'class-validator';

export class ShareReportDto {
  @IsArray()
  @IsEmail({}, { each: true })
  @IsNotEmpty()
  recipients!: string[];

  @IsString()
  @IsOptional()
  customMessage?: string;

  @IsString()
  @IsOptional()
  billingCycle?: string; // e.g. "2026-11"
}
