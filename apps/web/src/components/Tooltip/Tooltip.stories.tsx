import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/Button";
import { Tooltip, TooltipProvider } from "./Tooltip";

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <TooltipProvider><Story /></TooltipProvider>],
  argTypes: {
    side: { control: "select", options: ["top", "right", "bottom", "left"] },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: "Copy to clipboard",
    children: <Button variant="ghost">Copy</Button>,
  },
};

export const Right: Story = {
  args: {
    side: "right",
    content: "Opens settings",
    children: <Button variant="secondary">Settings</Button>,
  },
};

export const AllSides: Story = {
  render: () => (
    <TooltipProvider>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
        <Tooltip content="Top" side="top"><Button variant="ghost">Top</Button></Tooltip>
        <Tooltip content="Right" side="right"><Button variant="ghost">Right</Button></Tooltip>
        <Tooltip content="Bottom" side="bottom"><Button variant="ghost">Bottom</Button></Tooltip>
        <Tooltip content="Left" side="left"><Button variant="ghost">Left</Button></Tooltip>
      </div>
    </TooltipProvider>
  ),
};
