import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../audit/audit.module';
import { TemplatesModule } from '../templates/templates.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { CsvImportService } from './csv-import.service';

@Module({
  imports: [PrismaModule, RedisModule, AuditModule, ConfigModule, TemplatesModule],
  controllers: [ClientsController],
  providers: [ClientsService, CsvImportService],
  exports: [ClientsService, CsvImportService],
})
export class ClientsModule {}
