import type { PlatformId } from '../../shared/types.js';
import { PLATFORM_URLS } from '../../shared/constants.js';
import type { BasePlatform } from './base.js';

type PlatformConstructor = new () => BasePlatform;

const registry = new Map<PlatformId, PlatformConstructor>();

export function registerPlatform(id: PlatformId, ctor: PlatformConstructor): void {
  registry.set(id, ctor);
}

export function detectCurrentPlatform(): PlatformId | null {
  const hostname = window.location.hostname;
  for (const [id, urls] of Object.entries(PLATFORM_URLS) as [PlatformId, string[]][]) {
    if (urls.some((u) => hostname === u || hostname.endsWith('.' + u))) {
      return id;
    }
  }
  return null;
}

export function getPlatformInstance(id: PlatformId): BasePlatform | null {
  const Ctor = registry.get(id);
  if (!Ctor) return null;
  return new Ctor();
}

export function getCurrentPlatformInstance(): BasePlatform | null {
  const id = detectCurrentPlatform();
  if (!id) return null;
  return getPlatformInstance(id);
}
