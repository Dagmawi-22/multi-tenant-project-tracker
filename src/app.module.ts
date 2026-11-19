import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { Membership, Organization, Project, Task, User } from './entities';
import { HealthController } from './health/health.controller';
import { OrgsModule } from './orgs/orgs.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { WebModule } from './web/web.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

        return {
          type: 'postgres' as const,
          url,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          entities: [User, Organization, Membership, Project, Task],
          synchronize: false,
          autoLoadEntities: false,
        };
      },
    }),
    CommonModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
    TasksModule,
    WebModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
