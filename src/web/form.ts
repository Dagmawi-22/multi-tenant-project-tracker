import { BadRequestException } from '@nestjs/common';

export function requireText(value: unknown, field: string, maxLength = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';

  if (text.length < 2 || text.length > maxLength) {
    throw new BadRequestException(`${field} must be between 2 and ${maxLength} characters`);
  }

  return text;
}

export function optionalText(value: unknown, maxLength = 2000): string {
  const text = typeof value === 'string' ? value.trim() : '';

  if (text.length > maxLength) {
    throw new BadRequestException(`Description must be at most ${maxLength} characters`);
  }

  return text;
}

export function requireMoney(value: unknown, field: string): string {
  const text = typeof value === 'string' && value.trim() !== '' ? value.trim() : '0';

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new BadRequestException(`${field} must be a non-negative amount with at most two decimals`);
  }

  return text;
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
  }

  return value as T;
}

export function requireEmail(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw new BadRequestException('A valid email address is required');
  }

  return text;
}

export function optionalUuid(value: unknown, field: string): string | null {
  const text = typeof value === 'string' ? value.trim() : '';

  if (text === '') {
    return null;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new BadRequestException(`${field} is not valid`);
  }

  return text;
}
