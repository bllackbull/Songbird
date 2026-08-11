import { isValidUuid } from "./uuidUtils.js";

/**
 * Creates Express middleware that validates route params as UUIDs.
 * Rejects on the first invalid parameter with HTTP 400.
 * @param {...string} paramNames - Route parameter names to validate
 */
export function validateUuidParams(...paramNames) {
  return (req, res, next) => {
    for (const param of paramNames) {
      const value = req.params[param];
      if (!value || !value.trim()) {
        return res.status(400).json({
          error: `Parameter '${param}' is required.`,
        });
      }
      if (!isValidUuid(value)) {
        return res.status(400).json({
          error: `Parameter '${param}' is not a valid UUID.`,
        });
      }
    }
    next();
  };
}

/**
 * Validates UUID fields in request body.
 * Supports required and optional fields. Skips undefined/null/empty optional fields.
 * @param {Array<{field: string, required: boolean}>} fields
 */
export function validateUuidBody(fields) {
  return (req, res, next) => {
    for (const { field, required } of fields) {
      const value = req.body?.[field];
      if (value === null || value === undefined || value === "") {
        if (required) {
          return res
            .status(400)
            .json({ error: `Field '${field}' is required.` });
        }
        continue;
      }
      if (typeof value === "string" && !value.trim()) {
        if (required) {
          return res
            .status(400)
            .json({ error: `Field '${field}' is required.` });
        }
        continue;
      }
      if (!isValidUuid(String(value))) {
        return res
          .status(400)
          .json({ error: `Field '${field}' is not a valid UUID.` });
      }
    }
    next();
  };
}
