import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership } from '../entities';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { OrgAdminGuard } from './guards/org-admin.guard';
import { OrgMemberGuard } from './guards/org-member.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Membership])],
  providers: [
    AuthenticatedGuard,
    OrgMemberGuard,
    OrgAdminGuard,
    { provide: APP_GUARD, useClass: OrgMemberGuard },
  ],
  exports: [AuthenticatedGuard, OrgMemberGuard, OrgAdminGuard, TypeOrmModule],
})
export class CommonModule {}
