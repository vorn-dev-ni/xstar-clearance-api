import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as accessible without a JWT (login/register/refresh). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
