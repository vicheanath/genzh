import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./Avatar";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "md", "lg", "xl"] },
    presence: { control: "select", options: [undefined, "online", "idle", "busy", "offline"] },
    speaking: { control: "boolean" },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {
  args: { name: "Alice Walker" },
};

export const WithImage: Story = {
  args: {
    name: "Bob Smith",
    src: "https://i.pravatar.cc/150?img=3",
  },
};

export const BrokenImage: Story = {
  args: {
    name: "Carol Jones",
    src: "https://invalid.example/broken.jpg",
  },
};

export const WithPresence: Story = {
  args: {
    name: "Dave Brown",
    presence: "online",
  },
};

export const Speaking: Story = {
  args: {
    name: "Eve White",
    speaking: true,
    size: "lg",
  },
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Avatar name="XS" size="xs" />
      <Avatar name="SM" size="sm" />
      <Avatar name="MD" size="md" />
      <Avatar name="LG" size="lg" />
      <Avatar name="XL" size="xl" />
    </div>
  ),
};

export const AllPresences: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Avatar name="On" presence="online" />
      <Avatar name="Id" presence="idle" />
      <Avatar name="Bu" presence="busy" />
      <Avatar name="Of" presence="offline" />
    </div>
  ),
};
