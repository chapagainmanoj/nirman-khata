import { LoadConfigResult, LoadConfigSource } from "unconfig";
import { Color, CreateChannels, PngOptions, ResizeOptions, Sharp, WebpOptions } from "sharp";
import { IcoBuffer } from "sharp-ico";
//#region src/types.d.ts
/**
 * Icon size.
 */
type AssetSize = number | {
  width: number;
  height: number;
};
/**
 * Icon size with resolved width and height.
 */
interface ResolvedAssetSize {
  original: AssetSize;
  width: number;
  height: number;
}
/**
 * Favicon size and name.
 */
type Favicon = [size: AssetSize, name: string];
interface Asset {
  sizes: AssetSize[];
  padding?: number;
  resizeOptions?: ResizeOptions;
  favicons?: Favicon[];
}
interface AppleDeviceSize {
  width: number;
  height: number;
  scaleFactor: number;
  /**
   * The padding to add to the splash screen.
   *
   * @default 0.3
   */
  padding?: number;
  /**
   * @default { compressionLevel: 9, quality: 60 }
   */
  png?: PngOptions;
  /**
   * Resize options: by default, `sharp` will use white background color.
   */
  resizeOptions?: ResizeOptions;
  /**
   * Dark resize options.
   *
   * If you want to also add a dark splash screen, change the background color with this another option.
   */
  darkResizeOptions?: ResizeOptions;
}
type AppleSplashScreenName = (landscape: boolean, size: AppleDeviceSize, dark?: boolean) => string;
interface AppleTouchStartupImageOptions {
  /**
   * Show the html head links?
   *
   * @default true
   */
  log?: boolean;
  /**
   * Base path to generate the html head links.
   *
   * @default '/'
   */
  basePath?: string;
  /**
   * Add media screen to the `apple-touch-startup-image` rel link?
   *
   * @default true
   */
  addMediaScreen?: boolean;
  /**
   * Using XHTML?
   *
   * @default false
   */
  xhtml?: boolean;
}
interface AppleSplashScreens {
  /**
   * The image to use for generating dark apple splash screens assets.
   *
   * By default, it will use the original image.
   *
   * @param imageName The image name configured in images.
   */
  darkImageResolver?: (imageName: string) => Promise<Buffer | undefined>;
  sizes: AppleDeviceSize[];
  /**
   * The padding to add to the splash screen.
   *
   * @default 0.3
   */
  padding?: number;
  /**
   * Global png options.
   *
   * @default { compressionLevel: 9, quality: 60 }
   */
  png?: PngOptions;
  /**
   * Resize options: by default, `sharp` will use white background color.
   */
  resizeOptions?: ResizeOptions;
  /**
   * Dark resize options.
   *
   * If you want to also add a dark splash screen, change the background color with this another option.
   */
  darkResizeOptions?: ResizeOptions;
  /**
   * Options to generate the html head links.
   */
  linkMediaOptions?: AppleTouchStartupImageOptions;
  /**
   * Customize the splash screen name.
   *
   * @param landscape Is the splash screen landscape?
   * @param size The splash screen size.
   * @param dark Is the splash screen dark?
   * @returns The splash screen name.
   *
   * @default (landscape, size, dark?: boolean) => `apple-splash-${landscape ? 'landscape' : 'portrait'}-${typeof dark === 'boolean' ? (dark ? 'dark-' : 'light-') : ''}${size.width}x${size.height}.png`
   */
  name?: AppleSplashScreenName;
}
interface ResolvedAppleSplashScreens {
  darkImageResolver?: (imageName: string) => Promise<Buffer | undefined>;
  padding: number;
  sizes: AppleDeviceSize[];
  linkMediaOptions: Required<AppleTouchStartupImageOptions>;
  name: AppleSplashScreenName;
  png: PngOptions;
}
type AssetType = 'transparent' | 'maskable' | 'apple';
interface ResolvedAsset extends Required<Omit<Asset, 'favicons' | 'sizes'>> {
  sizes: ResolvedAssetSize[];
  favicons?: Favicon[];
}
interface Assets extends Record<AssetType, Asset> {
  /**
   * @default { compressionLevel: 9, quality: 60 }
   */
  png?: PngOptions;
  /**
   * @default `pwa-<width>x<height>.png`, `maskable-icon-<width>x<height>.png`, `apple-touch-icon-<width>x<height>.png`
   */
  assetName?: (type: AssetType, size: ResolvedAssetSize) => string;
  /**
   * Splash screens.
   */
  appleSplashScreens?: AppleSplashScreens;
}
interface ResolvedAssets {
  assets: Record<AssetType, ResolvedAsset>;
  png: PngOptions;
  /**
   * @default `pwa-<width>x<height>.png`, `maskable-icon-<width>x<height>.png`, `apple-touch-icon-<width>x<height>.png`
   */
  assetName: (type: AssetType, size: ResolvedAssetSize) => string;
}
type LogLevel = 'info' | 'warn' | 'silent';
interface BuildOptions {
  root: string;
  logLevel?: LogLevel;
  overrideAssets?: boolean;
  headLinkOptions: Required<HeadLinkOptions>;
}
interface ResolvedBuildOptions extends Required<BuildOptions> {}
//#endregion
//#region src/api/defaults.d.ts
declare const defaultResizeOptions: {
  fit: "contain";
  background: string;
};
declare const defaultDarkResizeOptions: {
  fit: "contain";
  background: string;
};
declare const defaultPngCompressionOptions: PngOptions;
declare const defaultPngOptions: Record<AssetType, {
  padding: number;
  resizeOptions: ResizeOptions;
}>;
declare function createResizeOptions(dark: boolean, options: ResizeOptions): ResizeOptions;
declare function createPngCompressionOptions(options: PngOptions): PngOptions;
//#endregion
//#region src/api/utils.d.ts
declare function extractAssetSize(size: ResolvedAssetSize, padding: number): {
  width: number;
  height: number;
};
declare function createSharp<OutputType extends GenerateOptionsType>(type: OutputType, image: ImageSourceInput, size: AssetSize, background: Color, options?: GenerateOptionsOptionType<OutputType>, channels?: CreateChannels): Promise<import("sharp").Sharp>;
//#endregion
//#region src/api/html.d.ts
type HtmlLinkPreset = 'default' | '2023';
interface HtmlLink {
  id: string;
  rel: 'apple-touch-startup-image' | 'apple-touch-icon' | 'icon';
  href: string;
}
interface AppleSplashScreenLink extends HtmlLink {
  media: string;
}
interface FaviconLink extends HtmlLink {
  sizes?: string;
  type?: string;
}
type HtmlLinkType = 'string' | 'link';
type HtmlLinkReturnType<T, R extends HtmlLink> = T extends 'string' ? string : T extends 'link' ? R : never;
interface HtmlIconLinkOptions {
  name: string;
  /**
   * Required only for non SVG favicon
   */
  size?: AssetSize;
  xhtml?: boolean;
  basePath?: string;
  /**
   * Render the id attribute when using string format?
   *
   * The id will always be present in object notation.
   *
   * @default false
   */
  includeId?: boolean;
}
interface AppleSplahScreenHtmlLinkOptions {
  size: AppleDeviceSize;
  landscape: boolean;
  addMediaScreen: boolean;
  xhtml?: boolean;
  name?: AppleSplashScreenName;
  basePath?: string;
  dark?: boolean;
  /**
   * Render the id attribute when using string format?
   *
   * The id will always be present in object notation.
   *
   * @default false
   */
  includeId?: boolean;
}
declare function createFaviconHtmlLink<Format extends HtmlLinkType>(format: Format, preset: HtmlLinkPreset, icon: HtmlIconLinkOptions): HtmlLinkReturnType<Format, FaviconLink>;
declare function createAppleTouchIconHtmlLink<Format extends HtmlLinkType>(format: Format, icon: HtmlIconLinkOptions): HtmlLinkReturnType<Format, HtmlLink>;
declare function createAppleSplashScreenHtmlLink<Format extends HtmlLinkType>(format: Format, options: AppleSplahScreenHtmlLinkOptions): HtmlLinkReturnType<Format, AppleSplashScreenLink>;
//#endregion
//#region src/api/maskable.d.ts
declare function generateMaskableAsset<OutputType extends GenerateOptionsType>(type: OutputType, image: ImageSourceInput, size: AssetSize, options?: GenerateOptionsOptionType<OutputType>): Promise<Sharp>;
//#endregion
//#region src/api/transparent.d.ts
declare function generateTransparentAsset<OutputType extends GenerateOptionsType>(type: OutputType, image: ImageSourceInput, size: AssetSize, options?: GenerateOptionsOptionType<OutputType>): Promise<Sharp>;
//#endregion
//#region src/api/favicon.d.ts
declare function generateFavicon<Format extends GenerateFaviconType>(format: Format, image: ImageSourceInput, options?: GenerateFaviconOptionsType<Format>): Promise<IcoBuffer>;
//#endregion
//#region src/preset.d.ts
interface Preset extends Assets {}
//#endregion
//#region src/presets/minimal.d.ts
/**
 * Minimal preset.
 *
 * @deprecated use `minimal-2023` instead
 * @see https://www.leereamsnyder.com/favicons-in-2021
 */
