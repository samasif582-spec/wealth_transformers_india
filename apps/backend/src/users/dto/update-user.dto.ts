import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AccountStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Full name must be a string' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(150, { message: 'Full name must not exceed 150 characters' })
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  email?: string;

  @IsOptional()
  @IsEnum(AccountStatus, { message: 'Account status must be ACTIVE, INACTIVE, or LOCKED' })
  accountStatus?: AccountStatus;
}
