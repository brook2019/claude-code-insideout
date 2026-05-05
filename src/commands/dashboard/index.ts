/**
 * Dashboard command - launches the real-time monitoring dashboard
 * Implementation is lazy-loaded to reduce startup time
 */
import type { Command } from '../../commands.js'

const dashboard = {
  type: 'local',
  name: 'dashboard',
  description: 'Launch the real-time monitoring dashboard for query visualization',
  isHidden: false,
  supportsNonInteractive: false,
  load: () => import('./dashboard.js'),
} satisfies Command

export default dashboard
