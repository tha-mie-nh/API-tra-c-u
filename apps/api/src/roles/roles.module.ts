import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [DatasourcesModule],
  controllers: [RolesController, PermissionsController],
  providers: [RolesService],
})
export class RolesModule {}
