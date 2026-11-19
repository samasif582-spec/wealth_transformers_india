import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class TemplatePreviewDto {
  @IsString()
  @IsNotEmpty()
  bodyText!: string;

  @IsOptional()
  @IsObject()
  sampleValues?: Record<string, string>;

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;
}
