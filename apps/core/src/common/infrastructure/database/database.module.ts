import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * DatabaseModule is global so PrismaService is available in every module
 * without repeated imports. Domain modules do not depend on this module
 * directly — they receive their ports via dependency injection.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
