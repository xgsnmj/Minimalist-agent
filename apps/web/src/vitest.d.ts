declare module "@vitest/expect" {
  interface Assertion<T = any> {
    toBeDisabled(): void;
    toBeInTheDocument(): void;
    toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): void;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace?: boolean }): void;
  }
}

export {};

declare module "vitest" {
  interface Assertion<T = any> {
    toBeDisabled(): void;
    toBeInTheDocument(): void;
    toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): void;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace?: boolean }): void;
  }
}
