// APP_DEBUG logs request/response bodies; secret-bearing admin routes must
// never leak credentials into the log stream.
const SECRET_KEY =
  /^(credential|apitoken|apihash|sessionstring|password|secret|token)$/i;

export function redactDebugSecrets(value) {
  if (!value || typeof value !== "object") return value;
  try {
    return JSON.parse(
      JSON.stringify(value, (key, val) =>
        SECRET_KEY.test(key) ? "[redacted]" : val,
      ),
    );
  } catch {
    return {};
  }
}
