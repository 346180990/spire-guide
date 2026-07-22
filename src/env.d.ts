/// <reference types="astro/client" />

interface Window {
  adsbygoogle?: Array<Record<string, unknown>>;
  dataLayer?: Array<Record<string, unknown>>;
}

declare function gtag(command: string, ...args: unknown[]): void;
