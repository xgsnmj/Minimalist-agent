declare module "@vitest/expect" {
  interface Assertion<T = any> {
    toBeDisabled(): void;
    toBeInTheDocument(): void;
    toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): void;
  }
}

export {};

declare module "vitest" {
  interface Assertion<T = any> {
    toBeDisabled(): void;
    toBeInTheDocument(): void;
    toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): void;
  }
}
