import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { normalizeUuid, isValidUuid } from "../../src/utils/uuidUtils.js";

const UUID_V4_CANONICAL_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const whitespaceGen = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 0, maxLength: 5 })
  .map((arr) => arr.join(""));

describe("Property-based test: Client UUID Normalization (Property 8)", () => {
  test("Property 8: Client UUID Normalization Round-Trip", () => {
    // 1. Valid UUIDs with varying casing and surrounding whitespace normalize to canonical lowercase form
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(fc.boolean(), { minLength: 36, maxLength: 36 }),
        whitespaceGen,
        whitespaceGen,
        (uuid, mask, prefixPad, suffixPad) => {
          const cased = uuid
            .split("")
            .map((char, i) => (mask[i] ? char.toUpperCase() : char.toLowerCase()))
            .join("");
          const input = `${prefixPad}${cased}${suffixPad}`;

          const normalized = normalizeUuid(input);
          expect(normalized).not.toBeNull();
          expect(normalized).toBe(uuid.toLowerCase());
          expect(UUID_V4_CANONICAL_REGEX.test(normalized)).toBe(true);
          expect(isValidUuid(input)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );

    // 2. Arbitrary random strings that are not valid UUIDs return null
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          const trimmed = s.trim();
          return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            trimmed,
          );
        }),
        (invalidInput) => {
          expect(normalizeUuid(invalidInput)).toBeNull();
          expect(isValidUuid(invalidInput)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
