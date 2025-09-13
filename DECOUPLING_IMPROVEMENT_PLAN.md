# Code Decoupling Improvement Plan

## Overview
This document outlines a comprehensive plan to decouple the bookmarks API codebase from specific implementations and improve maintainability, testability, and flexibility.

## Current Architecture Issues
- **Direct Prisma coupling**: All services directly depend on PrismaService
- **ORM-specific exceptions**: Business logic handles Prisma exceptions
- **Missing domain entities**: Services work with raw Prisma objects
- **No repository pattern**: Data access logic mixed with business logic
- **Missing service abstractions**: Direct dependencies on external libraries
- **Global Prisma module**: Creates unnecessary coupling across modules

**NOTE:** The file paths are illustrative only. Please implement them in line with DDD principles.

---

## Phase 1: Foundation Layer (Core Infrastructure)

### Task 1.1: Create Domain Entities
**Priority**: High | **Estimated Time**: 2-3 hours

**Description**: Create pure domain entities that represent business objects without ORM dependencies.

**Instructions**:
1. Create `src/entities/user.entity.ts`:
   ```typescript
   export class User {
     constructor(
       public readonly id: number,
       public readonly email: string,
       public readonly hash: string,
       public readonly firstName?: string,
       public readonly lastName?: string,
       public readonly createdAt: Date,
       public readonly updatedAt: Date,
     ) {}
     
     get fullName(): string {
       return `${this.firstName || ''} ${this.lastName || ''}`.trim();
     }
   }
   ```

2. Create `src/entities/bookmark.entity.ts`:
   ```typescript
   export class Bookmark {
     constructor(
       public readonly id: number,
       public readonly title: string,
       public readonly description?: string,
       public readonly link: string,
       public readonly userId: number,
       public readonly createdAt: Date,
       public readonly updatedAt: Date,
     ) {}
     
     isValidUrl(): boolean {
       try {
         new URL(this.link);
         return true;
       } catch {
         return false;
       }
     }
   }
   ```

3. Create `src/entities/index.ts` to export all entities

### Task 1.2: Create Domain Exceptions
**Priority**: High | **Estimated Time**: 1 hour

**Description**: Define domain-specific exceptions to replace ORM-specific error handling.

**Instructions**:
1. Create `src/exceptions/domain.exceptions.ts`:
   ```typescript
   export class DuplicateEmailException extends Error {
     constructor(email: string) {
       super(`Email ${email} is already taken`);
       this.name = 'DuplicateEmailException';
     }
   }
   
   export class UserNotFoundException extends Error {
     constructor(identifier: string | number) {
       super(`User not found: ${identifier}`);
       this.name = 'UserNotFoundException';
     }
   }
   
   export class BookmarkNotFoundException extends Error {
     constructor(id: number) {
       super(`Bookmark not found: ${id}`);
       this.name = 'BookmarkNotFoundException';
     }
   }
   
   export class UnauthorizedBookmarkAccessException extends Error {
     constructor(userId: number, bookmarkId: number) {
       super(`User ${userId} is not authorized to access bookmark ${bookmarkId}`);
       this.name = 'UnauthorizedBookmarkAccessException';
     }
   }
   ```

### Task 1.3: Create Repository Interfaces
**Priority**: High | **Estimated Time**: 2 hours

**Description**: Define contracts for data access that business logic will depend on.

**Instructions**:
1. Create `src/repositories/user.repository.interface.ts`:
   ```typescript
   import { User } from '../entities/user.entity';
   import { DuplicateEmailException } from '../exceptions/domain.exceptions';
   
   export interface IUserRepository {
     create(email: string, hash: string): Promise<User>;
     findByEmail(email: string): Promise<User | null>;
     findById(id: number): Promise<User | null>;
     update(id: number, data: Partial<Pick<User, 'firstName' | 'lastName' | 'email'>>): Promise<User>;
     delete(id: number): Promise<void>;
   }
   ```

2. Create `src/repositories/bookmark.repository.interface.ts`:
   ```typescript
   import { Bookmark } from '../entities/bookmark.entity';
   import { BookmarkNotFoundException, UnauthorizedBookmarkAccessException } from '../exceptions/domain.exceptions';
   
   export interface IBookmarkRepository {
     findByUserId(userId: number): Promise<Bookmark[]>;
     findById(id: number): Promise<Bookmark | null>;
     findByIdAndUserId(id: number, userId: number): Promise<Bookmark | null>;
     create(userId: number, title: string, description?: string, link: string): Promise<Bookmark>;
     update(id: number, userId: number, data: Partial<Pick<Bookmark, 'title' | 'description' | 'link'>>): Promise<Bookmark>;
     delete(id: number, userId: number): Promise<void>;
   }
   ```

