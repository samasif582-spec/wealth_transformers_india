import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { MediaFileType } from '@prisma/client';

export class QueryMediaDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsEnum(MediaFileType)
  fileType?: MediaFileType;

  @IsOptional()
  @IsString()
  search?: string;
}
