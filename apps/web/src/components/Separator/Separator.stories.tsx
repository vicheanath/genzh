import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "./Separator";

const meta = {
  title: "Components/Separator",
  component: Separator,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "320px" }}><Story /></div>],
  argTypes: {
    labelVariant: { control: "select", options: ["plain", "chip"] },
    orientation: { control: "select", options: ["horizontal", "vertical"] },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const WithLabel: Story = {
  args: { label: "OR" },
};

export const WithChipLabel: Story = {
  args: { label: "Today", labelVariant: "chip" },
};

export const Vertical: Story = {
  decorators: [() => (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", height: "2rem" }}>
      <span>Left</span>
      <Separator orientation="vertical" style={{ height: "100%" }} />
      <span>Right</span>
    </div>
  )],
};
