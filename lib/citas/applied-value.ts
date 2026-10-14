const DECIMAL_AMOUNT_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const CENTS_SCALE = 100n;

type DecimalLike = Readonly<{ toString(): string }>;

export type SerializedMoneyInput = string | number | DecimalLike;

type SerializedPackageSnapshot = Readonly<{
  totalPrice: SerializedMoneyInput;
  sessions: number;
}>;

export type SerializedAppliedValueInput = Readonly<{
  valorAplicado: SerializedMoneyInput | null | undefined;
  packageSnapshot: SerializedPackageSnapshot | null | undefined;
  legacyValue: SerializedMoneyInput | null | undefined;
}>;

const toAmountString = (value: SerializedMoneyInput): string => {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError("El valor monetario debe ser finito y no negativo");
    }

    return value.toFixed(2);
  }

  return value.toString().trim();
};

const toCents = (value: SerializedMoneyInput): bigint => {
  const match = DECIMAL_AMOUNT_PATTERN.exec(toAmountString(value));
  if (!match) {
    throw new TypeError("El valor monetario debe ser un decimal no negativo");
  }

  const [, whole, fraction = ""] = match;
  const centsDigits = `${fraction}00`.slice(0, 2);
  let cents = BigInt(whole) * CENTS_SCALE + BigInt(centsDigits);

  if (fraction.length > 2 && fraction[2] >= "5") {
    cents += 1n;
  }

  return cents;
};

const serializeCents = (cents: bigint): string => {
  const whole = cents / CENTS_SCALE;
  const fraction = (cents % CENTS_SCALE).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
};

export const normalizeSerializedMoney = (value: SerializedMoneyInput): string =>
  serializeCents(toCents(value));

export const calculateSerializedPackageUnitPrice = (
  totalPrice: SerializedMoneyInput,
  sessions: number,
): string => {
  if (!Number.isSafeInteger(sessions) || sessions <= 0) {
    throw new TypeError("Las sesiones deben ser un entero mayor que cero");
  }

  const totalCents = toCents(totalPrice);
  const divisor = BigInt(sessions);
  const quotient = totalCents / divisor;
  const remainder = totalCents % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

  return serializeCents(rounded);
};

export const calculateSerializedTimeBlockPrice = ({
  ratePerBlock,
  minutesPerBlock,
  startMinute,
  endMinute,
}: Readonly<{
  ratePerBlock: SerializedMoneyInput;
  minutesPerBlock: number;
  startMinute: number;
  endMinute: number;
}>): Readonly<{
  durationMinutes: number;
  blocks: number;
  ratePerBlock: string;
  minutesPerBlock: number;
  totalPrice: string;
}> => {
  if (!Number.isSafeInteger(minutesPerBlock) || minutesPerBlock <= 0) {
    throw new TypeError("Los minutos por bloque deben ser un entero mayor que cero");
  }
  if (
    !Number.isSafeInteger(startMinute) ||
    !Number.isSafeInteger(endMinute) ||
    startMinute < 0 ||
    endMinute > 24 * 60 ||
    endMinute <= startMinute
  ) {
    throw new TypeError("El horario debe tener una duración positiva en el mismo día");
  }

  const durationMinutes = endMinute - startMinute;
  const blocks = Math.ceil(durationMinutes / minutesPerBlock);
  const rate = toCents(ratePerBlock);

  return {
    durationMinutes,
    blocks,
    ratePerBlock: serializeCents(rate),
    minutesPerBlock,
    totalPrice: serializeCents(rate * BigInt(blocks)),
  };
};

export const resolveSerializedAppliedValue = ({
  valorAplicado,
  packageSnapshot,
  legacyValue,
}: SerializedAppliedValueInput): string | null => {
  if (valorAplicado !== null && valorAplicado !== undefined) {
    return normalizeSerializedMoney(valorAplicado);
  }

  if (packageSnapshot) {
    if (!Number.isSafeInteger(packageSnapshot.sessions) || packageSnapshot.sessions <= 0) {
      return null;
    }

    return calculateSerializedPackageUnitPrice(
      packageSnapshot.totalPrice,
      packageSnapshot.sessions,
    );
  }

  if (legacyValue !== null && legacyValue !== undefined) {
    return normalizeSerializedMoney(legacyValue);
  }

  return null;
};
