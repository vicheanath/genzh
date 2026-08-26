import { useState } from 'react'

import { GemIcon, PackageIcon, StoreIcon, UsersIcon } from '@/components/Icons'
import { Tab, TabPanel, TabsList, TabsRoot } from '@/components/Tabs'

import { InventoryPanel } from './InventoryPanel'
import { LedgerPanel } from './LedgerPanel'
import { ReferralHub } from './ReferralHub'
import { StoreGrid } from './StoreGrid'
import { WalletStrip } from './WalletStrip'
import styles from './rewards.module.css'

/**
 * Everything to do with points, in one screen.
 *
 * The wallet sits above the tabs rather than inside one of them: the balance is
 * what decides whether a purchase is possible, so it stays visible from the tab
 * where purchases happen.
 */
export function RewardsRoute() {
  const [tab, setTab] = useState('store')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Rewards</h1>
          <p className={styles.subtitle}>
            Earn points by showing up and bringing people with you. Spend them on how you look in
            every room.
          </p>
        </div>
      </header>

      <WalletStrip />

      <TabsRoot value={tab} onValueChange={(value) => setTab(value as string)}>
        <TabsList>
          <Tab value="store">
            <StoreIcon size={15} /> Store
          </Tab>
          <Tab value="inventory">
            <PackageIcon size={15} /> Your items
          </Tab>
          <Tab value="referrals">
            <UsersIcon size={15} /> Invite friends
          </Tab>
          <Tab value="history">
            <GemIcon size={15} /> History
          </Tab>
        </TabsList>

        <TabPanel value="store">
          <StoreGrid />
        </TabPanel>
        <TabPanel value="inventory">
          <InventoryPanel />
        </TabPanel>
        <TabPanel value="referrals">
          <ReferralHub />
        </TabPanel>
        <TabPanel value="history">
          <LedgerPanel />
        </TabPanel>
      </TabsRoot>
    </div>
  )
}
