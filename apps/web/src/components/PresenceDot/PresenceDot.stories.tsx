import type { Meta, StoryObj } from "@storybook/react";
import { PresenceDot } from "./PresenceDot";

const meta = {
  title: "Components/PresenceDot",
  component: PresenceDot,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    presence: { control: "select", options: ["online", "idle", "busy", "offline"] },
  },
} satisfies Meta<typeof PresenceDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = { args: { presence: "online" } };
export const Idle: Story = { args: { presence: "idle" } };
export const Busy: Story = { args: { presence: "busy" } };
export const Offline: Story = { args: { presence: "offline" } };

export const AllPresences: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <PresenceDot presence="online" />
      <PresenceDot presence="idle" />
      <PresenceDot presence="busy" />
      <PresenceDot presence="offline" />
    </div>
  ),
};
