import type { Meta, StoryObj } from "@storybook/react";
import { Callout, EmptyState } from "./Callout";

const meta = {
  title: "Components/Callout",
  component: Callout,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    tone: { control: "select", options: ["info", "danger"] },
  },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    tone: "info",
    children: "Your email address has not been verified. Check your inbox for a verification link.",
  },
};

export const Danger: Story = {
  args: {
    tone: "danger",
    children: "Something went wrong. Please try again later.",
  },
};

export const Empty: StoryObj<typeof EmptyState> = {
  name: "EmptyState",
  render: () => <EmptyState>No members yet. Invite someone to get started.</EmptyState>,
};
