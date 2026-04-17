import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { WarehousesController } from './warehouses.controller';

@Module({
  imports: [DbModule],
  controllers: [WarehousesController],
})
export class WarehousesModule {}
