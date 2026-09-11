import { createZodDto } from 'nestjs-zod';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
} from '@asset/shared';

/**
 * DTOs are thin wrappers over the shared schemas so Swagger can describe them.
 * The schema itself always lives in @asset/shared — it is the contract the web
 * app validates against too (CLAUDE.md §3).
 */
export class LoginRequestDto extends createZodDto(loginRequestSchema) {}
export class RefreshRequestDto extends createZodDto(refreshRequestSchema) {}
export class ChangePasswordRequestDto extends createZodDto(changePasswordRequestSchema) {}
