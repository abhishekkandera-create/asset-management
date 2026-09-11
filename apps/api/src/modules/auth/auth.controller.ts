import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, LoginResponse } from '@asset/shared';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthService, RequestContext } from './auth.service';
import { ChangePasswordRequestDto, LoginRequestDto, RefreshRequestDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and receive an access/refresh token pair' })
  @ApiResponse({ status: 200, description: 'Signed in' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS' })
  login(@Body() body: LoginRequestDto, @Req() request: Request): Promise<LoginResponse> {
    return this.auth.login(body, contextOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair (rotates the old one)' })
  @ApiResponse({ status: 401, description: 'INVALID_REFRESH_TOKEN' })
  refresh(@Body() body: RefreshRequestDto, @Req() request: Request): Promise<LoginResponse> {
    return this.auth.refresh(body.refreshToken, contextOf(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() body: RefreshRequestDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The currently authenticated app user' })
  me(@CurrentUser('id') userId: string): Promise<AuthUser> {
    return this.auth.me(userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your own password; signs out all sessions' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<void> {
    await this.auth.changePassword(userId, body);
  }
}

function contextOf(request: Request): RequestContext {
  return {
    userAgent: request.headers['user-agent'],
    ipAddress: request.ip,
  };
}
