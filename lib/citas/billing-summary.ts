import {
  resolveSerializedAppliedValue,
  type SerializedAppliedValueInput,
} from "./applied-value";

export type CitasBillingSummary = {
  total: string;
  citas: number;
  sinValor: number;
};

/** Aggregate recorded appointment values in cents without float rounding. */
export function aggregateCitasBillingSummary(
  appointments: readonly SerializedAppliedValueInput[],
): CitasBillingSummary {
  let totalCents = 0n;
  let sinValor = 0;

  for (const appointment of appointments) {
    try {
      const amount = resolveSerializedAppliedValue(appointment);
      if (amount === null) {
        sinValor += 1;
        continue;
      }
      const [whole, fraction] = amount.split(".");
      totalCents += BigInt(whole) * 100n + BigInt(fraction);
    } catch {
      sinValor += 1;
    }
  }

  return {
    total: `${totalCents / 100n}.${(totalCents % 100n).toString().padStart(2, "0")}`,
    citas: appointments.length,
    sinValor,
  };
}
