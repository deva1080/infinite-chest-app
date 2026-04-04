"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

type TokenImageProps = Omit<ImageProps, "src"> & {
  src: string;
  fallbackSrc?: string;
};

export function TokenImage({
  src,
  fallbackSrc = "/collections/0_1.webp",
  alt,
  ...rest
}: TokenImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    setResolvedSrc(src);
  }, [src]);

  return (
    <Image
      {...rest}
      src={resolvedSrc}
      alt={alt}
      onError={() => {
        if (resolvedSrc !== fallbackSrc) {
          setResolvedSrc(fallbackSrc);
        }
      }}
    />
  );
}