---

## Phase 2: Data Access Layer (Repository Implementation)

### Task 2.1: Implement User Repository
**Priority**: High | **Estimated Time**: 3 hours

**Description**: Create Prisma-based implementation of user repository with proper exception translation.

**Instructions**:
1. Create `src/repositories/prisma/user.repository.ts`:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { PrismaService } from '../prisma/prisma.service';
   import { IUserRepository } from './user.repository.interface';
   import { User } from '../entities/user.entity';
   import { DuplicateEmailException } from '../exceptions/domain.exceptions';
   import { PrismaClientKnownRequestError } from 'generated/prisma/runtime/library';
   
   @Injectable()
   export class PrismaUserRepository implements IUserRepository {
     constructor(private prisma: PrismaService) {}
   
     async create(email: string, hash: string): Promise<User> {
       try {
         const prismaUser = await this.prisma.user.create({
           data: { email, hash },
         });
         return this.toEntity(prismaUser);
       } catch (error) {
         if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
           throw new DuplicateEmailException(email);
         }
         throw error;
       }
     }
   
     // Implement other methods with similar pattern
     private toEntity(prismaUser: any): User {
       return new User(
         prismaUser.id,
         prismaUser.email,
         prismaUser.hash,
         prismaUser.firstName,
         prismaUser.lastName,
         prismaUser.createdAt,
         prismaUser.updatedAt,
       );
     }
   }
   ```

### Task 2.2: Implement Bookmark Repository
**Priority**: High | **Estimated Time**: 3 hours

**Description**: Create Prisma-based implementation of bookmark repository with proper exception translation.

**Instructions**:
1. Create `src/repositories/prisma/bookmark.repository.ts`:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { PrismaService } from '../prisma/prisma.service';
   import { IBookmarkRepository } from './bookmark.repository.interface';
   import { Bookmark } from '../entities/bookmark.entity';
   import { BookmarkNotFoundException, UnauthorizedBookmarkAccessException } from '../exceptions/domain.exceptions';
   
   @Injectable()
   export class PrismaBookmarkRepository implements IBookmarkRepository {
     constructor(private prisma: PrismaService) {}
   
     async findByIdAndUserId(id: number, userId: number): Promise<Bookmark | null> {
       const prismaBookmark = await this.prisma.bookmark.findFirst({
         where: { id, userId },
       });
       return prismaBookmark ? this.toEntity(prismaBookmark) : null;
     }
   
     async delete(id: number, userId: number): Promise<void> {
       const bookmark = await this.findByIdAndUserId(id, userId);
       if (!bookmark) {
         throw new UnauthorizedBookmarkAccessException(userId, id);
       }
       
       await this.prisma.bookmark.delete({
         where: { id },
       });
     }
   
     // Implement other methods
     private toEntity(prismaBookmark: any): Bookmark {
       return new Bookmark(
         prismaBookmark.id,
         prismaBookmark.title,
         prismaBookmark.description,
         prismaBookmark.link,
         prismaBookmark.userId,
         prismaBookmark.createdAt,
         prismaBookmark.updatedAt,
       );
     }
   }
   ```

---

## Phase 3: Service Abstractions Layer

### Task 3.1: Create Password Hashing Service
**Priority**: Medium | **Estimated Time**: 1 hour

**Description**: Abstract password hashing to allow swapping implementations.

**Instructions**:
1. Create `src/services/password-hashing.service.interface.ts`:
   ```typescript
   export interface IPasswordHashingService {
     hash(password: string): Promise<string>;
     verify(hash: string, password: string): Promise<boolean>;
   }
   ```

