import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/Button";
import { Menu, MenuItem, MenuSeparator } from "./Menu";

const meta = {
  title: "Components/Menu",
  component: Menu,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    align: { control: "select", options: ["start", "center", "end"] },
    side: { control: "select", options: ["top", "right", "bottom", "left"] },
  },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button variant="secondary">Options ▾</Button>,
    children: (
      <>
        <MenuItem>Edit</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger">Delete</MenuItem>
      </>
    ),
  },
};

export const StartAligned: Story = {
  args: {
    align: "start",
    trigger: <Button variant="ghost">File ▾</Button>,
    children: (
      <>
        <MenuItem>New</MenuItem>
        <MenuItem>Open</MenuItem>
        <MenuItem>Save</MenuItem>
      </>
    ),
  },
};
