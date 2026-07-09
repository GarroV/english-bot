import { describe, it, expect } from "vitest";
import { splitBlanks, countBlanks } from "../inline";

describe("splitBlanks", () => {
  it("режет текст по пропускам и нумерует их насквозь", () => {
    const parts = splitBlanks("Ответ: _____\nОбоснование: ____ конец");
    expect(parts).toEqual([
      { type: "text", value: "Ответ: " },
      { type: "blank", idx: 0 },
      { type: "text", value: "\nОбоснование: " },
      { type: "blank", idx: 1 },
      { type: "text", value: " конец" },
    ]);
  });

  it("двойное подчёркивание — не пропуск, 3+ — пропуск", () => {
    expect(countBlanks("a __ b")).toBe(0);
    expect(countBlanks("a ___ b ________ c")).toBe(2);
  });

  it("без пропусков возвращает один текстовый кусок", () => {
    expect(splitBlanks("просто текст")).toEqual([{ type: "text", value: "просто текст" }]);
    expect(countBlanks("просто текст")).toBe(0);
  });

  it("пропуск в начале и в конце", () => {
    const parts = splitBlanks("___ середина ___");
    expect(parts[0]).toEqual({ type: "blank", idx: 0 });
    expect(parts[2]).toEqual({ type: "blank", idx: 1 });
  });
});
