import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup, Radio } from "./RadioGroup";

const meta = {
  title: "Components/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "select", options: ["list", "cards"] },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  render: () => (
    <RadioGroup defaultValue="friends" aria-label="Privacy setting">
      <Radio value="everyone" label="Everyone" hint="Anyone can find and message you." />
      <Radio value="friends" label="Friends only" hint="Only people you have added." />
      <Radio value="nobody" label="Nobody" hint="Fully private mode." />
    </RadioGroup>
  ),
};

export const Cards: Story = {
  render: () => (
    <RadioGroup variant="cards" defaultValue="dark" aria-label="Theme">
      <Radio value="light" icon="☀️" label="Light" hint="White background" />
      <Radio value="dark" icon="🌙" label="Dark" hint="Dark background" />
      <Radio value="system" icon="💻" label="System" hint="Follow OS setting" />
    </RadioGroup>
  ),
};
