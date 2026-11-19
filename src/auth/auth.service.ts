import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('An account with that email already exists');
    }

    const user = this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
    });

    return this.users.save(user);
  }

  async validate(email: string, password: string): Promise<User> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();
  }
}
