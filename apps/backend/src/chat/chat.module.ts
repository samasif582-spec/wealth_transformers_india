import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TemplatesModule } from '../templates/templates.module';
import { LlmReplyService } from './llm-reply.service';

@Module({
  imports: [PrismaModule, RedisModule, TemplatesModule],
  providers: [LlmReplyService],
  exports: [LlmReplyService],
})
export class ChatModule {}