declare const minimalPreset: Preset;
//#endregion
//#region src/presets/minimal-2023.d.ts
/**
 * Minimal preset for 2023.
 *
 * @see https://dev.to/masakudamatsu/favicon-nightmare-how-to-maintain-sanity-3al7
 */
declare const minimal2023Preset: Preset;
//#endregion
//#region src/splash.d.ts
type AppleDeviceName = 'iPad Pro 12.9"' | 'iPad Pro 11"' | 'iPad Pro 10.5"' | 'iPad Pro 9.7"' | 'iPad Air 13"' | 'iPad Air 11"' | 'iPad Air 10.9"' | 'iPad Air 10.5"' | 'iPad Air 9.7"' | 'iPad 11"' | 'iPad 10.2"' | 'iPad 9.7"' | 'iPad mini 8.3"' | 'iPad mini 7.9"' | 'iPhone 17 Pro Max' | 'iPhone 17 Pro' | 'iPhone Air' | 'iPhone 17' | 'iPhone 16 Pro Max' | 'iPhone 16 Pro' | 'iPhone 16 Plus' | 'iPhone 16' | 'iPhone 16e' | 'iPhone 15 Pro Max' | 'iPhone 15 Pro' | 'iPhone 15 Plus' | 'iPhone 15' | 'iPhone 14 Pro Max' | 'iPhone 14 Pro' | 'iPhone 14 Plus' | 'iPhone 14' | 'iPhone 13 Pro Max' | 'iPhone 13 Pro' | 'iPhone 13' | 'iPhone 13 mini' | 'iPhone 12 Pro Max' | 'iPhone 12 Pro' | 'iPhone 12' | 'iPhone 12 mini' | 'iPhone 11 Pro Max' | 'iPhone 11 Pro' | 'iPhone 11' | 'iPhone XS Max' | 'iPhone XS' | 'iPhone XR' | 'iPhone X' | 'iPhone 8 Plus' | 'iPhone 8' | 'iPhone 7 Plus' | 'iPhone 7' | 'iPhone 6s Plus' | 'iPhone 6s' | 'iPhone 6 Plus' | 'iPhone 6' | 'iPhone SE 4.7"' | 'iPhone SE 4"' | 'iPod touch 5th generation and later';
interface AppleSplashScreen extends Record<AppleDeviceName, AppleDeviceSize> {}
/**
 * Apple device names and resolutions.
 * @see https://developer.apple.com/design/human-interface-guidelines/layout#iOS-iPadOS-device-screen-dimensions
 */
