import { useCallback, useEffect, useState } from "react";
import { fetchAppInfo } from "../api/appMetaApi.js";

const WHATS_NEW_DISMISSED_VERSION_KEY = "songbird-whats-new-dismissed-version";

async function parseJsonResponse(response, fallbackMessage) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error || fallbackMessage);
  }
  return payload;
}

export function useAppReleaseInfo() {
  const [appInfo, setAppInfo] = useState(null);
  const [appInfoLoading, setAppInfoLoading] = useState(true);
  const [appInfoError, setAppInfoError] = useState("");
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  const loadAppInfo = useCallback(async () => {
    setAppInfoLoading(true);
    setAppInfoError("");
    try {
      const response = await fetchAppInfo();
      const payload = await parseJsonResponse(
        response,
        "Unable to load app information.",
      );
      setAppInfo(payload);
      const currentVersion = String(payload?.version || "").trim();
      const changelog = String(
        payload?.currentChangelog || payload?.changelog || "",
      ).trim();
      if (!currentVersion || !changelog) {
        setWhatsNewOpen(false);
        return payload;
      }
      const dismissedVersion = window.localStorage.getItem(
        WHATS_NEW_DISMISSED_VERSION_KEY,
      );
      setWhatsNewOpen(dismissedVersion !== currentVersion);
      return payload;
    } catch (error) {
      setAppInfoError(
        String(error?.message || "Unable to load app information."),
      );
      setWhatsNewOpen(false);
      return null;
    } finally {
      setAppInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppInfo();
  }, [loadAppInfo]);

  const dismissWhatsNew = useCallback(
    (remember = true) => {
      if (remember && appInfo?.version) {
        window.localStorage.setItem(
          WHATS_NEW_DISMISSED_VERSION_KEY,
          String(appInfo.version),
        );
      }
      setWhatsNewOpen(false);
    },
    [appInfo?.version],
  );

  const openWhatsNew = useCallback(() => {
    setWhatsNewOpen(true);
  }, []);

  return {
    appInfo,
    appInfoLoading,
    appInfoError,
    loadAppInfo,
    whatsNewOpen,
    openWhatsNew,
    dismissWhatsNew,
  };
}
