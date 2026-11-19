import { IsBoolean, IsNotEmpty, IsString, MinLength, MaxLength, Equals } from 'class-validator';

export class ErasureRequestDto {
  @IsBoolean()
  @Equals(true, { message: 'Explicit confirmation required for irreversible DPDP erasure' })
  confirmed!: boolean;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