declare const appleSplashScreenSizes: AppleSplashScreen;
declare function defaultSplashScreenName(landscape: boolean, size: AppleDeviceSize, dark?: boolean): string;
declare const AllAppleDeviceNames: AppleDeviceName[];
declare function createAppleSplashScreens(options?: {
  /**
   * The image to use for generating dark apple splash screens assets.
   *
   * By default, it will use the original image.
   *
   * @param imageName The image name configured in images.
   */
  darkImageResolver?: (imageName: string) => Promise<Buffer | undefined>;
  padding?: number;
  resizeOptions?: ResizeOptions;
  darkResizeOptions?: ResizeOptions;
  linkMediaOptions?: AppleTouchStartupImageOptions;
  png?: PngOptions;
  name?: AppleSplashScreenName;
}, devices?: AppleDeviceName[],
/**
 * Additional devices to add to the preset.
 */
additionalDevices?: Record<string, AppleDeviceSize>): {
  darkImageResolver: ((imageName: string) => Promise<Buffer | undefined>) | undefined;
  sizes: AppleDeviceSize[];
  padding: number | undefined;
  resizeOptions: ResizeOptions | undefined;
  darkResizeOptions: ResizeOptions | undefined;
  linkMediaOptions: AppleTouchStartupImageOptions | undefined;
  png: PngOptions | undefined;
  name: AppleSplashScreenName | undefined;
};
declare function combinePresetAndAppleSplashScreens(preset: Preset, options?: {
  /**
   * The image to use for generating dark apple splash screens assets.
   *
   * By default, it will use the original image.
   *
   * @param imageName The image name configured in images.
   */
  darkImageResolver?: (imageName: string) => Promise<Buffer | undefined>;
  padding?: number;
  resizeOptions?: ResizeOptions;
  darkResizeOptions?: ResizeOptions;
  linkMediaOptions?: AppleTouchStartupImageOptions;
  png?: PngOptions;
  name?: AppleSplashScreenName;
}, devices?: AppleDeviceName[],
/**
 * Additional devices to add to the preset.
 */
additionalDevices?: Record<string, AppleDeviceSize>): {
  appleSplashScreens: {
    darkImageResolver: ((imageName: string) => Promise<Buffer | undefined>) | undefined;
    sizes: AppleDeviceSize[];
    padding: number | undefined;
    resizeOptions: ResizeOptions | undefined;
    darkResizeOptions: ResizeOptions | undefined;
    linkMediaOptions: AppleTouchStartupImageOptions | undefined;
    png: PngOptions | undefined;
    name: AppleSplashScreenName | undefined;
  };
  png?: PngOptions;
  assetName?: (type: AssetType, size: ResolvedAssetSize) => string;
  transparent: Asset;
  maskable: Asset;
  apple: Asset;
};
//#endregion
//#region src/utils.d.ts
declare function toResolvedSize(size: AssetSize): {
  original: AssetSize;
  width: number;
  height: number;
};
declare function toResolvedAsset(type: AssetType, asset: Asset): {
  sizes: {
    original: AssetSize;
    width: number;
    height: number;
  }[];
  padding: number;
  resizeOptions: import("sharp").ResizeOptions;
  favicons?: Favicon[];
};
declare function defaultAssetName(type: AssetType, size: ResolvedAssetSize): string;
declare function sameAssetSize(a: AssetSize, b: ResolvedAssetSize): boolean;
declare function cloneResolvedAssetsSizes({ png, assetName, assets }: ResolvedAssets): {
  assets: {
    transparent: {
      sizes: ResolvedAssetSize[];
      favicons?: Favicon[];
      padding: number;
      resizeOptions: import("sharp").ResizeOptions;
    };
    maskable: {
      sizes: ResolvedAssetSize[];
      favicons?: Favicon[];
      padding: number;
      resizeOptions: import("sharp").ResizeOptions;
    };
    apple: {
      sizes: ResolvedAssetSize[];
      favicons?: Favicon[];
      padding: number;
      resizeOptions: import("sharp").ResizeOptions;
    };
  };
  png: import("sharp").PngOptions;
  assetName: (type: AssetType, size: ResolvedAssetSize) => string;
};
declare function cloneResolvedAssetSizes({ sizes, ...asset }: ResolvedAsset): {
  sizes: ResolvedAssetSize[];
  favicons?: Favicon[];
  padding: number;
  resizeOptions: import("sharp").ResizeOptions;
};
//#endregion
//#region src/config.d.ts
/**
 * Built-in presets.
 * - `minimal-2023`: Only generate the bare minimum assets.
 * - `minimal`: Only generate the bare minimum assets (deprecated).
 * - `android`: Generate assets for Android.
 * - `windows`: Generate assets for Windows.
 * - `ios`: Generate assets for iOS.
 * - `all`: `android`, `windows` and `ios` presets combined.
 */
