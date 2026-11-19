import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class InboundOptOutDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsString()
  @IsNotEmpty()
  keyword!: string;

  @IsOptional()
  @IsString()
  messageText?: string;
}
