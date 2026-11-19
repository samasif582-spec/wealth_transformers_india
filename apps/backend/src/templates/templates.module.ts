import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { MetaTemplatesAdapter } from './meta-templates.adapter';
import { MetaMessagesAdapter } from './meta-messages.adapter';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, MetaTemplatesAdapter, MetaMessagesAdapter],
  exports: [TemplatesService, MetaTemplatesAdapter, MetaMessagesAdapter],
})
export class TemplatesModule {}
