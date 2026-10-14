import { describe, expect, it } from "vitest";
import { resolvePsychologyChatAccount } from "./chatwoot-account";

describe("cuenta de WhatsApp de Psicólogos", () => {
  const other = { id: 1, name: "Otra empresa" };
  const psychology = { id: 7, name: "Psicólogos en Colombia" };
  it("selecciona Psicólogos aunque otra empresa aparezca primero", () => {
    expect(resolvePsychologyChatAccount([other, psychology])).toEqual(psychology);
    expect(resolvePsychologyChatAccount([{ id: 2, name: "PSICOLOGOS" }])?.id).toBe(2);
  });
  it("no conserva otra empresa ni adivina una cuenta única", () => {
    expect(resolvePsychologyChatAccount([other])).toBeNull();
    expect(resolvePsychologyChatAccount([])).toBeNull();
  });
  it("una ambigüedad requiere una cuenta configurada", () => {
    const accounts = [psychology, { id: 9, name: "Psicologos" }];
    expect(resolvePsychologyChatAccount(accounts)).toBeNull();
    expect(resolvePsychologyChatAccount(accounts, "7")).toEqual(psychology);
  });
  it("rechaza una configuración inválida o ajena a los accesos actuales", () => {
    for (const id of ["0", "1.5", "abc", "99"]) expect(resolvePsychologyChatAccount([psychology], id)).toBeNull();
  });
});
