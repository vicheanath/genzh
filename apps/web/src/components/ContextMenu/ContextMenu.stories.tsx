import type { Meta, StoryObj } from "@storybook/react";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "./ContextMenu";

const meta = {
  title: "Components/ContextMenu",
  component: ContextMenu,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = (
  <>
    <ContextMenuItem>Edit</ContextMenuItem>
    <ContextMenuItem>Copy link</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem tone="danger">Delete</ContextMenuItem>
  </>
);

export const Default: Story = {
  args: {
    items,
    children: (
      <div
        style={{
          padding: "2rem",
          border: "2px dashed var(--color-border-strong, #ccc)",
          borderRadius: "0.5rem",
          color: "var(--color-text-muted, #666)",
          fontSize: "0.875rem",
        }}
      >
        Right-click or long-press here
      </div>
    ),
  },
};
