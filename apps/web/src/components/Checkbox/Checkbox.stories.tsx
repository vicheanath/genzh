import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./Checkbox";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {
  args: { label: "Enable notifications" },
};

export const Checked: Story = {
  args: { label: "Enable notifications", defaultChecked: true },
};

export const WithHint: Story = {
  args: {
    label: "Send usage data",
    hint: "Helps us improve the app. No personal data is included.",
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: { label: "Managed by your organisation", disabled: true, defaultChecked: true },
};

export const Standalone: Story = {
  args: { "aria-label": "Select item" },
};
