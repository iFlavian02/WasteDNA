/** Presentation data for the personal account home (demo only, no API calls yet). */

export const personalKpis = [
  { label: 'Food rescued', detail: 'This month', value: '12.4 kg', change: '18% more than last month', icon: 'leaf', tone: 'green' },
  { label: 'Money saved', detail: 'This month', value: '186 RON', change: 'vs. full menu prices', icon: 'coins', tone: 'green' },
]

export const recentRescues = [
  { id: 'r1', place: 'Bistro Copou', item: 'Sarmale cu mămăligă · 2 portions', when: 'Today, 20:15', saved: 38 },
  { id: 'r2', place: 'Demo Market Păcurari', item: 'Bread and pastries bag', when: 'Yesterday, 19:40', saved: 22 },
  { id: 'r3', place: 'Hotel Luc Berlin', item: 'Papanași · 3 portions', when: '12 Oct, 21:05', saved: 41 },
]

/** Total RON saved across the listed rescues. */
export const totalSaved = rescues => rescues.reduce((sum, rescue) => sum + rescue.saved, 0)
