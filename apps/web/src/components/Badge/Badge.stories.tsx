import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./Badge";

const meta = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "accent", "success", "danger", "mint"],
    },
    dot: { control: "boolean" },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
  args: {
    tone: "neutral",
    children: "Neutral",
  },
};

export const Accent: Story = {
  args: {
    tone: "accent",
    children: "Accent",
  },
};

export const Success: Story = {
  args: {
    tone: "success",
    children: "Online",
  },
};

export const Danger: Story = {
  args: {
    tone: "danger",
    children: "Offline",
  },
};

export const Mint: Story = {
  args: {
    tone: "mint",
    children: "Mint",
  },
};

export const WithDot: Story = {
  args: {
    tone: "success",
    dot: true,
    children: "Live",
  },
};

/** All tones side-by-side. */
export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      <Badge tone="neutral">Neutral</Badge>
      <Badge tone="accent">Accent</Badge>
      <Badge tone="success" dot>Online</Badge>
      <Badge tone="danger" dot>Offline</Badge>
      <Badge tone="mint">Mint</Badge>
    </div>
  ),
};
