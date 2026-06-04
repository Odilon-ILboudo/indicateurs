// api/src/modules/features/indicators/calculators/indicator-calculator.interface.ts
export interface IndicatorCalculator {
  calculate(userId: string, contextId: string): Promise<number>;
  getIndicatorCode(): string;
}