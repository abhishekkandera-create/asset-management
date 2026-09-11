import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import type { AssetCategory, AssetModel, Location, Paginated, Vendor } from '@asset/shared';
import {
  listCategoriesQuerySchema,
  listLocationsQuerySchema,
  listModelsQuerySchema,
  listVendorsQuerySchema,
} from '@asset/shared';
import { MastersService } from './masters.service';

class ListLocationsQueryDto extends createZodDto(listLocationsQuerySchema) {}
class ListVendorsQueryDto extends createZodDto(listVendorsQuerySchema) {}
class ListCategoriesQueryDto extends createZodDto(listCategoriesQuerySchema) {}
class ListModelsQueryDto extends createZodDto(listModelsQuerySchema) {}

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
}
