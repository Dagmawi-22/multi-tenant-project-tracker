import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { OrgsModule } from '../orgs/orgs.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { WebController } from './web.controller';

@Module({
  imports: [CommonModule, AuthModule, InvitationsModule, OrgsModule, ProjectsModule, TasksModule],
  controllers: [WebController],
})
export class WebModule {}
