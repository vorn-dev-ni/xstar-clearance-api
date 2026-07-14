import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        department: dto.department,
        phone: dto.phone,
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      role: user.role,
      token: this.sign(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return {
      token: this.sign(user),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /** Issue a fresh token for an already-authenticated user. */
  async refresh(current: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: current.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }
    return { token: this.sign(user) };
  }

  private sign(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.sign(payload);
  }
}
