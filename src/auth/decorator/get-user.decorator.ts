import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: Record<string, any> }>();
    const user = request.user ?? null;
    if (!user) {
      return null;
    }
    if (data) {
      return user[data] as string;
    }
    return user;
  },
);
