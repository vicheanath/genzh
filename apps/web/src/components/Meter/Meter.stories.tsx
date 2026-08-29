import type { Meta, StoryObj } from "@storybook/react";
import { Meter } from "./Meter";

const meta = {
  title: "Components/Meter",
  component: Meter,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "280px" }}><Story /></div>],
  argTypes: {
    variant: { control: "select", options: ["bar", "segments"] },
    tone: { control: "select", options: ["accent", "live", "muted"] },
    value: { control: { type: "range", min: 0, max: 100 } },
  },
} satisfies Meta<typeof Meter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 65 },
};

export const Labelled: Story = {
  args: { label: "Microphone level", value: 72 },
};

export const Segmented: Story = {
  args: { label: "Signal", variant: "segments", tone: "live", value: 45 },
};

export const Muted: Story = {
  args: { label: "Microphone (muted)", variant: "segments", tone: "muted", value: 0 },
};

export const Full: Story = {
  args: { label: "Volume", value: 100, tone: "accent" },
};
