import { createZodDto } from 'nestjs-zod';
import {
  addAssetNoteSchema,
  correctSerialNumberSchema,
  createAssetSchema,
  inspectAssetSchema,
  issueAssetSchema,
  listAssetEventsQuerySchema,
  listAssetsQuerySchema,
  markLostSchema,
  recoverAssetSchema,
  relocateAssetSchema,
  retireAssetSchema,
  returnAssetSchema,
  transferAssetSchema,
  updateAssetSchema,
} from '@asset/shared';

export class ListAssetsQueryDto extends createZodDto(listAssetsQuerySchema) {}
export class ListAssetEventsQueryDto extends createZodDto(listAssetEventsQuerySchema) {}
export class CreateAssetDto extends createZodDto(createAssetSchema) {}
export class UpdateAssetDto extends createZodDto(updateAssetSchema) {}
export class CorrectSerialNumberDto extends createZodDto(correctSerialNumberSchema) {}
export class AddAssetNoteDto extends createZodDto(addAssetNoteSchema) {}
export class IssueAssetDto extends createZodDto(issueAssetSchema) {}
export class ReturnAssetDto extends createZodDto(returnAssetSchema) {}
export class InspectAssetDto extends createZodDto(inspectAssetSchema) {}
export class TransferAssetDto extends createZodDto(transferAssetSchema) {}
export class MarkLostDto extends createZodDto(markLostSchema) {}
export class RecoverAssetDto extends createZodDto(recoverAssetSchema) {}
export class RetireAssetDto extends createZodDto(retireAssetSchema) {}
export class RelocateAssetDto extends createZodDto(relocateAssetSchema) {}
