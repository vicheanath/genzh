import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./Slider";

const meta = {
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "280px" }}><Story /></div>],
  argTypes: {
    disabled: { control: "boolean" },
    min: { control: "number" },
    max: { control: "number" },
    step: { control: "number" },
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { defaultValue: [60] },
};

export const Labelled: Story = {
  args: { label: "Volume", defaultValue: [75], min: 0, max: 100 },
};

export const WithStep: Story = {
  args: { label: "Slow-mode (sec)", defaultValue: [10], min: 0, max: 60, step: 5 },
};

export const Disabled: Story = {
  args: { label: "Locked", defaultValue: [40], disabled: true },
};
