import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { Membership, Organization, Project, Task, User } from './entities';
import { OrgsModule } from './orgs/orgs.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
      entities: [User, Organization, Membership, Project, Task],
      synchronize: false,
      autoLoadEntities: false,
    }),
    CommonModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
    TasksModule,
  ],
})
export class AppModule {}
