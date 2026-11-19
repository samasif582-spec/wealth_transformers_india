import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class PresignedUploadDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @IsPositive()
  fileSize!: number;
}
