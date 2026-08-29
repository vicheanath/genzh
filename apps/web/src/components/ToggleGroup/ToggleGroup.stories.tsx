import type { Meta, StoryObj } from "@storybook/react";
import { ToggleGroup, Toggle } from "./ToggleGroup";

const meta = {
  title: "Components/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "select", options: ["contained", "loose"] },
    size: { control: "select", options: ["sm", "md"] },
  },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Contained: Story = {
  render: () => (
    <ToggleGroup variant="contained" aria-label="Text formatting">
      <Toggle value="bold" aria-label="Bold"><b>B</b></Toggle>
      <Toggle value="italic" aria-label="Italic"><i>I</i></Toggle>
      <Toggle value="underline" aria-label="Underline"><u>U</u></Toggle>
    </ToggleGroup>
  ),
};

export const Loose: Story = {
  render: () => (
    <ToggleGroup variant="loose" multiple aria-label="Filters">
      <Toggle value="online">Online</Toggle>
      <Toggle value="friends">Friends</Toggle>
      <Toggle value="recent">Recent</Toggle>
    </ToggleGroup>
  ),
};

export const Small: Story = {
  render: () => (
    <ToggleGroup size="sm" aria-label="View mode">
      <Toggle value="grid">Grid</Toggle>
      <Toggle value="list">List</Toggle>
    </ToggleGroup>
  ),
};
