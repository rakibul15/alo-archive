/**
 * Exhaustiveness guard. Put it in the `default` branch of a switch over a
 * discriminated union and the compiler will reject the switch the moment a new
 * member is added to the union.
 */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(
    `Unhandled ${context}: ${JSON.stringify(value satisfies never)}`,
  );
}
