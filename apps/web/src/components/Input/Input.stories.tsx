import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => <div style={{ width: "320px" }}><Story /></div>,
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Username", placeholder: "e.g. alice_wonder" },
};

export const WithDescription: Story = {
  args: {
    label: "Email",
    type: "email",
    placeholder: "you@example.com",
    description: "We will send a verification link to this address.",
  },
};

export const WithError: Story = {
  args: {
    label: "Password",
    type: "password",
    value: "short",
    error: "Password must be at least 8 characters.",
  },
};

export const Disabled: Story = {
  args: {
    label: "Managed email",
    value: "admin@corp.example",
    disabled: true,
  },
};
