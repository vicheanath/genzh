import { useState } from 'react'

import { GemIcon, PackageIcon, SparklesIcon, StoreIcon, UsersIcon } from '@/components/Icons'
import { Tab, TabPanel, TabsList, TabsRoot } from '@/components/Tabs'

import { InventoryPanel } from './InventoryPanel'
import { LedgerPanel } from './LedgerPanel'
import { OutfitStudioPanel } from './OutfitStudioPanel'
import { ReferralHub } from './ReferralHub'
import { StoreGrid } from './StoreGrid'
import { WalletStrip } from './WalletStrip'
import styles from './rewards.module.css'

/**
 * Everything to do with points, cosmetics, and styling in one screen.
 */
export function RewardsRoute() {
  const [tab, setTab] = useState('store')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Rewards & Cosmetics</h1>
          <p className={styles.subtitle}>
            Earn points through daily check-ins and referrals. Customize your avatar, name typography, particle auras, and chat bubbles.
          </p>
        </div>
      </header>

      <WalletStrip />

      <TabsRoot value={tab} onValueChange={(value) => setTab(value as string)}>
        <TabsList>
          <Tab value="store">
            <StoreIcon size={15} /> Store
          </Tab>
          <Tab value="studio">
            <SparklesIcon size={15} /> Outfit Studio
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
        <TabPanel value="studio">
          <OutfitStudioPanel />
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
