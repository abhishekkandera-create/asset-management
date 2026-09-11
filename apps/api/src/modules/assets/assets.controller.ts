import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Asset, AssetEvent, AuthUser, Paginated } from '@asset/shared';
import { UserRole } from '@asset/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { UuidParam } from '../../common/pipes/uuid-param.pipe';
import { EventsService } from '../events/events.service';
import { AssetsService } from './assets.service';
import {
  AddAssetNoteDto,
  CorrectSerialNumberDto,
  CreateAssetDto,
  InspectAssetDto,
  IssueAssetDto,
  ListAssetEventsQueryDto,
  ListAssetsQueryDto,
  MarkLostDto,
  RecoverAssetDto,
  RelocateAssetDto,
  RetireAssetDto,
  ReturnAssetDto,
  TransferAssetDto,
  UpdateAssetDto,
} from './dto/assets.dto';

/**
 * Controllers validate, delegate and shape — no business logic (CLAUDE.md §13).
 * Reads are open to any authenticated user, which makes VIEWER read-only;
 * writes carry an explicit minimum role (§7.10).
 */
@ApiTags('assets')
@ApiBearerAuth()
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly events: EventsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, filterable list of individually tracked assets' })
  list(@Query() query: ListAssetsQueryDto): Promise<Paginated<Asset>> {
    return this.assets.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One asset, including its current holder' })
  findOne(@UuidParam('id') id: string): Promise<Asset> {
    return this.assets.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Chronological asset_event feed, newest first' })
  history(
    @UuidParam('id') id: string,
    @Query() query: ListAssetEventsQueryDto,
  ): Promise<Paginated<AssetEvent>> {
    return this.events.historyForAsset(id, query);
  }

  @Get(':id/available-actions')
  @ApiOperation({ summary: 'Statuses this asset may move to, for the UI action buttons' })
  availableActions(@UuidParam('id') id: string) {
    return this.assets.availableActions(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an asset; it always starts IN_STOCK' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_ASSET_TAG or DUPLICATE_SERIAL_NUMBER' })
  create(@Body() body: CreateAssetDto, @CurrentUser() user: AuthUser): Promise<Asset> {
    return this.assets.create(body, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Edit an asset. The tag is immutable and the serial has its own endpoint.',
  })
  update(
    @UuidParam('id') id: string,
    @Body() body: UpdateAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.update(id, body, user);
  }

  @Post(':id/correct-serial')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Correct a serial number; writes a NOTE_ADDED event with both values' })
  correctSerial(
    @UuidParam('id') id: string,
    @Body() body: CorrectSerialNumberDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.correctSerialNumber(id, body, user);
  }

  @Post(':id/notes')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Append a note to the asset history' })
  addNote(
    @UuidParam('id') id: string,
    @Body() body: AddAssetNoteDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.addNote(id, body, user);
  }

  // --- lifecycle ------------------------------------------------------------

  @Post(':id/issue')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue to an employee' })
  @ApiResponse({ status: 409, description: 'ASSET_ALREADY_ASSIGNED' })
  @ApiResponse({ status: 422, description: 'ASSET_NOT_AVAILABLE or EMPLOYEE_EXITED' })
  issue(
    @UuidParam('id') id: string,
    @Body() body: IssueAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.issue(id, body, user);
  }

  @Post(':id/return')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take an asset back; always lands in RETURNED_PENDING_CHECK' })
  @ApiResponse({ status: 422, description: 'ASSET_NOT_ASSIGNED' })
  returnAsset(
    @UuidParam('id') id: string,
    @Body() body: ReturnAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.returnAsset(id, body, user);
  }

  @Post(':id/inspect')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the inspection outcome for a returned asset' })
  inspect(
    @UuidParam('id') id: string,
    @Body() body: InspectAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.inspect(id, body, user);
  }

  @Post(':id/transfer')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move directly to another employee: return, inspect and issue in one transaction',
  })
  transfer(
    @UuidParam('id') id: string,
    @Body() body: TransferAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.transfer(id, body, user);
  }

  @Post(':id/mark-lost')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report an asset lost; writes off any open assignment' })
  markLost(
    @UuidParam('id') id: string,
    @Body() body: MarkLostDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.markLost(id, body, user);
  }

  @Post(':id/recover')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A lost asset turned up; return it to stock' })
  recover(
    @UuidParam('id') id: string,
    @Body() body: RecoverAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.recover(id, body, user);
  }

  @Post(':id/retire')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retire an asset. Terminal — nothing comes back from RETIRED.' })
  retire(
    @UuidParam('id') id: string,
    @Body() body: RetireAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.retire(id, body, user);
  }

  @Post(':id/relocate')
  @Roles(UserRole.STORE_KEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change the asset's owning location" })
  relocate(
    @UuidParam('id') id: string,
    @Body() body: RelocateAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Asset> {
    return this.assets.relocate(id, body, user);
  }
}
