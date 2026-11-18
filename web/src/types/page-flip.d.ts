// Minimal typings for page-flip (the package ships no .d.ts). Only what we use.
declare module "page-flip" {
  export type SizeType = "fixed" | "stretch";
  export type Orientation = "portrait" | "landscape";

  export interface FlipSetting {
    width: number;
    height: number;
    size?: SizeType;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
    startPage?: number;
  }

  export interface FlipEvent<T = unknown> {
    data: T;
    object: PageFlip;
  }

  export class PageFlip {
    constructor(element: HTMLElement, settings: FlipSetting);
    loadFromImages(images: string[]): void;
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromImages(images: string[]): void;
    destroy(): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    flip(pageNum: number, corner?: "top" | "bottom"): void;
    turnToPage(pageNum: number): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    getPageCount(): number;
    getCurrentPageIndex(): number;
    getOrientation(): Orientation;
    update(): void;
    on(event: "flip" | "changeState" | "init" | "update", callback: (e: FlipEvent<number | string | { page: number; mode: Orientation }>) => void): PageFlip;
    on(event: "changeOrientation", callback: (e: FlipEvent<Orientation>) => void): PageFlip;
    off(event: string): PageFlip;
  }
}
