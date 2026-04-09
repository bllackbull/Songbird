export function ensureValidVapidKeys({ projectRootDir, fs, path, webpush }) {
  const envPath = path.join(projectRootDir, ".env");
  const subject = String(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  ).trim();
  let publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  let privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();

  const updateEnvValue = (targetPath, key, value) => {
    const safeValue = String(value ?? "");
    let contents = "";
    try {
      contents = fs.existsSync(targetPath)
        ? fs.readFileSync(targetPath, "utf8")
        : "";
    } catch (_) {
      contents = "";
    }
    const lines = contents ? contents.split(/\r?\n/) : [];
    let found = false;
    const updated = lines.map((line) => {
      if (line.startsWith(`${key}=`)) {
        found = true;
        return `${key}=${safeValue}`;
      }
      return line;
    });
    if (!found) {
      updated.push(`${key}=${safeValue}`);
    }
    const next = updated.filter(
      (line, idx, arr) => line.length > 0 || idx < arr.length - 1,
    );
    fs.writeFileSync(targetPath, `${next.join("\n")}\n`);
  };

  const decodeBase64Url = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    try {
      return Buffer.from(raw, "base64url");
    } catch {
      try {
        const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(padded, "base64");
      } catch {
        return null;
      }
    }
  };

  const isValidVapidPublicKey = (value) => {
    const decoded = decodeBase64Url(value);
    return decoded && decoded.length === 65;
  };

  const isValidVapidPrivateKey = (value) => {
    const decoded = decodeBase64Url(value);
    return decoded && decoded.length === 32;
  };

  const tryValidate = () => {
    if (!publicKey || !privateKey) return false;
    if (
      !isValidVapidPublicKey(publicKey) ||
      !isValidVapidPrivateKey(privateKey)
    ) {
      return false;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      return true;
    } catch (_) {
      return false;
    }
  };

  if (tryValidate()) {
    return { publicKey, privateKey, subject };
  }

  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  try {
    updateEnvValue(envPath, "VAPID_PUBLIC_KEY", publicKey);
    updateEnvValue(envPath, "VAPID_PRIVATE_KEY", privateKey);
    if (!String(process.env.VAPID_SUBJECT || "").trim()) {
      updateEnvValue(envPath, "VAPID_SUBJECT", subject);
    }
  } catch (error) {
    console.warn(
      "[push] Unable to update .env with regenerated VAPID keys:",
      String(error?.message || error),
    );
  }
  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_SUBJECT = subject;
  return { publicKey, privateKey, subject };
}