type BuiltInPreset = 'minimal' | 'minimal-2023' | 'android' | 'windows' | 'ios' | 'all';
interface HeadLinkOptions {
  /**
   * Base path to generate the html head links.
   *
   * @default '/'
   */
  basePath?: string;
  /**
   * The preset to use.
   *
   * If using the built-in presets from CLI (`minimal` or `minimal-2023`), this option will be ignored (will be set to `default` or `2023` for `minimal` and `minimal-2023` respectively).
   *
   * @default 'default'
   */
  preset?: HtmlLinkPreset;
  /**
   * By default, the SVG favicon will use the SVG file name as the name.
   *
   * For example, if you provide `public/logo.svg` as the image source, the href in the link will be `<basePath>logo.svg`.
   *
   * @param name The name of the SVG icons.
   */
  resolveSvgName?: (name: string) => string;
  /**
   * Generate an id when generating the html head links.
   *
   * @default false
   */
  xhtml?: boolean;
  /**
   * Include the id when generating the html head links.
   *
   * @default false
   */
  includeId?: boolean;
}
interface UserConfig {
  /**
   * Project root directory. Can be an absolute path, or a path relative from
   * the location of the config file itself.
   * @default process.cwd()
   */
  root?: string;
  /**
   * Path to the config file.
   *
   * Default resolving to `pwa-assets.config.[js|mjs|cjs]`
   *
   * Setting to `false` will disable config resolving.
   */
  config?: string | false;
  /**
   * Override assets?
   *
   * @default true
   */
  overrideAssets?: boolean;
  /**
   * Log level.
   *
   * @default 'info'
   */
  logLevel?: LogLevel;
  /**
   * Path relative to `root` where to find the images to use for generating PWA assets.
   *
   * PWA Assets will be generated in the same directory.
   */
  images?: string | string[];
  /**
   * Preset to use.
   *
   * @default 'minimal'
   */
  preset?: BuiltInPreset | Preset;
  /**
   * Options for generating the html head links for `apple-touch-icon` and favicons.
   */
  headLinkOptions?: HeadLinkOptions;
  /**
   * Show the PWA web manifest icons' entry.
   *
   * @default true
   */
  manifestIconsEntry?: boolean;
}
interface ResolvedConfig extends Required<Omit<UserConfig, 'preset'>> {
  preset: Preset;
}
declare function defineConfig(config: UserConfig): UserConfig;
declare function loadConfig<U extends UserConfig>(cwd?: string, configOrPath?: string | U, extraConfigSources?: LoadConfigSource[], defaults?: UserConfig): Promise<LoadConfigResult<U>>;
//#endregion
//#region src/api/types.d.ts
type ImageSourceInput = Buffer | ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array | string;
interface GenerateOptions {
  /**
   * @default 0
   */
  padding?: number;
  outputOptions?: any;
  resizeOptions?: ResizeOptions;
}
type GenerateOptionsType = 'png' | 'webp' | 'none';
type GenerateOptionsOptionType<T> = T extends 'png' ? GenerateOutputOptions<PngOptions> : T extends 'webp' ? GenerateOutputOptions<WebpOptions> : T extends 'none' ? GenerateOptions : never;
interface GenerateOutputOptions<T> extends GenerateOptions {
  outputOptions: T;
}
type GenerateFaviconType = 'png' | 'webp';
type GenerateFaviconOptionsType<T> = T extends 'png' ? PngOptions : T extends 'webp' ? WebpOptions : never;
/**
 * PWA web manifest icon.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/Manifest/icons
 * @see https://w3c.github.io/manifest/#icons-member
 */
