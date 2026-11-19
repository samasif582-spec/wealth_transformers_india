import { HttpStatus } from '@nestjs/common';

interface MappedError {
  status: number;
  message: string;
  error: string;
}

export function mapPrismaError(error: Error): MappedError | null {
  const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };

  if (!prismaError.code?.startsWith('P')) {
    return null;
  }

  switch (prismaError.code) {
    case 'P2002': {
      const target = (prismaError.meta?.['target'] as string[])?.join(', ') ?? 'field';
      return {
        status: HttpStatus.CONFLICT,
        message: `A record with this ${target} already exists`,
        error: 'Conflict',
      };
    }

    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: (prismaError.meta?.['cause'] as string) ?? 'Record not found',
        error: 'Not Found',
      };

    case 'P2003': {
      const field = (prismaError.meta?.['field_name'] as string) ?? 'field';
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: `Foreign key constraint failed on field: ${field}`,
        error: 'Unprocessable Entity',
      };
    }

    case 'P2014':
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Relation constraint violation',
        error: 'Unprocessable Entity',
      };

    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database operation failed',
        error: 'Internal Server Error',
      };
  }
}
