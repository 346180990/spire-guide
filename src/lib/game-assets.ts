/**
 * Derives Steam CDN image URLs from a Steam App ID.
 * Steam's public CDN hosts header capsules and library hero images
 * that can be referenced directly for editorial use.
 */

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

export interface GameAssetUrls {
  header: string;
  libraryHero: string;
  /** Screenshot CDN URLs use content hashes — not derivable from App ID alone */
}

export interface GameAssetsConfig {
  steamAppId?: string | undefined;
  coverImage?: string | undefined;
  heroImage?: string | undefined;
}

/**
 * Returns derived Steam CDN URLs from an App ID, with explicit
 * cover/hero overrides when configured in game metadata.
 */
export function getGameAssets(config: GameAssetsConfig): {
  coverImage: string | null;
  heroImage: string | null;
} {
  const { steamAppId, coverImage, heroImage } = config;

  // Explicit URLs take priority over derived CDN URLs
  const cover =
    coverImage && coverImage.length > 0
      ? coverImage
      : steamAppId
        ? `${STEAM_CDN_BASE}/${steamAppId}/header.jpg`
        : null;

  const hero =
    heroImage && heroImage.length > 0
      ? heroImage
      : steamAppId
        ? `${STEAM_CDN_BASE}/${steamAppId}/library_hero.jpg`
        : null;

  return { coverImage: cover, heroImage: hero };
}

/**
 * Simple check for whether a game has any assets configured.
 */
export function hasGameAssets(config: GameAssetsConfig): boolean {
  return !!(config.steamAppId || config.coverImage || config.heroImage);
}
