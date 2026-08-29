import type { Meta, StoryObj } from "@storybook/react";
import { NumberField } from "./NumberField";

const meta = {
  title: "Components/NumberField",
  component: NumberField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Limit", defaultValue: 10 },
};

export const WithSuffix: Story = {
  args: { label: "Slow-mode delay", defaultValue: 5, suffix: "sec", min: 0, max: 120 },
};

export const WithHint: Story = {
  args: {
    label: "Max members",
    defaultValue: 100,
    suffix: "members",
    min: 1,
    max: 1000,
    hint: "Applies to new joins. Existing members are not affected.",
  },
};

export const Disabled: Story = {
  args: { label: "Locked value", defaultValue: 50, disabled: true },
};
