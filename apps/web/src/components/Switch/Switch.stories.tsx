import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./Switch";

const meta = {
  title: "Components/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: { "aria-label": "Enable notifications" },
};

export const On: Story = {
  args: { "aria-label": "Enable notifications", defaultChecked: true },
};

export const Disabled: Story = {
  args: { "aria-label": "Managed by org", disabled: true, defaultChecked: true },
};

export const WithLabel: Story = {
  render: () => (
    <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
      <Switch defaultChecked />
      <span style={{ fontSize: "0.875rem" }}>Enable desktop notifications</span>
    </label>
  ),
};
