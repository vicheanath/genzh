import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./Select";

const meta = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const languages = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "zh", label: "Chinese" },
] as const;

export const Default: Story = {
  args: {} as any,
  render: () => {
    const [value, setValue] = useState<string>("en");
    return (
      <Select
        aria-label="Language"
        value={value}
        onValueChange={setValue}
        options={languages}
      />
    );
  },
};

export const WithPlaceholder: Story = {
  args: {} as any,
  render: () => {
    const [value, setValue] = useState<string>("");
    return (
      <Select
        aria-label="Language"
        value={value}
        onValueChange={setValue}
        options={languages}
        placeholder="Choose a language…"
      />
    );
  },
};

export const Disabled: Story = {
  args: {} as any,
  render: () => (
    <Select
      aria-label="Language"
      value="en"
      onValueChange={() => {}}
      options={languages}
      disabled
    />
  ),
};