interface ManifestIcon {
  src: string;
  type?: string;
  sizes?: string;
  purpose?: string;
}
/**
 * PWA web manifest icons.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/Manifest/icons
 * @see https://w3c.github.io/manifest/#icons-member
 */
interface ManifestIcons {
  icons: ManifestIcon[];
}
type ManifestIconsType = 'string' | 'object';
type ManifestIconsOptionsType<T> = T extends 'string' ? string : T extends 'object' ? ManifestIcons : never;
interface IconAsset<T extends HtmlLink> {
  /**
   * The name of the icon asset.
   */
  name: string;
  /**
   * The icon asset url.
   */
  url: string;
  /**
   * The icon asset width.
   *
   * For the SVG image favicon icon, it will be set to 0.
   */
  width: number;
  /**
   * The icon asset height.
   *
   * For the SVG image favicon icon, it will be set to 0.
   */
  height: number;
  /**
   * The icon asset mime type.
   */
  mimeType: 'image/png' | 'image/webp' | 'image/svg+xml' | 'image/x-icon';
  /**
   * The html head link.
   */
  link?: string;
  /**
   * The html head link.
   */
  linkObject?: T;
  /**
   * Creates the icon asset.
   */
  buffer: () => Promise<Buffer>;
}
/**
 * PWA assets generation and injection options.
 */
