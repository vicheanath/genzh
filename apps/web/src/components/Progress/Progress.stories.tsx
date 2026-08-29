import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./Progress";

const meta = {
  title: "Components/Progress",
  component: Progress,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "320px" }}><Story /></div>],
  argTypes: {
    tone: { control: "select", options: ["accent", "live"] },
    size: { control: "select", options: ["sm", "md"] },
    value: { control: { type: "range", min: 0, max: 100 } },
    showValue: { control: "boolean" },
  },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 60 },
};

export const Labelled: Story = {
  args: { label: "Upload progress", value: 72, showValue: true },
};

export const Indeterminate: Story = {
  args: { label: "Processing…", value: null },
};

export const Live: Story = {
  args: { label: "Stream health", tone: "live", value: 88, showValue: true },
};

export const Small: Story = {
  args: { value: 40, size: "sm" },
};
