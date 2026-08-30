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
  args: {} as any,
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

/**
 * A tooltip on a `disabled` native button — the case that used to silently
 * never show. Hover (or tab to) the button below; the reason it's disabled
 * should appear same as any other tooltip.
 */
export const OnADisabledTrigger: Story = {
  args: {} as any,
  render: () => (
    <Tooltip content="You need speaker permission to unmute">
      <button type="button" disabled style={{ padding: "0.5rem 1rem" }}>
        Unmute
      </button>
    </Tooltip>
  ),
};

/**
 * No `aria-label` written anywhere here — inspect the trigger in devtools
 * and its accessible name should already be "Delete conversation", filled
 * in from `content` because the child sets neither `aria-label` nor
 * `aria-labelledby` itself.
 */
export const AutoFilledAccessibleName: Story = {
  args: {} as any,
  render: () => (
    <Tooltip content="Delete conversation">
      <Button variant="danger" iconOnly round>
        🗑
      </Button>
    </Tooltip>
  ),
};
