import { fileURLToPath, URL } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  viteFinal(config) {
    // ── Aliases — mirror vite.config.ts so @/ and @genzh/shared resolve ──
    config.resolve ??= {};
    const existingAlias = config.resolve.alias ?? {};
    config.resolve.alias = {
      ...(Array.isArray(existingAlias) ? {} : existingAlias),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "@genzh/shared": fileURLToPath(
        new URL("../../../packages/shared/src", import.meta.url)
      ),
    };

    // ── Dedupe — prevent two copies of React / React-Query in stories ──
    config.resolve.dedupe = ["react", "react-dom", "@tanstack/react-query"];

    // ── CSS Modules — readable names in dev, same as the app ──
    config.css ??= {};
    config.css.modules = {
      localsConvention: "camelCaseOnly",
      generateScopedName: "[name]__[local]__[hash:base64:5]",
    };

    return config;
  },

  addons: ["@storybook/addon-vitest"]
};

export default config;
