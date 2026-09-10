import { create } from 'zustand';
import type { BannerTone } from '@/components/feedback/Banner';

type BannerPayload = { message: string; tone: BannerTone } | null;

/** Lightweight global banner channel so any screen can surface a refusal. */
type UiState = {
  banner: BannerPayload;
  showBanner: (message: string, tone?: BannerTone) => void;
  hideBanner: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  banner: null,
  showBanner: (message, tone = 'info') => set({ banner: { message, tone } }),
  hideBanner: () => set({ banner: null }),
}));
