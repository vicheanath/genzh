import type { Meta, StoryObj } from "@storybook/react";
import { ScrollArea } from "./ScrollArea";

const meta = {
  title: "Components/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
  argTypes: {
    fade: { control: "boolean" },
  },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const longList = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`);

export const Default: Story = {
  render: () => (
    <ScrollArea style={{ height: "200px", width: "220px", border: "1px solid var(--color-border-strong, #ccc)", borderRadius: "0.5rem" }}>
      {longList.map((item) => (
        <div key={item} style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}>{item}</div>
      ))}
    </ScrollArea>
  ),
};

export const WithFade: Story = {
  render: () => (
    <ScrollArea fade style={{ height: "200px", width: "220px", border: "1px solid var(--color-border-strong, #ccc)", borderRadius: "0.5rem" }}>
      {longList.map((item) => (
        <div key={item} style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}>{item}</div>
      ))}
    </ScrollArea>
  ),
};
