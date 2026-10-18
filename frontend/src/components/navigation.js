/** Menu per demo account (docs/ACCOUNTS.md). Help is added to every menu. */
export const NAVIGATION = {
  business: [
    { id: 'overview', label: 'Overview', icon: 'overview', to: '/dashboard' },
    { id: 'categories', label: 'Categories', icon: 'categories', to: '/diagnostics' },
    { id: 'goals', label: 'My goals', icon: 'goals', to: '/decisions/actions' },
    { id: 'tracked', label: 'Tracked items', icon: 'tracked', to: '/redistribution' },
    { id: 'settings', label: 'Settings', icon: 'settings', to: '/upload' },
  ],
  personal: [
    { id: 'overview', label: 'Food map', icon: 'map', to: '/personal' },
    { id: 'orders', label: 'Orders', icon: 'bag', to: '/personal/orders' },
  ],
}
