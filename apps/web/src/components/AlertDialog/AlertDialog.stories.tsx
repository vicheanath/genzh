import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "@/components/Button";
import { AlertDialog } from "./AlertDialog";

const meta = {
  title: "Components/AlertDialog",
  component: AlertDialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    tone: { control: "select", options: ["default", "danger"] },
  },
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Leave community?",
    description: "You can always rejoin this community later.",
    confirmLabel: "Leave",
    cancelLabel: "Cancel",
    trigger: <Button variant="secondary">Leave community</Button>,
  },
};

export const Danger: Story = {
  args: {
    tone: "danger",
    title: "Delete community?",
    description:
      "This will permanently delete the community and all its content. This action cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    trigger: <Button variant="danger">Delete community</Button>,
  },
};

export const NoDescription: Story = {
  args: {
    title: "Are you sure?",
    confirmLabel: "Yes",
    cancelLabel: "No",
    trigger: <Button variant="primary">Open</Button>,
  },
};
