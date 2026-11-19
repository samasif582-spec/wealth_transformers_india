import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateRoleDto {
  @IsEnum(UserRole, { message: 'Role must be one of: Super_Admin, Admin, Marketing_Employee, Operator, Viewer' })
  @IsNotEmpty({ message: 'Role is required' })
  role!: UserRole;
}
