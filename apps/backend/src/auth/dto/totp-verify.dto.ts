import { IsNotEmpty, IsString, Length } from 'class-validator';

export class TotpVerifyDto {
  @IsString({ message: 'Code must be a string' })
  @IsNotEmpty({ message: 'Code is required' })
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  code!: string;
}
