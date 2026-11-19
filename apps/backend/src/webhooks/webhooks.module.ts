import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsentModule } from '../consent/consent.module';
import { ChatModule } from '../chat/chat.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { MetaSignatureGuard } from './guards/meta-signature.guard';

@Module({
  imports: [PrismaModule, ConsentModule, ChatModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, MetaSignatureGuard],
  exports: [WebhooksService, MetaSignatureGuard],
})
export class WebhooksModule {}
