import { useEffect, useRef, useState } from "react";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { hasPersian } from "../../utils/fontUtils.js";

export default function Avatar({
  src,
  alt,
  name,
  color = "#10b981",
  initials = null,
  placeholderContent = null,
  className = "",
  imgClassName = "",
  placeholderClassName = "",
  style = undefined,
}) {
  const avatarSrc = String(src || "").trim();
  const derivedInitials = initials ?? getAvatarInitials(name || alt || "S");
  const content = placeholderContent ?? derivedInitials;
  const showPersianFont =
    (typeof content === "string" || typeof content === "number") &&
    hasPersian(String(content));
  const imageRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [avatarSrc]);

  useEffect(() => {
    if (!avatarSrc || hasError) return;
    const image = imageRef.current;
    if (image?.complete && Number(image.naturalWidth || 0) > 0) {
      setIsLoaded(true);
    }
  }, [avatarSrc, hasError]);

  return (
    <div
      className={`relative overflow-hidden rounded-full ${className}`}
      style={{ ...getAvatarStyle(color), ...style }}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center ${
          showPersianFont ? "font-fa" : ""
        } ${placeholderClassName}`}
        aria-hidden={avatarSrc && !hasError && isLoaded ? "true" : "false"}
      >
        {content}
      </div>
      {avatarSrc && !hasError ? (
        <img
          ref={imageRef}
          src={avatarSrc}
          alt={alt || name || "Avatar"}
          className={`absolute inset-0 h-full w-full rounded-full object-cover transition-opacity duration-200 ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${imgClassName}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      ) : null}
    </div>
  );
}
