import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/Button";
import { UserRow } from "./UserRow";

const meta = {
  title: "Components/UserRow",
  component: UserRow,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div style={{ width: "320px" }}><Story /></div>],
  argTypes: {
    presence: { control: "select", options: [undefined, "online", "idle", "busy", "offline"] },
    size: { control: "select", options: ["sm", "md"] },
    tintName: { control: "boolean" },
  },
} satisfies Meta<typeof UserRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: "Alice Walker" },
};

export const WithPresence: Story = {
  args: { name: "Bob Smith", presence: "online", secondary: "@bobsmith" },
};

export const WithActions: Story = {
  args: {
    name: "Carol Jones",
    secondary: "Online",
    presence: "online",
    actions: (
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <Button variant="ghost" size="sm" iconOnly aria-label="Message">💬</Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="More">⋯</Button>
      </div>
    ),
  },
};

export const Clickable: Story = {
  args: {
    name: "Dave Brown",
    secondary: "Click to view profile",
    onSelect: () => alert("Profile opened"),
  },
};

export const Small: Story = {
  args: { name: "Eve White", secondary: "@evewhite", size: "sm", presence: "idle" },
};
