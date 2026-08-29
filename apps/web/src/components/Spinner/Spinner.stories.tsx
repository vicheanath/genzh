import type { Meta, StoryObj } from "@storybook/react";
import { Spinner, LoadingPanel } from "./Spinner";

const meta = {
  title: "Components/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: "select", options: ["sm", "lg"] },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };

export const CenteredPanel: Story = {
  render: () => (
    <div style={{ width: "320px", height: "160px", border: "1px solid var(--color-border-strong, #ccc)", borderRadius: "0.5rem", position: "relative" }}>
      <LoadingPanel />
    </div>
  ),
};
