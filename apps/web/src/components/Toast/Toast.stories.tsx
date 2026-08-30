import type { Meta, StoryObj } from "@storybook/react";
import { Toast } from "@base-ui/react/toast";
import { Button } from "@/components/Button";
import { ToastProvider } from "./Toast";

const meta = {
  title: "Components/Toast",
  component: ToastProvider,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function ToastDemo() {
  const { add } = Toast.useToastManager();
  return (
    <div style={{ padding: "2rem", display: "flex", gap: "0.75rem" }}>
      <Button
        variant="primary"
        onClick={() => add({ title: "Invite sent!", description: "alice@example.com was invited." })}
      >
        Show success toast
      </Button>
      <Button
        variant="danger"
        onClick={() => add({ title: "Failed to send", type: "error" })}
      >
        Show error toast
      </Button>
    </div>
  );
}

export const Default: Story = {
  args: {} as any,
  render: () => (
    <ToastProvider>
      <Toast.Provider>
        <ToastDemo />
      </Toast.Provider>
    </ToastProvider>
  ),
};
