import { c as createResizeOptions, d as defaultPngOptions, f as defaultResizeOptions, l as defaultDarkResizeOptions, r as defaultAssetName, s as createPngCompressionOptions, u as defaultPngCompressionOptions } from "./utils-WVxdTzUh.mjs";
import { minimalPreset } from "./presets/minimal.mjs";
import { minimal2023Preset } from "./presets/minimal-2023.mjs";
import { a as defaultSplashScreenName, i as createAppleSplashScreens, n as appleSplashScreenSizes, r as combinePresetAndAppleSplashScreens, t as AllAppleDeviceNames } from "./splash-BpsaNGPf.mjs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { existsSync, statSync } from "node:fs";
import { createConfigLoader } from "unconfig";
//#region src/config.ts
function defineConfig(config) {
	return config;
}
async function loadConfig(cwd = process.cwd(), configOrPath = cwd, extraConfigSources = [], defaults = {
	overrideAssets: true,
	logLevel: "info"
}) {
	let inlineConfig = {};
	if (typeof configOrPath !== "string") {
		inlineConfig = configOrPath;
		if (inlineConfig.config === false) return {
			config: inlineConfig,
			sources: []
		};
		else configOrPath = inlineConfig.config || process.cwd();
	}
	const resolved = resolve(cwd, configOrPath);
	let isFile = false;
	if (existsSync(resolved) && statSync(resolved).isFile()) {
		isFile = true;
		cwd = dirname(resolved).replace(/\\/g, "/");
	}
	const result = await createConfigLoader({
		sources: isFile ? [{
			files: resolved,
			extensions: []
		}] : [{ files: ["pwa-assets.config"] }, ...extraConfigSources],
		cwd,
		defaults: inlineConfig
	}).load();
	result.config = Object.assign(defaults, result.config || inlineConfig);
	return result;
}
//#endregion
export { AllAppleDeviceNames, appleSplashScreenSizes, combinePresetAndAppleSplashScreens, createAppleSplashScreens, createPngCompressionOptions, createResizeOptions, defaultAssetName, defaultDarkResizeOptions, defaultPngCompressionOptions, defaultPngOptions, defaultResizeOptions, defaultSplashScreenName, defineConfig, loadConfig, minimal2023Preset, minimalPreset };
