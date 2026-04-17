import { Module } from '@nestjs/common';
// Auth is handled by JwtAuthGuard + RolesGuard (see common/auth/).
// This module exists to host /auth/me and /auth/refresh proxies to Cognito.
@Module({})
export class AuthModule {}
