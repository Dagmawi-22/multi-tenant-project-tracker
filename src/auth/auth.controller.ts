import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { establishSession, destroySession } from './session.helpers';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Req() request: Request, @Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    await establishSession(request, user);

    return { id: user.id, name: user.name, email: user.email };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Req() request: Request, @Body() dto: LoginDto) {
    const user = await this.authService.validate(dto.email, dto.password);
    await establishSession(request, user);

    return { id: user.id, name: user.name, email: user.email };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request) {
    await destroySession(request);
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  me(@Req() request: Request) {
    if (!request.session.userId) {
      throw new UnauthorizedException();
    }

    return { id: request.session.userId, name: request.session.userName };
  }
}
