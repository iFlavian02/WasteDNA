/** Menu per demo account (docs/ACCOUNTS.md). Help is added to every menu. */
export const NAVIGATION = {
  business: [
    { id: 'overview', label: 'Overview', icon: 'overview', to: '/dashboard' },
    { id: 'categories', label: 'Statistics', icon: 'categories', to: '/diagnostics' },
    { id: 'goals', label: 'Actions', icon: 'goals', to: '/decisions/actions' },
    { id: 'tracked', label: 'Orders', icon: 'tracked', to: '/redistribution' },
    { id: 'settings', label: 'Data', icon: 'settings', to: '/upload' },
  ],
  personal: [
    { id: 'overview', label: 'Food map', icon: 'map', to: '/personal' },
    { id: 'orders', label: 'Orders', icon: 'bag', to: '/personal/orders' },
  ],
}
