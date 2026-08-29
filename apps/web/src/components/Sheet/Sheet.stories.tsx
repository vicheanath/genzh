import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/Button";
import { Sheet } from "./Sheet";

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    side: { control: "select", options: ["start", "bottom"] },
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FromStart: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <div style={{ padding: "2rem" }}>
          <Button variant="secondary" onClick={() => setOpen(true)}>Open sidebar</Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen} title="Navigation" side="start">
          <div style={{ padding: "1.5rem", width: "260px" }}>
            <p style={{ fontSize: "0.875rem" }}>Navigation content goes here.</p>
          </div>
        </Sheet>
      </>
    );
  },
};

export const FromBottom: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <div style={{ padding: "2rem" }}>
          <Button variant="secondary" onClick={() => setOpen(true)}>Open bottom sheet</Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen} title="Actions" side="bottom">
          <div style={{ padding: "1.5rem" }}>
            <p style={{ fontSize: "0.875rem" }}>Quick action content goes here.</p>
          </div>
        </Sheet>
      </>
    );
  },
};
