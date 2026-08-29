import type { Meta, StoryObj } from "@storybook/react";
import { Collapsible } from "./Collapsible";

const meta = {
  title: "Components/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    section: { control: "boolean" },
  },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Text Channels",
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.5rem 0" }}>
        <div># general</div>
        <div># random</div>
        <div># announcements</div>
      </div>
    ),
  },
};

export const Section: Story = {
  args: {
    title: "CHANNELS",
    section: true,
    adornment: <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>3</span>,
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.5rem 0" }}>
        <div># general</div>
        <div># random</div>
        <div># announcements</div>
      </div>
    ),
  },
};

export const StartOpen: Story = {
  args: {
    title: "Voice Channels",
    defaultOpen: true,
    children: <div style={{ padding: "0.5rem 0" }}>🔊 Lounge</div>,
  },
};
