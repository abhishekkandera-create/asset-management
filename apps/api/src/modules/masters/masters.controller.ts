import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import type { AssetCategory, AssetModel, Location, Paginated, Vendor } from '@asset/shared';
import {
  UserRole,
  createAssetModelSchema,
  listCategoriesQuerySchema,
  listLocationsQuerySchema,
  listModelsQuerySchema,
  listVendorsQuerySchema,
  updateAssetModelSchema,
} from '@asset/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { UuidParam } from '../../common/pipes/uuid-param.pipe';
import { MastersService } from './masters.service';

class ListLocationsQueryDto extends createZodDto(listLocationsQuerySchema) {}
class ListVendorsQueryDto extends createZodDto(listVendorsQuerySchema) {}
class ListCategoriesQueryDto extends createZodDto(listCategoriesQuerySchema) {}
class ListModelsQueryDto extends createZodDto(listModelsQuerySchema) {}
class CreateAssetModelDto extends createZodDto(createAssetModelSchema) {}
class UpdateAssetModelDto extends createZodDto(updateAssetModelSchema) {}

@ApiTags('masters')
@ApiBearerAuth()
@Controller()
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get('locations')
  @ApiOperation({ summary: 'Locations' })
  locations(@Query() query: ListLocationsQueryDto): Promise<Paginated<Location>> {
    return this.masters.listLocations(query);
  }

  @Get('vendors')
  @ApiOperation({ summary: 'Vendors and service centres' })
  vendors(@Query() query: ListVendorsQueryDto): Promise<Paginated<Vendor>> {
    return this.masters.listVendors(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Asset categories' })
  categories(@Query() query: ListCategoriesQueryDto): Promise<Paginated<AssetCategory>> {
    return this.masters.listCategories(query);
  }

  @Get('models')
  @ApiOperation({ summary: 'Asset models' })
  models(@Query() query: ListModelsQueryDto): Promise<Paginated<AssetModel>> {
    return this.masters.listModels(query);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'One asset model, including its specifications' })
  model(@UuidParam('id') id: string): Promise<AssetModel> {
    return this.masters.findModel(id);
  }

  @Post('models')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add an asset model and its specifications' })
  createModel(
    @Body() body: CreateAssetModelDto,
    @CurrentUser('id') actorId: string,
  ): Promise<AssetModel> {
    return this.masters.createModel(body, actorId);
  }

  @Patch('models/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit a model or its specifications' })
  updateModel(
    @UuidParam('id') id: string,
    @Body() body: UpdateAssetModelDto,
    @CurrentUser('id') actorId: string,
  ): Promise<AssetModel> {
    return this.masters.updateModel(id, body, actorId);
  }
}
