import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-database-url'),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMe', () => {
    it('should return the user', () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      const result = controller.getMe(mockUser as any);
      expect(result).toEqual(mockUser);
    });
  });

  describe('editUser', () => {
    it('should call userService.editUser with correct parameters', async () => {
      const userId = 1;
      const editUserDto = { email: 'newemail@example.com' };
      const mockUpdatedUser = { id: 1, email: 'newemail@example.com' };

      jest
        .spyOn(userService, 'editUser')
        .mockResolvedValue(mockUpdatedUser as any);

      const result = await controller.editUser(userId, editUserDto);

      expect(userService.editUser).toHaveBeenCalledWith(userId, editUserDto);
      expect(result).toEqual(mockUpdatedUser);
    });
  });
});
