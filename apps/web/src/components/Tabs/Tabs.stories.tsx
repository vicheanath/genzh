import type { Meta, StoryObj } from "@storybook/react";
import { Tabs } from "./Tabs";

const meta = {
  title: "Components/Tabs",
  component: Tabs.Root,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tabs.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {
  render: () => (
    <Tabs.Root defaultValue="messages" style={{ width: "320px" }}>
      <Tabs.List variant="line">
        <Tabs.Tab value="messages">Messages</Tabs.Tab>
        <Tabs.Tab value="members">Members</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="messages"><p style={{ padding: "1rem", fontSize: "0.875rem" }}>Messages panel</p></Tabs.Panel>
      <Tabs.Panel value="members"><p style={{ padding: "1rem", fontSize: "0.875rem" }}>Members panel</p></Tabs.Panel>
      <Tabs.Panel value="settings"><p style={{ padding: "1rem", fontSize: "0.875rem" }}>Settings panel</p></Tabs.Panel>
    </Tabs.Root>
  ),
};

export const Pill: Story = {
  render: () => (
    <Tabs.Root defaultValue="all">
      <Tabs.List variant="pill">
        <Tabs.Tab value="all">All</Tabs.Tab>
        <Tabs.Tab value="online">Online</Tabs.Tab>
        <Tabs.Tab value="offline">Offline</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="all"><p style={{ padding: "1rem", fontSize: "0.875rem" }}>All members</p></Tabs.Panel>
      <Tabs.Panel value="online"><p style={{ padding: "1rem", fontSize: "0.875rem" }}>Online members</p></Tabs.Panel>
      <Tabs.Panel value="offline"><p style={{ padding: "1rem", fontSize: "0.875rem" }}>Offline members</p></Tabs.Panel>
    </Tabs.Root>
  ),
};

export const Rail: Story = {
  render: () => (
    <Tabs.Root defaultValue="account" orientation="vertical" style={{ display: "flex", gap: "1rem" }}>
      <Tabs.List variant="rail">
        <Tabs.Tab value="account">Account</Tabs.Tab>
        <Tabs.Tab value="privacy">Privacy</Tabs.Tab>
        <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
      </Tabs.List>
      <div>
        <Tabs.Panel value="account"><p style={{ fontSize: "0.875rem" }}>Account settings</p></Tabs.Panel>
        <Tabs.Panel value="privacy"><p style={{ fontSize: "0.875rem" }}>Privacy settings</p></Tabs.Panel>
        <Tabs.Panel value="notifications"><p style={{ fontSize: "0.875rem" }}>Notification preferences</p></Tabs.Panel>
      </div>
    </Tabs.Root>
  ),
};
