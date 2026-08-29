import type { Preview } from "@storybook/react";

// Import the app global styles so components look exactly as they do in the app
import "../src/styles/global.css";

const preview: Preview = {
  parameters: {
    // Auto-detect backgrounds from the CSS color-scheme token so dark/light
    // mode switching in Storybook follows the app palette.
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#f5f4f0" }, // --color-bg in light
        { name: "dark", value: "#18171b" },   // --color-bg in dark
      ],
    },

    controls: {
      // Match prop names to controls automatically from TypeScript types
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    // Open the docs page by default so every story has autodocs
    docs: {
      autodocs: "tag",
    },
  },
};

export default preview;
