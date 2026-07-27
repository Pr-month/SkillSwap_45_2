import { appConfig, TAppConfig } from './../config/app.config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserGender, UserRole } from './user.enums';
import { beforeEach, describe, it } from 'node:test';
import { User } from './entities/user.entity';
import { Skill } from '../skills/entities/skill.entity';
import { QueryFailedError } from 'typeorm';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { EntityNotFoundException } from '../common/exceptions/entity-not-found.exception';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';

// Мокируем bcrypt и приводим к типизированному модулю Jest
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UsersService', () => {
  let service: UsersService;

  // Мокаем функции репозиториев с явной типизацией ReturnType и Args
  const mockUserRepository = {
    findOne: jest.fn<Promise<User | null>, [any]>(),
    find: jest.fn<Promise<User[]>, []>(),
    create: jest.fn<User, [Partial<User>]>(),
    save: jest.fn<Promise<User>, [User]>(),
    update: jest.fn<Promise<any>, [any, any]>(),
    delete: jest.fn<Promise<any>, [any]>(),
  };

  const mockSkillRepository = {
    findOne: jest.fn<Promise<Skill | null>, [any]>(),
  };

  const mockAppConfig: TAppConfig = {
    port: 3000,
    hashSalt: 10,
  };

  // Моковые данные пользователя (строго соответствуют Entity User)
  // Обратите внимание: birthdate в Entity имеет тип 'date', что в JS является string
  const mockUser: User = {
    id: 'er5e45f7-e85l-1em2-e356-42661415e0b4',
    name: 'Test',
    email: 'test@example.com',
    password: 'hashed_password',
    about: 'Test about',
    birthdate: '2012-12-12',
    city: 'Moscow',
    gender: UserGender.OTHER,
    avatar: 'avatar.png',
    skills: [],
    sentRequests: [],
    receivedRequests: [],
    favoriteSkills: [],
    role: UserRole.USER,
    refreshToken: null,
  };

  // Моковые данные DTO для создания пользователя
  const mockCreateUserDto: CreateUserDto = {
    name: 'New User',
    email: 'new@example.com',
    password: 'new_password',
  };

  // Моковые данные созданного пользователя
  const mockCreatedUser: User = {
    ...mockUser,
    id: 'new-id-123',
    name: mockCreateUserDto.name,
    email: mockCreateUserDto.email,
    password: mockCreateUserDto.password,
  };

  const mockSkill: Skill = {
    id: 'skill-123',
    title: 'NestJS',
    description: 'Framework',
    images: null,
    category: null,
    owner: mockUser,
    offeredInRequests: [],
    requestedInRequests: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Skill),
          useValue: mockSkillRepository,
        },
        {
          provide: appConfig.KEY,
          useValue: mockAppConfig,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('должен быть определен', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('должен возвращать пользователя по ID, если он найден', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(mockUser.id);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(result).toEqual(mockUser);
    });

    it('должен выбрасывать EntityNotFoundException, если пользователь не найден', async () => {
      // Специально возвращаем null, чтобы спровоцировать ошибку
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('unknown-id')).rejects.toThrow(
        EntityNotFoundException,
      );
    });
  });

  describe('create', () => {
    it('должен создавать нового пользователя', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.create.mockReturnValue(mockCreatedUser);
      mockUserRepository.save.mockResolvedValue(mockCreatedUser);

      const result = await service.create(mockCreateUserDto);

      expect(mockUserRepository.create).toHaveBeenCalledWith(mockCreateUserDto);
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockCreatedUser);
      expect(result).toEqual(mockCreatedUser);
    });

    it('должен выбрасывать ConflictException при дублировании email', async () => {
      // Имитируем ошибку дублирования email (код 23505)
      mockUserRepository.create.mockReturnValue(mockCreatedUser);

      // Создаем реальную ошибку QueryFailedError, чтобы сработал instanceof в сервисе
      const queryError = new QueryFailedError(
        'postgres',
        'query',
        new Error('duplicate') as any,
      );
      (queryError as any).driverError = { code: '23505' };
      mockUserRepository.save.mockRejectedValue(queryError);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('должен возвращать массив пользователей', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.find.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(mockUserRepository.find).toHaveBeenCalled();
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findByEmail', () => {
    it('должен возвращать пользователя по email', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail(mockUser.email);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: mockUser.email },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateProfile', () => {
    it('должен обновлять профиль пользователя', async () => {
      // Наполняем репозиторий моковыми данными
      const updateProfileDto: UpdateProfileDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, ...updateProfileDto };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(mockUser.id, updateProfileDto);

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateProfileDto),
      );
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('changePassword', () => {
    it('должен успешно изменять пароль', async () => {
      // Наполняем репозиторий моковыми данными
      const changePasswordDto: ChangePasswordDto = {
        oldPassword: 'old_password',
        newPassword: 'new_password',
      };

      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        password: 'hashed',
      });
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedBcrypt.hash.mockResolvedValue('newHashed');
      mockUserRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.changePassword(
        mockUser.id,
        changePasswordDto,
      );

      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        'old_password',
        'hashed',
      );
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(
        'new_password',
        mockAppConfig.hashSalt,
      );
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        password: 'newHashed',
      });
      expect(result).toEqual({ message: 'Пароль успешно изменён' });
    });

    it('должен выбрасывать UnauthorizedException при неверном старом пароле', async () => {
      // Специально возвращаем false для сравнения паролей, чтобы спровоцировать ошибку
      const changePasswordDto: ChangePasswordDto = {
        oldPassword: 'wrong_password',
        newPassword: 'new_password',
      };

      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        password: 'hashed',
      });
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(
        service.changePassword(mockUser.id, changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('update', () => {
    it('должен обновлять данные пользователя', async () => {
      // Наполняем репозиторий моковыми данными
      const updateData = { city: 'New City' };
      const updatedUser = { ...mockUser, ...updateData };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.update(mockUser.id, updateData);

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateData),
      );
      expect(result.city).toBe('New City');
    });
  });

  describe('remove', () => {
    it('должен удалять пользователя', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.remove(mockUser.id);

      expect(mockUserRepository.delete).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('Refresh Token', () => {
    it('должен обновлять refresh токен', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.updateRefreshToken(mockUser.id, 'new-token');

      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        refreshToken: 'new-token',
      });
    });

    it('должен удалять refresh токен', async () => {
      // Наполняем репозиторий моковыми данными
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.removeRefreshToken(mockUser.id);

      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        refreshToken: null,
      });
    });
  });

  describe('addFavoriteSkill', () => {
    it('должен добавлять навык в избранное', async () => {
      // Наполняем репозиторий моковыми данными
      const userWithSkills = { ...mockUser, favoriteSkills: [] };
      mockUserRepository.findOne.mockResolvedValue(userWithSkills);
      mockSkillRepository.findOne.mockResolvedValue(mockSkill);
      mockUserRepository.save.mockResolvedValue({
        ...userWithSkills,
        favoriteSkills: [mockSkill],
      });

      const result = await service.addFavoriteSkill(mockUser.id, mockSkill.id);

      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(result.favoriteSkills).toContainEqual(mockSkill);
    });

    it('должен выбрасывать BadRequestException, если навык уже в избранном', async () => {
      // Специально добавляем навык в избранное, чтобы спровоцировать ошибку
      const userWithSkills = { ...mockUser, favoriteSkills: [mockSkill] };
      mockUserRepository.findOne.mockResolvedValue(userWithSkills);
      mockSkillRepository.findOne.mockResolvedValue(mockSkill);

      await expect(
        service.addFavoriteSkill(mockUser.id, mockSkill.id),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
