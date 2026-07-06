import {
  Inject,
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.enums';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { jwtConfig, type TJwtConfig } from '../config/jwt.config';
import { appConfig, type TAppConfig } from '../config/app.config';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: TJwtConfig,
    @Inject(appConfig.KEY)
    private readonly appConf: TAppConfig,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async registerUser(dto: RegisterDto): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }> {
    // 1. Проверяем, существует ли пользователь
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    // 2. Хешируем пароль
    const saltRounds = this.appConf.hashSalt;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 3. Создаём пользователя
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      role: UserRole.USER,
    });

    // 4. Генерируем токены
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // 5. Хешируем refreshToken и сохраняем в БД
    const hashedRefreshToken = await bcrypt.hash(refreshToken, saltRounds);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    return { user, accessToken, refreshToken };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = dto;

    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);

    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      this.appConf.hashSalt,
    );
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      password: _password,
      refreshToken: _refreshToken,
      ...userWithoutSensitive
    } = user;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    return {
      accessToken,
      refreshToken,
      user: userWithoutSensitive,
    };
  }
  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findOne(userId);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Доступ запрещён');
    }

    const isTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isTokenValid) {
      throw new UnauthorizedException('Неверный refresh токен');
    }

    const tokens = await this.generateTokens(user);

    const hashedRefreshToken = await bcrypt.hash(
      tokens.refreshToken,
      this.appConf.hashSalt,
    );
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    return tokens;
  }
  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.jwtConf.accessSecret,
        expiresIn: this.jwtConf.accessExpiresIn as StringValue,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.jwtConf.refreshSecret,
        expiresIn: this.jwtConf.refreshExpiresIn as StringValue,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
