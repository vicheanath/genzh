import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/Button";
import { Popover } from "./Popover";

const meta = {
  title: "Components/Popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    side: { control: "select", options: ["top", "right", "bottom", "left"] },
    align: { control: "select", options: ["start", "center", "end"] },
    arrow: { control: "boolean" },
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button variant="secondary">Open popover</Button>,
    title: "Notification settings",
    children: (
      <p style={{ fontSize: "0.875rem", margin: 0 }}>
        Choose which events should notify you.
      </p>
    ),
  },
};

export const WithArrow: Story = {
  args: {
    trigger: <Button variant="primary">Show tip</Button>,
    arrow: true,
    children: <p style={{ fontSize: "0.875rem", margin: 0 }}>This is a popover with an arrow pointer.</p>,
  },
};

export const TopSide: Story = {
  args: {
    trigger: <Button variant="ghost">Above</Button>,
    side: "top",
    children: <p style={{ fontSize: "0.875rem", margin: 0 }}>Opens above the trigger.</p>,
  },
};
