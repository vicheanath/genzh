import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/Button";
import { Dialog } from "./Dialog";

const meta = {
  title: "Components/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Informational: Story = {
  args: {
    trigger: <Button variant="secondary">View terms</Button>,
    title: "Terms of Service",
    description: "Last updated January 2025",
    children: (
      <p style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
        By using this service you agree to our terms and conditions. These terms govern your
        use of the platform and its features.
      </p>
    ),
  },
};

export const WithConfirm: Story = {
  args: {
    trigger: <Button variant="primary">Edit profile</Button>,
    title: "Edit profile",
    description: "Update your display name and avatar.",
    confirmLabel: "Save",
    cancelLabel: "Discard",
    children: (
      <p style={{ fontSize: "0.875rem" }}>Form fields would go here.</p>
    ),
  },
};
