import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendCustomMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Message text cannot be empty' })
  @MaxLength(4096, { message: 'Message cannot exceed 4096 characters' })
  message!: string;
}
