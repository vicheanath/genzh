import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton, SkeletonText } from "./Skeleton";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    circle: { control: "boolean" },
    width: { control: "text" },
    height: { control: "text" },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {
  args: { width: "200px", height: "1rem" },
};

export const Circle: Story = {
  args: { width: "40px", height: "40px", circle: true },
};

export const Card: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", width: "280px" }}>
      <Skeleton width="40px" height="40px" circle />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <Skeleton width="60%" height="0.9rem" />
        <Skeleton width="40%" height="0.75rem" />
      </div>
    </div>
  ),
};

export const TextBlock: Story = {
  render: () => <div style={{ width: "280px" }}><SkeletonText lines={4} /></div>,
};