interface ImageAssets {
  /**
   * The image to use for generating the icon assets.
   */
  imageResolver: () => Buffer | Promise<Buffer>;
  /**
   * The name of the image.
   */
  imageName: string;
  /**
   * The original name of the image.
   */
  originalName?: string;
  /**
   * The preset to use.
   */
  preset: BuiltInPreset | Preset;
  /**
   * The preset for the favicons.
   *
   * If using the built-in preset option (`minimal` or `minimal-2023`), this option will be ignored (will be set to `default` or `2023` for `minimal` and `minimal-2023` respectively).
   *
   * @default 'default'
   */
  faviconPreset?: HtmlLinkPreset;
  /**
   * Html link options.
   */
  htmlLinks: {
    xhtml: boolean;
    includeId: boolean;
  };
  /**
   * Base path to generate the html head links.
   */
  basePath: string;
  /**
   * By default, the SVG favicon will use the SVG file name as the name.
   *
   * For example, if you provide `public/logo.svg` as the image source, the href in the link will be `<basePath>logo.svg`.
   *
   * @param name The name of the SVG icons.
   */
  resolveSvgName: (name: string) => string;
}
interface ImageAssetsInstructions {
  /**
   * The image path when providing an absolute path, otherwise the image name provided to `instructions`.
   */
  image: string;
  /**
   * The original name of the image.
   */
  originalName?: string;
  /**
   * The favicon icons instructions.
   *
   * The key is the favicon url of the icon asset.
   */
  favicon: Record<string, IconAsset<FaviconLink>>;
  /**
   * The transparents icons instructions.
   *
   * The key is the icon url of the icon asset.
   */
  transparent: Record<string, IconAsset<HtmlLink>>;
  /**
   * The maskable icons instructions.
   *
   * The key is the icon url of the icon asset.
   */
  maskable: Record<string, IconAsset<HtmlLink>>;
  /**
   * The apple icons instructions.
   *
   * The key is the icon url of the icon asset.
   */
  apple: Record<string, IconAsset<HtmlLink>>;
  /**
   * The apple splash screens icons instructions.
   *
   * The key is the favicon icons of the icon asset.
   */
  appleSplashScreen: Record<string, IconAsset<AppleSplashScreenLink>>;
}
//#endregion
export { createSharp as $, AppleDeviceName as A, generateTransparentAsset as B, cloneResolvedAssetSizes as C, toResolvedAsset as D, sameAssetSize as E, defaultSplashScreenName as F, HtmlIconLinkOptions as G, AppleSplahScreenHtmlLinkOptions as H, minimal2023Preset as I, HtmlLinkReturnType as J, HtmlLink as K, minimalPreset as L, appleSplashScreenSizes as M, combinePresetAndAppleSplashScreens as N, toResolvedSize as O, createAppleSplashScreens as P, createFaviconHtmlLink as Q, Preset as R, loadConfig as S, ResolvedBuildOptions as St, defaultAssetName as T, AppleSplashScreenLink as U, generateMaskableAsset as V, FaviconLink as W, createAppleSplashScreenHtmlLink as X, HtmlLinkType as Y, createAppleTouchIconHtmlLink as Z, LoadConfigResult as _, LogLevel as _t, GenerateOptionsType as a, defaultPngOptions as at, UserConfig as b, ResolvedAssetSize as bt, ImageAssets as c, AppleSplashScreenName as ct, ManifestIcon as d, Asset as dt, extractAssetSize as et, ManifestIcons as f, AssetSize as ft, HeadLinkOptions as g, Favicon as gt, BuiltInPreset as h, BuildOptions as ht, GenerateOptionsOptionType as i, defaultPngCompressionOptions as it, AppleSplashScreen as j, AllAppleDeviceNames as k, ImageAssetsInstructions as l, AppleSplashScreens as lt, ManifestIconsType as m, Assets as mt, GenerateFaviconType as n, createResizeOptions as nt, GenerateOutputOptions as o, defaultResizeOptions as ot, ManifestIconsOptionsType as p, AssetType as pt, HtmlLinkPreset as q, GenerateOptions as r, defaultDarkResizeOptions as rt, IconAsset as s, AppleDeviceSize as st, GenerateFaviconOptionsType as t, createPngCompressionOptions as tt, ImageSourceInput as u, AppleTouchStartupImageOptions as ut, LoadConfigSource as v, ResolvedAppleSplashScreens as vt, cloneResolvedAssetsSizes as w, defineConfig as x, ResolvedAssets as xt, ResolvedConfig as y, ResolvedAsset as yt, generateFavicon as z };