2. Create `src/services/password-hashing.service.ts`:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { IPasswordHashingService } from './password-hashing.service.interface';
   import * as argon from 'argon2';
   
   @Injectable()
   export class ArgonPasswordHashingService implements IPasswordHashingService {
     async hash(password: string): Promise<string> {
       return argon.hash(password);
     }
   
     async verify(hash: string, password: string): Promise<boolean> {
       return argon.verify(hash, password);
     }
   }
   ```

### Task 3.2: Create Token Service
**Priority**: Medium | **Estimated Time**: 2 hours

**Description**: Abstract JWT token generation and validation.

**Instructions**:
1. Create `src/services/token.service.interface.ts`:
   ```typescript
   export interface ITokenService {
     generateAccessToken(userId: number, email: string): Promise<string>;
     generateRefreshToken(userId: number, email: string): Promise<string>;
     verifyToken(token: string): Promise<{ userId: number; email: string }>;
     extractTokenFromHeader(authHeader: string): string | null;
   }
   ```

2. Create `src/services/token.service.ts`:
   ```typescript
   import { Injectable, UnauthorizedException } from '@nestjs/common';
   import { JwtService } from '@nestjs/jwt';
   import { ConfigService } from '@nestjs/config';
   import { ITokenService } from './token.service.interface';
   
   @Injectable()
   export class JwtTokenService implements ITokenService {
     constructor(
       private jwt: JwtService,
       private config: ConfigService,
     ) {}
   
     async generateAccessToken(userId: number, email: string): Promise<string> {
       const payload = { sub: userId, email };
       return this.jwt.signAsync(payload, {
         expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
         secret: this.config.get('JWT_ACCESS_SECRET'),
       });
     }
   
     // Implement other methods
   }
   ```

### Task 3.3: Create Validation Service
**Priority**: Medium | **Estimated Time**: 2 hours

**Description**: Centralize validation logic with business rules.

**Instructions**:
1. Create `src/services/validation.service.interface.ts`:
   ```typescript
   import { AuthDto } from '../auth/dto/auth.dto';
   import { CreateBookmarkDto } from '../bookmark/dto/create-bookmark.dto';
   import { EditUserDto } from '../user/dto/edit-user.dto';
   
   export interface IValidationService {
     validateEmail(email: string): boolean;
     validatePassword(password: string): { isValid: boolean; errors: string[] };
     validateUrl(url: string): boolean;
     validateSignupData(dto: AuthDto): Promise<void>;
     validateBookmarkData(dto: CreateBookmarkDto): Promise<void>;
     validateUserUpdateData(dto: EditUserDto): Promise<void>;
   }
   ```

2. Implement validation logic with business rules (password strength, URL format, etc.)

### Task 3.4: Create Event Service
**Priority**: Low | **Estimated Time**: 1 hour

**Description**: Abstract event publishing for extensibility.

**Instructions**:
1. Create `src/services/event.service.interface.ts`:
   ```typescript
   export interface IEventService {
     publish(event: string, data: any): Promise<void>;
     subscribe(event: string, handler: Function): void;
   }
   ```

2. Create basic implementation for logging/analytics

---

## Phase 4: Business Logic Refactoring

### Task 4.1: Refactor AuthService
**Priority**: High | **Estimated Time**: 3 hours

**Description**: Remove Prisma dependencies and use repository pattern.

**Instructions**:
1. Update `src/auth/auth.service.ts`:
   ```typescript
   import { Injectable, ForbiddenException } from '@nestjs/common';
   import { IUserRepository } from '../repositories/user.repository.interface';
   import { IPasswordHashingService } from '../services/password-hashing.service.interface';
   import { ITokenService } from '../services/token.service.interface';
   import { IValidationService } from '../services/validation.service.interface';
   import { AuthDto } from './dto';
   import { DuplicateEmailException } from '../exceptions/domain.exceptions';
   
   @Injectable()
   export class AuthService {
     constructor(
       private userRepository: IUserRepository,
       private passwordHashing: IPasswordHashingService,
       private tokenService: ITokenService,
       private validationService: IValidationService,
     ) {}
   
     async signup(dto: AuthDto) {
       await this.validationService.validateSignupData(dto);
       const hash = await this.passwordHashing.hash(dto.password);
       
       try {
         const user = await this.userRepository.create(dto.email, hash);
         const accessToken = await this.tokenService.generateAccessToken(user.id, user.email);
         return { access_token: accessToken };
       } catch (error) {
         if (error instanceof DuplicateEmailException) {
           throw new ForbiddenException(error.message);
         }
         throw error;
       }
     }
   
     async signin(dto: AuthDto) {
       const user = await this.userRepository.findByEmail(dto.email);
       if (!user) {
         throw new ForbiddenException('Credentials incorrect');
       }
       
       const pwMatches = await this.passwordHashing.verify(user.hash, dto.password);
       if (!pwMatches) {
         throw new ForbiddenException('Credentials incorrect');
       }
       
       const accessToken = await this.tokenService.generateAccessToken(user.id, user.email);
       return { access_token: accessToken };
     }
   }
   ```

### Task 4.2: Refactor UserService
**Priority**: High | **Estimated Time**: 2 hours

**Description**: Remove Prisma dependencies and use repository pattern.

**Instructions**:
1. Update `src/user/user.service.ts`:
   ```typescript
   import { Injectable, NotFoundException } from '@nestjs/common';
   import { IUserRepository } from '../repositories/user.repository.interface';
   import { IValidationService } from '../services/validation.service.interface';
   import { EditUserDto } from './dto';
   import { User } from '../entities/user.entity';
   
   @Injectable()
   export class UserService {
     constructor(
       private userRepository: IUserRepository,
       private validationService: IValidationService,
     ) {}
   
     async editUser(userId: number, dto: EditUserDto): Promise<User> {
       await this.validationService.validateUserUpdateData(dto);
       
       const user = await this.userRepository.findById(userId);
       if (!user) {
         throw new NotFoundException('User not found');
       }
       
       return this.userRepository.update(userId, dto);
     }
   
     async getUserById(userId: number): Promise<User> {
       const user = await this.userRepository.findById(userId);
       if (!user) {
         throw new NotFoundException('User not found');
       }
       return user;
     }
   }
   ```

### Task 4.3: Refactor BookmarkService
**Priority**: High | **Estimated Time**: 3 hours

**Description**: Remove Prisma dependencies and use repository pattern.

**Instructions**:
1. Update `src/bookmark/bookmark.service.ts`:
   ```typescript
   import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
   import { IBookmarkRepository } from '../repositories/bookmark.repository.interface';
   import { IValidationService } from '../services/validation.service.interface';
   import { CreateBookmarkDto, EditBookmarkDto } from './dto';
   import { Bookmark } from '../entities/bookmark.entity';
   import { BookmarkNotFoundException, UnauthorizedBookmarkAccessException } from '../exceptions/domain.exceptions';
   
   @Injectable()
   export class BookmarkService {
     constructor(
       private bookmarkRepository: IBookmarkRepository,
       private validationService: IValidationService,
     ) {}
   
     async getBookmarks(userId: number): Promise<Bookmark[]> {
       return this.bookmarkRepository.findByUserId(userId);
     }
   
     async getBookmarkById(userId: number, bookmarkId: number): Promise<Bookmark> {
       const bookmark = await this.bookmarkRepository.findByIdAndUserId(bookmarkId, userId);
       if (!bookmark) {
         throw new NotFoundException('Bookmark not found');
       }
       return bookmark;
     }
   
     async createBookmark(userId: number, dto: CreateBookmarkDto): Promise<Bookmark> {
       await this.validationService.validateBookmarkData(dto);
       return this.bookmarkRepository.create(userId, dto.title, dto.description, dto.link);
     }
   
     async editBookmarkById(userId: number, bookmarkId: number, dto: EditBookmarkDto): Promise<Bookmark> {
       await this.validationService.validateBookmarkData(dto);
       
       try {
         return this.bookmarkRepository.update(bookmarkId, userId, dto);
       } catch (error) {
         if (error instanceof UnauthorizedBookmarkAccessException) {
           throw new ForbiddenException(error.message);
         }
         throw error;
       }
     }
   
     async deleteBookmarkById(userId: number, bookmarkId: number): Promise<void> {
       try {
         await this.bookmarkRepository.delete(bookmarkId, userId);
       } catch (error) {
         if (error instanceof UnauthorizedBookmarkAccessException) {
           throw new ForbiddenException(error.message);
         }
         throw error;
       }
     }
   }
   ```

---

## Phase 5: Module Configuration & Dependency Injection

### Task 5.1: Update AuthModule
**Priority**: High | **Estimated Time**: 1 hour

**Description**: Configure dependency injection for all auth-related services.

**Instructions**:
1. Update `src/auth/auth.module.ts`:
   ```typescript
   import { Module } from '@nestjs/common';
   import { AuthController } from './auth.controller';
   import { AuthService } from './auth.service';
   import { JwtModule } from '@nestjs/jwt';
   import { PassportModule } from '@nestjs/passport';
   import { JwtStrategy } from './strategy/jwt.strategy';
   import { PrismaModule } from '../prisma/prisma.module';
   import { IUserRepository } from '../repositories/user.repository.interface';
   import { PrismaUserRepository } from '../repositories/prisma/user.repository';
   import { IPasswordHashingService } from '../services/password-hashing.service.interface';
   import { ArgonPasswordHashingService } from '../services/password-hashing.service';
   import { ITokenService } from '../services/token.service.interface';
   import { JwtTokenService } from '../services/token.service';
   import { IValidationService } from '../services/validation.service.interface';
   import { AuthValidationService } from '../services/validation.service';
   
   @Module({
     imports: [JwtModule.register({}), PassportModule, PrismaModule],
     controllers: [AuthController],
     providers: [
       AuthService,
       JwtStrategy,
       {
         provide: IUserRepository,
         useClass: PrismaUserRepository,
       },
       {
         provide: IPasswordHashingService,
         useClass: ArgonPasswordHashingService,
       },
       {
         provide: ITokenService,
         useClass: JwtTokenService,
       },
       {
         provide: IValidationService,
         useClass: AuthValidationService,
       },
     ],
   })
   export class AuthModule {}
   ```

### Task 5.2: Update UserModule
**Priority**: High | **Estimated Time**: 1 hour

**Description**: Configure dependency injection for user-related services.

**Instructions**:
1. Update `src/user/user.module.ts` with similar pattern as AuthModule
2. Import PrismaModule and configure IUserRepository and IValidationService

### Task 5.3: Update BookmarkModule
**Priority**: High | **Estimated Time**: 1 hour

**Description**: Configure dependency injection for bookmark-related services.

**Instructions**:
1. Update `src/bookmark/bookmark.module.ts` with similar pattern
2. Configure IBookmarkRepository and IValidationService

### Task 5.4: Remove Global Prisma Module
**Priority**: Medium | **Estimated Time**: 30 minutes

**Description**: Remove global Prisma module to reduce coupling.

**Instructions**:
1. Remove `@Global()` decorator from `src/prisma/prisma.module.ts`
2. Import PrismaModule only where needed in each module

---

## Phase 6: Testing Infrastructure

### Task 6.1: Create Repository Tests
**Priority**: Medium | **Estimated Time**: 4 hours

**Description**: Create unit tests for repository implementations.

**Instructions**:
1. Create `src/repositories/prisma/user.repository.spec.ts`
2. Create `src/repositories/prisma/bookmark.repository.spec.ts`
3. Test all methods with mocked PrismaService
4. Test exception translation

### Task 6.2: Create Service Tests
**Priority**: High | **Estimated Time**: 6 hours

**Description**: Create comprehensive unit tests for all services.

**Instructions**:
1. Create `src/auth/auth.service.spec.ts`
2. Create `src/user/user.service.spec.ts`
3. Create `src/bookmark/bookmark.service.spec.ts`
4. Mock all dependencies (repositories, services)
5. Test all business logic scenarios

### Task 6.3: Create Integration Tests
**Priority**: Medium | **Estimated Time**: 3 hours

**Description**: Create end-to-end tests for complete flows.

**Instructions**:
1. Update `test/auth.e2e-spec.ts`
2. Create `test/bookmark.e2e-spec.ts`
3. Create `test/user.e2e-spec.ts`
4. Test complete flows with real database

---

## Phase 7: Advanced Features (Optional)

### Task 7.1: Add Caching Layer
**Priority**: Low | **Estimated Time**: 3 hours

**Description**: Add caching abstraction for frequently accessed data.

**Instructions**:
1. Create `src/services/cache.service.interface.ts`
2. Implement Redis or in-memory cache
3. Add caching to user and bookmark repositories

### Task 7.2: Add Rate Limiting
**Priority**: Medium | **Estimated Time**: 2 hours

**Description**: Implement rate limiting for authentication endpoints.

**Instructions**:
1. Create `src/services/rate-limiting.service.interface.ts`
2. Implement rate limiting logic
3. Integrate with AuthService

### Task 7.3: Add Audit Logging
**Priority**: Low | **Estimated Time**: 2 hours

**Description**: Add comprehensive audit logging.

**Instructions**:
1. Create `src/services/audit.service.interface.ts`
2. Log all authentication attempts
3. Log all CRUD operations

---

## Implementation Priority

### Critical Path (Must Complete First):
1. Tasks 1.1-1.3 (Foundation Layer)
2. Tasks 2.1-2.2 (Repository Implementation)
3. Tasks 4.1-4.3 (Service Refactoring)
4. Tasks 5.1-5.3 (Module Configuration)

### Secondary Priority:
5. Task 6.2 (Service Tests)
6. Task 6.1 (Repository Tests)
7. Task 5.4 (Remove Global Module)

### Optional Enhancements:
8. Tasks 3.1-3.4 (Service Abstractions)
9. Tasks 6.3, 7.1-7.3 (Advanced Features)

## Estimated Total Time: 35-45 hours

## Benefits After Completion:
- ✅ Complete decoupling from Prisma ORM
- ✅ Easy unit testing with mocked dependencies
- ✅ Swappable implementations (different ORMs, hashing algorithms, etc.)
- ✅ Clear separation of concerns
- ✅ Domain-driven design principles
- ✅ Maintainable and extensible codebase
- ✅ Better error handling with domain exceptions
- ✅ Improved security with validation and rate limiting
