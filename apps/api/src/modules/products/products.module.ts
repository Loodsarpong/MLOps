import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { ProductsController } from './products.controller';

@Module({
  imports: [DbModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
