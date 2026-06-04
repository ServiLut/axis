import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function serializeData(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === "bigint") return Number(obj);
  
  if (obj instanceof Date) return obj.toISOString();
  
  if (Array.isArray(obj)) {
    return obj.map(serializeData);
  }
  
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    // Handle objects that look like Decimals (e.g. Prisma Decimals)
    if (
      (record.constructor && record.constructor.name === 'Decimal') ||
      ('s' in record && 'e' in record && 'd' in record && 'toFixed' in record) ||
      (typeof record.toFixed === 'function' && typeof record.toNumber === 'function')
    ) {
        return Number(obj);
    }

    const newObj: Record<string, unknown> = {};
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        newObj[key] = serializeData(record[key]);
      }
    }
    return newObj;
  }
  
  return obj;
}
