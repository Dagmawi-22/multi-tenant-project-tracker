import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { Invitation, Membership, Organization, User } from '../entities';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invitation, Membership, Organization, User]), CommonModule],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
